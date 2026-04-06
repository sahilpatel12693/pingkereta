from flask import Flask, render_template, request, redirect, url_for, g
import uuid
import requests
import os
import sqlite3
from datetime import datetime, timedelta

app = Flask(__name__)

DATABASE = "pingkereta.db"
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
BOT_USERNAME = "PingKereta_my_bot"


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DATABASE)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(error):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = get_db()

    db.execute("""
        CREATE TABLE IF NOT EXISTS owners (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE,
            owner_token TEXT UNIQUE,
            name TEXT,
            contact TEXT,
            plate TEXT,
            notif TEXT
        )
    """)

    db.execute("""
        CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_id INTEGER,
            message_type TEXT,
            message TEXT,
            created_at TEXT,
            FOREIGN KEY(owner_id) REFERENCES owners(id)
        )
    """)

    db.execute("""
        CREATE TABLE IF NOT EXISTS stickers (
            code TEXT PRIMARY KEY,
            is_used INTEGER DEFAULT 0
        )
    """)

    db.commit()


def send_telegram(chat_id, text):
    if not TELEGRAM_BOT_TOKEN:
        return False, "Missing TELEGRAM_BOT_TOKEN"

    if not chat_id:
        return False, "Missing chat_id"

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text
    }

    try:
        r = requests.post(url, json=payload, timeout=10)
        return r.ok, r.text
    except Exception as e:
        return False, str(e)


@app.before_request
def setup():
    init_db()


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        name = request.form.get("name", "").strip()
        contact = request.form.get("contact", "").strip()
        plate = request.form.get("plate", "").strip()
        notif = request.form.get("notif", "Telegram").strip()

        code = str(uuid.uuid4())[:8].upper()
        owner_token = str(uuid.uuid4())

        db = get_db()
        db.execute("""
            INSERT INTO owners (code, owner_token, name, contact, plate, notif)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            code,
            owner_token,
            name or "Owner",
            contact or "",
            plate or "-",
            notif
        ))
        db.commit()

        return redirect(url_for("dashboard", code=code))

    return render_template("register.html")


@app.route("/activate-sticker", methods=["POST"])
def activate_sticker():
    code = request.form.get("code", "").strip().upper()
    name = request.form.get("name", "").strip()
    plate = request.form.get("plate", "").strip()

    db = get_db()

    sticker = db.execute(
        "SELECT * FROM stickers WHERE code = ?",
        (code,)
    ).fetchone()

    if not sticker:
        return "Invalid sticker code", 400

    existing = db.execute(
        "SELECT * FROM owners WHERE code = ?",
        (code,)
    ).fetchone()

    if existing:
        return "Sticker already activated", 400

    owner_token = str(uuid.uuid4())

    db.execute("""
        INSERT INTO owners (code, owner_token, name, contact, plate, notif)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        code,
        owner_token,
        name or "Owner",
        "",
        plate or "-",
        "Telegram"
    ))

    db.execute(
        "UPDATE stickers SET is_used = 1 WHERE code = ?",
        (code,)
    )

    db.commit()
    return "Sticker activated successfully", 200


@app.route("/dashboard/<code>")
def dashboard(code):
    db = get_db()
    user = db.execute(
        "SELECT * FROM owners WHERE code = ?",
        (code,)
    ).fetchone()

    if not user:
        return "Sticker not found", 404

    messages = db.execute("""
        SELECT message, created_at
        FROM alerts
        WHERE owner_id = ?
        ORDER BY id DESC
    """, (user["id"],)).fetchall()

    connect_link = f"https://t.me/{BOT_USERNAME}?start={user['owner_token']}"

    return render_template(
        "dashboard.html",
        code=code,
        user=user,
        messages=messages,
        connect_link=connect_link
    )


@app.route("/owner/<owner_token>")
def owner_dashboard(owner_token):
    db = get_db()
    user = db.execute(
        "SELECT * FROM owners WHERE owner_token = ?",
        (owner_token,)
    ).fetchone()

    if not user:
        return "Owner dashboard not found", 404

    messages = db.execute("""
        SELECT message, created_at
        FROM alerts
        WHERE owner_id = ?
        ORDER BY id DESC
    """, (user["id"],)).fetchall()

    connect_link = f"https://t.me/{BOT_USERNAME}?start={user['owner_token']}"

    return render_template(
        "dashboard.html",
        code=user["code"],
        user=user,
        messages=messages,
        connect_link=connect_link
    )


@app.route("/s/<code>")
def sticker(code):
    db = get_db()

    sticker_row = db.execute(
        "SELECT * FROM stickers WHERE code = ?",
        (code,)
    ).fetchone()

    if not sticker_row:
        return "Invalid sticker", 404

    user = db.execute(
        "SELECT * FROM owners WHERE code = ?",
        (code,)
    ).fetchone()

    if not user:
        return render_template("register_by_qr.html", code=code)

    return render_template("sticker_page.html", code=code, user=user)


