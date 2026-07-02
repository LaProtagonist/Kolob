#!/usr/bin/env python3
import csv
import hashlib
import hmac
import html
import json
import os
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs


HOST = os.environ.get("CONTACT_SERVER_HOST", "127.0.0.1")
PORT = int(os.environ.get("CONTACT_SERVER_PORT", "8787"))
DATA_DIR = Path(os.environ.get("CONTACT_DATA_DIR", "runtime-data"))
LEADS_FILE = Path(os.environ.get("CONTACT_LEADS_FILE", str(DATA_DIR / "contacts.jsonl")))
ADMIN_PASSWORD = os.environ.get("CONTACT_ADMIN_PASSWORD", "")
ADMIN_SECRET = os.environ.get("CONTACT_ADMIN_SECRET", ADMIN_PASSWORD or "kolob-local-admin")
COOKIE_NAME = "kolob_leads_auth"
MAX_BODY_BYTES = 64 * 1024


def clean(value, limit=2000):
    return " ".join(str(value or "").split())[:limit]


def token():
    return hashlib.sha256(f"{ADMIN_PASSWORD}:{ADMIN_SECRET}".encode("utf-8")).hexdigest()


def parse_cookies(header):
    cookies = {}
    for part in (header or "").split(";"):
        if "=" in part:
            key, value = part.strip().split("=", 1)
            cookies[key] = value
    return cookies


def is_authorized(handler):
    if not ADMIN_PASSWORD:
        return False
    cookie = parse_cookies(handler.headers.get("Cookie")).get(COOKIE_NAME, "")
    return hmac.compare_digest(cookie, token())


def escape(value):
    return html.escape(str(value or ""), quote=True)


def layout(title, body):
    return f"""<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{escape(title)}</title>
  <style>
    :root {{ font-family: Arial, sans-serif; color: #171717; background: #f7f1e6; }}
    body {{ margin: 0; padding: 32px; }}
    main {{ max-width: 1180px; margin: 0 auto; }}
    h1 {{ margin: 0 0 24px; font-size: clamp(32px, 5vw, 56px); line-height: .98; }}
    p {{ color: #65615b; line-height: 1.55; }}
    a, button {{ font: inherit; }}
    .panel {{ padding: 28px; border-radius: 24px; background: #fffaf0; box-shadow: 0 18px 60px rgba(23, 23, 23, .08); }}
    .login {{ display: grid; gap: 16px; max-width: 420px; }}
    input {{ min-height: 48px; padding: 0 14px; border: 1px solid rgba(23,23,23,.18); border-radius: 14px; font-size: 16px; }}
    button, .button {{ display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: 0 18px; border: 0; border-radius: 14px; background: #f7b91e; color: #171717; font-weight: 900; text-decoration: none; cursor: pointer; }}
    .toolbar {{ display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 18px; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 14px; background: white; border-radius: 18px; overflow: hidden; }}
    th, td {{ padding: 12px 10px; border-bottom: 1px solid rgba(23,23,23,.1); text-align: left; vertical-align: top; }}
    th {{ background: #171717; color: #f7b91e; white-space: nowrap; }}
    td {{ max-width: 260px; }}
    .empty {{ padding: 32px; border-radius: 18px; background: #fff; }}
    @media (max-width: 760px) {{
      body {{ padding: 18px; }}
      .panel {{ padding: 20px; }}
      table, thead, tbody, tr, th, td {{ display: block; }}
      thead {{ display: none; }}
      tr {{ padding: 14px 0; border-bottom: 1px solid rgba(23,23,23,.1); }}
      td {{ max-width: none; border: 0; padding: 6px 0; }}
      td::before {{ content: attr(data-label); display: block; margin-bottom: 2px; color: #8a6a08; font-size: 12px; font-weight: 900; text-transform: uppercase; }}
    }}
  </style>
</head>
<body><main>{body}</main></body>
</html>"""


def login_page(message=""):
    return layout(
        "Заявки Колобочной",
        f"""<section class="panel">
  <h1>Заявки</h1>
  <p>Введите пароль для просмотра оставленных контактов.</p>
  {f'<p>{escape(message)}</p>' if message else ''}
  <form class="login" method="post" action="/leads/login">
    <input name="password" type="password" autocomplete="current-password" placeholder="Пароль" required autofocus>
    <button type="submit">Открыть заявки</button>
  </form>
</section>""",
    )


def read_leads():
    if not LEADS_FILE.exists():
        return []
    leads = []
    for line in LEADS_FILE.read_text("utf-8").splitlines():
        if line.strip():
            leads.append(json.loads(line))
    return sorted(leads, key=lambda item: str(item.get("createdAt", "")), reverse=True)


def leads_page(leads):
    rows = []
    for lead in leads:
        created = lead.get("createdAt", "")
        try:
            created = datetime.fromisoformat(created.replace("Z", "+00:00")).strftime("%d.%m.%Y, %H:%M")
        except Exception:
            pass
        rows.append(
            f"""<tr>
  <td data-label="Дата">{escape(created)}</td>
  <td data-label="Имя">{escape(lead.get('name'))}</td>
  <td data-label="Компания">{escape(lead.get('company'))}</td>
  <td data-label="Должность">{escape(lead.get('role'))}</td>
  <td data-label="Контакт">{escape(lead.get('contact'))}</td>
  <td data-label="Email">{escape(lead.get('email'))}</td>
  <td data-label="Интерес">{escape(lead.get('interest'))}</td>
  <td data-label="Комментарий">{escape(lead.get('comment'))}</td>
</tr>"""
        )
    table = (
        f"""<table>
  <thead><tr><th>Дата</th><th>Имя</th><th>Компания</th><th>Должность</th><th>Контакт</th><th>Email</th><th>Интерес</th><th>Комментарий</th></tr></thead>
  <tbody>{''.join(rows)}</tbody>
</table>"""
        if leads
        else '<p class="empty">Заявок пока нет.</p>'
    )
    return layout(
        "Заявки Колобочной",
        f"""<section class="panel">
  <h1>Заявки</h1>
  <div class="toolbar">
    <a class="button" href="/api/leads.csv">Скачать CSV</a>
    <a class="button" href="/leads">Обновить</a>
    <a class="button" href="/leads/logout">Выйти</a>
  </div>
  {table}
</section>""",
    )


