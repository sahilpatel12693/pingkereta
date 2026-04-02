
from flask import Flask, render_template, request, redirect, url_for
import uuid

app = Flask(__name__)

data_store = {}

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
        data_store[code] = {
            "name": name or "Owner",
            "contact": contact or "-",
            "plate": plate or "-",
            "notif": notif,
            "messages": []
        }
        return redirect(url_for("dashboard", code=code))

    return render_template("register.html")

@app.route("/dashboard/<code>")
def dashboard(code):
    user = data_store.get(code)
    if not user:
        return "Sticker not found", 404
    return render_template("dashboard.html", code=code, user=user)

@app.route("/s/<code>")
def sticker(code):
    user = data_store.get(code)
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
    user = data_store.get(code)
    if not user:
        return "Sticker not found", 404

    message = messages_map.get(msg, "Unknown message")
    user["messages"].insert(0, message)
    return render_template("sent.html", code=code, message=message)

@app.route("/custom/<code>", methods=["GET", "POST"])
def custom_message(code):
    user = data_store.get(code)
    if not user:
        return "Sticker not found", 404

    if request.method == "POST":
        text = request.form.get("message", "").strip()
        if text:
            user["messages"].insert(0, f"Mesej khas (Custom message): {text}")
            return render_template("sent.html", code=code, message=f"Mesej khas dihantar (Custom message sent): {text}")
    return render_template("custom.html", code=code, user=user)

import os
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
