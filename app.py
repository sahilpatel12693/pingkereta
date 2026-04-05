from flask import Flask, render_template, request, redirect, url_for, g
import uuid
import requests
import os
import sqlite3

app = Flask(__name__)

DATABASE = "pingkereta.db"
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")


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
            message TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(owner_id) REFERENCES owners(id)
        )
    """)
    db.commit()


def send_telegram(chat_id, text):
    if not TELEGRAM_BOT_TOKEN:
        return False, "Missing TELEGRAM_BOT_TOKEN"

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

        db = get_db()
        db.execute("""
            INSERT INTO owners (code, name, contact, plate, notif)
            VALUES (?, ?, ?, ?, ?)
        """, (
            code,
            name or "Owner",
            contact or "-",
            plate or "-",
            notif
        ))
        db.commit()

        return redirect(url_for("dashboard", code=code))

    return render_template("register.html")


@app.route("/dashboard/<code>")
def dashboard(code):
    db = get_db()
    user = db.execute("SELECT * FROM owners WHERE code = ?", (code,)).fetchone()

    if not user:
        return "Sticker not found", 404

    messages = db.execute("""
        SELECT message, created_at
        FROM alerts
        WHERE owner_id = ?
        ORDER BY id DESC
    """, (user["id"],)).fetchall()

    return render_template("dashboard.html", code=code, user=user, messages=messages)


@app.route("/s/<code>")
def sticker(code):
    db = get_db()
    user = db.execute("SELECT * FROM owners WHERE code = ?", (code,)).fetchone()

    if not user:
        return "Sticker not found", 404

    return render_template("sticker_page.html", code=code, user=user)


@app.route("/send/<code>/<msg>")
def send_message(code, msg):
    messages_map = {
        "block": "Kereta anda menghalang saya (Your car is blocking me)",
        "light": "Lampu kereta masih ON (Your car lights are still ON)",
        "emergency": "Sila datang segera (Please come immediately)",
        "issue": "Ada masalah pada kereta (There is an issue with the car)"
    }

    db = get_db()
    user = db.execute("SELECT * FROM owners WHERE code = ?", (code,)).fetchone()

    if not user:
        return "Sticker not found", 404

    message = messages_map.get(msg, "Unknown message")

    db.execute("""
        INSERT INTO alerts (owner_id, message)
        VALUES (?, ?)
    """, (user["id"], message))
    db.commit()

    chat_id = user["contact"].strip()

    telegram_text = (
        f"🚗 PingKereta Alert\n\n"
        f"Plate: {user['plate']}\n"
        f"Message: {message}"
    )

    ok, result = send_telegram(chat_id, telegram_text)

    return render_template(
        "sent.html",
        code=code,
        message=message + (" | Telegram sent" if ok else " | Telegram failed")
    )


@app.route("/custom/<code>", methods=["GET", "POST"])
def custom_message(code):
    db = get_db()
    user = db.execute("SELECT * FROM owners WHERE code = ?", (code,)).fetchone()

    if not user:
        return "Sticker not found", 404

    if request.method == "POST":
        text = request.form.get("message", "").strip()
        if text:
            final_message = f"Mesej khas (Custom message): {text}"

            db.execute("""
                INSERT INTO alerts (owner_id, message)
                VALUES (?, ?)
            """, (user["id"], final_message))
            db.commit()

            chat_id = user["contact"].strip()
            telegram_text = (
                f"🚗 PingKereta Alert\n\n"
                f"Plate: {user['plate']}\n"
                f"Message: {final_message}"
            )
            send_telegram(chat_id, telegram_text)

            return render_template(
                "sent.html",
                code=code,
                message=f"Mesej khas dihantar (Custom message sent): {text}"
            )

    return render_template("custom.html", code=code, user=user)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)