def normalize_lead(payload, handler):
    name = clean(payload.get("name"), 200)
    company = clean(payload.get("company"), 300)
    role = clean(payload.get("role"), 300)
    contact = clean(payload.get("contact"), 300)
    email = clean(payload.get("email"), 300)
    interest = clean(payload.get("interest"), 300)
    comment = clean(payload.get("comment"), 3000)
    consent = payload.get("consent") in (True, "true", "on", "1", 1)

    if not name:
        return None, "Укажите имя."
    if not contact and not email:
        return None, "Укажите телефон, Telegram или email."
    if email and ("@" not in email or "." not in email.split("@")[-1]):
        return None, "Укажите корректный email."
    if not consent:
        return None, "Подтвердите согласие на обработку данных."

    forwarded = clean(handler.headers.get("X-Forwarded-For"), 500)
    ip = forwarded.split(",")[0].strip() if forwarded else handler.client_address[0]

    return {
        "id": str(uuid.uuid4()),
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "name": name,
        "company": company,
        "role": role,
        "contact": contact,
        "email": email,
        "interest": interest,
        "comment": comment,
        "consent": True,
        "source": "colob.spi.ski",
        "meta": {
            "ip": ip,
            "userAgent": clean(handler.headers.get("User-Agent"), 600),
            "referer": clean(handler.headers.get("Referer"), 600),
        },
    }, None


class Handler(BaseHTTPRequestHandler):
    server_version = "KolobContact/1.0"

    def log_message(self, format, *args):
        return

    def read_body(self):
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length > MAX_BODY_BYTES:
            raise ValueError("Body too large")
        return self.rfile.read(length)

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_html(self, status, content, headers=None):
        body = content.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def send_text(self, status, content, content_type="text/plain; charset=utf-8", headers=None):
        body = content.encode("utf-8-sig" if content_type.startswith("text/csv") else "utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def redirect(self, location, headers=None):
        self.send_response(303)
        self.send_header("Location", location)
        self.send_header("Cache-Control", "no-store")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self.send_json(200, {"ok": True})
            return
        if self.path == "/leads/logout":
            self.redirect("/leads", {"Set-Cookie": f"{COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"})
            return
        if self.path == "/leads":
            if not is_authorized(self):
                self.send_html(200, login_page())
                return
            self.send_html(200, leads_page(read_leads()))
            return
        if self.path == "/api/leads":
            if not is_authorized(self):
                self.send_json(401, {"ok": False, "error": "Unauthorized"})
                return
            self.send_json(200, {"ok": True, "leads": read_leads()})
            return
        if self.path == "/api/leads.csv":
            if not is_authorized(self):
                self.send_text(401, "Unauthorized")
                return
            rows = read_leads()
            columns = ["createdAt", "name", "company", "role", "contact", "email", "interest", "comment", "ip"]
            output = []
            output.append(",".join(columns))
            for lead in rows:
                output.append(
                    ",".join(
                        csv_quote(value)
                        for value in [
                            lead.get("createdAt"),
                            lead.get("name"),
                            lead.get("company"),
                            lead.get("role"),
                            lead.get("contact"),
                            lead.get("email"),
                            lead.get("interest"),
                            lead.get("comment"),
                            lead.get("meta", {}).get("ip"),
                        ]
                    )
                )
            self.send_text(
                200,
                "\n".join(output),
                "text/csv; charset=utf-8",
                {"Content-Disposition": 'attachment; filename="kolob-contacts.csv"'},
            )
            return
        self.send_text(404, "Not found")

    def do_POST(self):
        if self.path == "/api/contact":
            try:
                payload = json.loads(self.read_body().decode("utf-8") or "{}")
            except Exception:
                self.send_json(400, {"ok": False, "error": "Некорректный запрос."})
                return
            lead, error = normalize_lead(payload, self)
            if error:
                self.send_json(422, {"ok": False, "error": error})
                return
            LEADS_FILE.parent.mkdir(parents=True, exist_ok=True)
            with LEADS_FILE.open("a", encoding="utf-8") as file:
                file.write(json.dumps(lead, ensure_ascii=False) + "\n")
            self.send_json(200, {"ok": True})
            return
        if self.path == "/leads/login":
            if not ADMIN_PASSWORD:
                self.send_html(503, login_page("Пароль администратора не настроен на сервере."))
                return
            params = parse_qs(self.read_body().decode("utf-8"))
            password = params.get("password", [""])[0]
            if not hmac.compare_digest(hashlib.sha256(password.encode()).hexdigest(), hashlib.sha256(ADMIN_PASSWORD.encode()).hexdigest()):
                self.send_html(401, login_page("Неверный пароль."))
                return
            self.redirect("/leads", {"Set-Cookie": f"{COOKIE_NAME}={token()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800; Secure"})
            return
        self.send_text(404, "Not found")


def csv_quote(value):
    return '"' + str(value or "").replace('"', '""') + '"'


if __name__ == "__main__":
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Kolob contact server listening on http://{HOST}:{PORT}")
    print(f"Leads file: {LEADS_FILE}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