@app.route("/register/<code>", methods=["POST"])
def register_by_qr(code):
    name = request.form.get("name", "").strip()
    plate = request.form.get("plate", "").strip()

    db = get_db()

    sticker_row = db.execute(
        "SELECT * FROM stickers WHERE code = ?",
        (code,)
    ).fetchone()

    if not sticker_row:
        return "Invalid sticker code", 400

    existing = db.execute(
        "SELECT * FROM owners WHERE code = ?",
        (code,)
    ).fetchone()

    if existing:
        return "This sticker is already registered.", 400

    owner_token = str(uuid.uuid4())

    db.execute("""
        INSERT INTO owners (code, owner_token, name, contact, plate, notif)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        code,
        owner_token,
        name or "Owner",
        "",
        plate or "-",
        "Telegram"
    ))

    db.execute(
        "UPDATE stickers SET is_used = 1 WHERE code = ?",
        (code,)
    )

    db.commit()

    return redirect(url_for("dashboard", code=code))


@app.route("/send/<code>/<msg>")
def send_message(code, msg):
    messages_map = {
        "block": "Kereta anda menghalang saya (Your car is blocking me)",
        "light": "Lampu kereta masih ON (Your car lights are still ON)",
        "emergency": "Sila datang segera (Please come immediately)",
        "issue": "Ada masalah pada kereta (There is an issue with the car)"
    }

    db = get_db()
    user = db.execute(
        "SELECT * FROM owners WHERE code = ?",
        (code,)
    ).fetchone()

    if not user:
        return "Sticker not found", 404

    message = messages_map.get(msg, "Unknown message")
    now = datetime.utcnow().isoformat()

    recent = db.execute("""
        SELECT created_at
        FROM alerts
        WHERE owner_id = ? AND message_type = ?
        ORDER BY id DESC
        LIMIT 1
    """, (user["id"], msg)).fetchone()

    if recent and recent["created_at"]:
        try:
            last_time = datetime.fromisoformat(recent["created_at"])
            if datetime.utcnow() - last_time < timedelta(minutes=2):
                return render_template(
                    "sent.html",
                    code=code,
                    message="Alert recently sent. Please wait 2 minutes before sending again."
                )
        except ValueError:
            pass

    db.execute("""
        INSERT INTO alerts (owner_id, message_type, message, created_at)
        VALUES (?, ?, ?, ?)
    """, (user["id"], msg, message, now))
    db.commit()

    chat_id = (user["contact"] or "").strip()

    if not chat_id:
        return render_template(
            "sent.html",
            code=code,
            message=message + " | Telegram not connected yet"
        )

    telegram_text = (
        f"🚗 PingKereta Alert\n\n"
        f"Plate: {user['plate']}\n"
        f"Message: {message}\n"
        f"Time: {now}"
    )

    ok, result = send_telegram(chat_id, telegram_text)

    return render_template(
        "sent.html",
        code=code,
        message=message + (" | Telegram sent" if ok else f" | Telegram failed")
    )


@app.route("/custom/<code>", methods=["GET", "POST"])
def custom_message(code):
    db = get_db()
    user = db.execute(
        "SELECT * FROM owners WHERE code = ?",
        (code,)
    ).fetchone()

    if not user:
        return "Sticker not found", 404

    if request.method == "POST":
        text = request.form.get("message", "").strip()

        if text:
            now = datetime.utcnow().isoformat()

            recent = db.execute("""
                SELECT created_at
                FROM alerts
                WHERE owner_id = ? AND message_type = ?
                ORDER BY id DESC
                LIMIT 1
            """, (user["id"], "custom")).fetchone()

            if recent and recent["created_at"]:
                try:
                    last_time = datetime.fromisoformat(recent["created_at"])
                    if datetime.utcnow() - last_time < timedelta(minutes=2):
                        return render_template(
                            "sent.html",
                            code=code,
                            message="Custom alert recently sent. Please wait 2 minutes before sending again."
                        )
                except ValueError:
                    pass

            final_message = f"Mesej khas (Custom message): {text}"

            db.execute("""
                INSERT INTO alerts (owner_id, message_type, message, created_at)
                VALUES (?, ?, ?, ?)
            """, (user["id"], "custom", final_message, now))
            db.commit()

            chat_id = (user["contact"] or "").strip()

            if chat_id:
                telegram_text = (
                    f"🚗 PingKereta Alert\n\n"
                    f"Plate: {user['plate']}\n"
                    f"Message: {final_message}\n"
                    f"Time: {now}"
                )
                send_telegram(chat_id, telegram_text)

            return render_template(
                "sent.html",
                code=code,
                message=f"Mesej khas dihantar (Custom message sent): {text}"
            )

    return render_template("custom.html", code=code, user=user)


@app.route("/telegram-sync")
def telegram_sync():
    if not TELEGRAM_BOT_TOKEN:
        return {"status": "error", "message": "Missing TELEGRAM_BOT_TOKEN"}, 500

    db = get_db()

    try:
        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getUpdates"
        r = requests.get(url, timeout=15)
        data = r.json()
    except Exception as e:
        return {"status": "error", "message": str(e)}, 500

    if not data.get("ok"):
        return {"status": "error", "data": data}, 500

    linked_count = 0

    for item in data.get("result", []):
        message = item.get("message", {})
        text = message.get("text", "")
        chat = message.get("chat", {})
        chat_id = str(chat.get("id", ""))

        if text.startswith("/start"):
            parts = text.split()

            if len(parts) == 2:
                owner_token = parts[1]

                owner = db.execute(
                    "SELECT * FROM owners WHERE owner_token = ?",
                    (owner_token,)
                ).fetchone()

                if owner:
                    db.execute("""
                        UPDATE owners
                        SET contact = ?
                        WHERE owner_token = ?
                    """, (chat_id, owner_token))
                    db.commit()

                    linked_count += 1

                    send_telegram(
                        chat_id,
                        "✅ PingKereta connected successfully!"
                    )

    return {
        "status": "ok",
        "linked_count": linked_count
    }


@app.route("/add-test-sticker/<code>")
def add_test_sticker(code):
    db = get_db()
    db.execute(
        "INSERT OR IGNORE INTO stickers (code) VALUES (?)",
        (code.upper(),)
    )
    db.commit()
    return f"Sticker {code.upper()} added"


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)