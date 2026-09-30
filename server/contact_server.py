#!/usr/bin/env python3
import csv
import hashlib
import hmac
import html
import json
import mimetypes
import os
import threading
import time
import urllib.request
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlencode, urlsplit


HOST = os.environ.get("CONTACT_SERVER_HOST", "127.0.0.1")
PORT = int(os.environ.get("CONTACT_SERVER_PORT", "8787"))
DATA_DIR = Path(os.environ.get("CONTACT_DATA_DIR", "runtime-data"))
LEADS_FILE = Path(os.environ.get("CONTACT_LEADS_FILE", str(DATA_DIR / "contacts.jsonl")))
ADMIN_PASSWORD = os.environ.get("CONTACT_ADMIN_PASSWORD", "")
ADMIN_SECRET = os.environ.get("CONTACT_ADMIN_SECRET", ADMIN_PASSWORD or "kolob-local-admin")
ADMIN_LINK_KEY = os.environ.get("CONTACT_ADMIN_LINK_KEY", "")
ADMIN_LINK_KEY_FILE = Path(os.environ.get("CONTACT_ADMIN_LINK_KEY_FILE", str(DATA_DIR / "admin-link.key")))
ADMIN_LINK_KEY_MIN_LENGTH = 32
BRIDGE_FILE = Path(os.environ.get("CONTACT_BRIDGE_FILE", str(DATA_DIR / "google-bridge.json")))
BRIDGE_URL_PREFIX = os.environ.get("CONTACT_BRIDGE_URL_PREFIX", "https://script.google.com/")
BRIDGE_TIMEOUT_SECONDS = 12
# Writes wait for the sheet's own lock and a cold start of the script, so they get more time.
BRIDGE_WRITE_TIMEOUT_SECONDS = 40
BRIDGE_MAX_RESPONSE_BYTES = 2 * 1024 * 1024
INPUTS_SCHEMA_FILE = Path(os.environ.get("CONTACT_INPUTS_SCHEMA_FILE", str(Path(__file__).resolve().parent / "inputs-schema.json")))
INPUTS_CACHE_FILE = Path(os.environ.get("CONTACT_INPUTS_CACHE_FILE", str(DATA_DIR / "inputs-cache.json")))
INPUTS_MAX_AGE_SECONDS = int(os.environ.get("CONTACT_INPUTS_MAX_AGE", "30"))
INPUTS_LOCK = threading.Lock()
INPUTS_STATE = {"payload": None, "checked_at": 0.0, "marked": None, "refreshing": False}
BRIDGE_QUEUE_FILE = Path(os.environ.get("CONTACT_BRIDGE_QUEUE_FILE", str(DATA_DIR / "bridge-queue.jsonl")))
QUEUE_LOCK = threading.Lock()
LEAD_MIRROR_FIELDS = ("id", "createdAt", "name", "company", "role", "contact", "email", "interest", "comment", "source")
COOKIE_NAME = "kolob_leads_auth"
MAX_BODY_BYTES = 64 * 1024
CONTROL_STATIC_ROOT = Path(os.environ.get("CONTROL_STATIC_ROOT", str(Path(__file__).resolve().parent / "control")))
LEGACY_REDIRECTS = {
    "/investor/franchise-platform/sennaya": "/sennaya",
    "/investor/franchise-platform/petrogradka": "/petrogradka",
    "/investor/franchise-platform": "/control/franchise-platform",
    "/capex-configurator": "/control/capex",
    "/launch-budget": "/control/launch-budget",
    "/revenue-model": "/control/revenue",
    "/economics": "/control/economics",
}
PRIVATE_PREFIXES = ("/control", "/leads", "/api/leads")


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


def link_key():
    if ADMIN_LINK_KEY:
        return ADMIN_LINK_KEY
    try:
        return ADMIN_LINK_KEY_FILE.read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def is_valid_link_key(value):
    expected = link_key()
    if not ADMIN_PASSWORD or len(expected) < ADMIN_LINK_KEY_MIN_LENGTH:
        return False
    return hmac.compare_digest(hashlib.sha256(value.encode()).hexdigest(), hashlib.sha256(expected.encode()).hexdigest())


def utc_now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def read_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def write_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f"{path.name}.next")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def bridge_config():
    config = read_json(BRIDGE_FILE)
    if not isinstance(config, dict):
        return None
    url = str(config.get("url") or "")
    key = str(config.get("key") or "")
    if not url.startswith(BRIDGE_URL_PREFIX) or len(key) < 32:
        return None
    return {"url": url, "key": key, "sheetUrl": str(config.get("sheetUrl") or "")}


def bridge_call(action, payload=None, timeout=BRIDGE_TIMEOUT_SECONDS):
    config = bridge_config()
    if not config:
        raise RuntimeError("мост к таблице не подключён")
    if payload is None:
        request = urllib.request.Request(f"{config['url']}?{urlencode({'action': action, 'key': config['key']})}")
    else:
        body = json.dumps({**payload, "action": action, "key": config["key"]}, ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(config["url"], data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        result = json.loads(response.read(BRIDGE_MAX_RESPONSE_BYTES).decode("utf-8"))
    if not isinstance(result, dict) or not result.get("ok"):
        raise RuntimeError(clean(result.get("error") if isinstance(result, dict) else "", 120) or "таблица ответила ошибкой")
    return result


def inputs_schema():
    schema = read_json(INPUTS_SCHEMA_FILE)
    if not isinstance(schema, dict):
        return []
    return [item for item in schema.get("inputs", []) if isinstance(item, dict) and item.get("key")]


def format_input_value(value):
    if isinstance(value, bool):
        return "да" if value else "нет"
    if isinstance(value, (int, float)):
        text = f"{value:,.2f}".rstrip("0").rstrip(".") if value != int(value) else f"{int(value):,}"
        return text.replace(",", " ").replace(".", ",")
    return str(value if value is not None else "")


def parse_number(value):
    if isinstance(value, bool):
        raise ValueError("нужно число")
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).replace("\u00a0", "").replace(" ", "").replace(",", ".").rstrip("₽%")
    try:
        return float(text)
    except ValueError:
        raise ValueError("нужно число") from None


def coerce_input(item, value):
    kind = item.get("type", "number")
    if kind == "boolean":
        if isinstance(value, bool):
            return value
        text = str(value).strip().lower()
        if text in {"да", "true", "1", "вкл", "yes"}:
            return True
        if text in {"нет", "false", "0", "выкл", "no"}:
            return False
        raise ValueError("нужно «да» или «нет»")
    if kind == "choice":
        text = str(value).strip()
        if text not in item.get("choices", []):
            raise ValueError("можно только " + ", ".join(item.get("choices", [])))
        return text
    number = parse_number(value)
    if number != number or number in (float("inf"), float("-inf")):
        raise ValueError("нужно число")
    if kind == "integer":
        if number != int(number):
            raise ValueError("нужно целое число")
        number = int(number)
    if "allowed" in item and number not in item["allowed"]:
        raise ValueError("можно только " + ", ".join(format_input_value(value) for value in item["allowed"]))
    if "min" in item and number < item["min"]:
        raise ValueError(f"меньше допустимого ({format_input_value(item['min'])})")
    if "max" in item and number > item["max"]:
        raise ValueError(f"больше допустимого ({format_input_value(item['max'])})")
    return number


def validate_inputs(rows, previous):
    supplied = {}
    for row in rows if isinstance(rows, list) else []:
        if isinstance(row, dict) and clean(row.get("key"), 80):
            supplied[clean(row.get("key"), 80)] = row.get("value")
    values = {}
    errors = []
    for item in inputs_schema():
        key = item["key"]
        fallback = previous.get(key, item.get("default"))
        empty = key not in supplied or supplied[key] is None or str(supplied[key]).strip() == ""
        if empty and item.get("optional"):
            values[key] = None
            continue
        if key not in supplied:
            values[key] = fallback
            errors.append({"key": key, "message": "в таблице нет строки с этим ключом"})
            continue
        if empty:
            values[key] = fallback
            errors.append({"key": key, "message": "значение пустое"})
            continue
        try:
            values[key] = coerce_input(item, supplied[key])
        except ValueError as error:
            values[key] = fallback
            errors.append({"key": key, "message": str(error)})
    return values, errors


def default_inputs():
    return {"source": "defaults", "fetchedAt": None, "inputs": {item["key"]: item.get("default") for item in inputs_schema()}, "errors": []}


def loaded_inputs():
    payload = INPUTS_STATE["payload"]
    if payload is None:
        cached = read_json(INPUTS_CACHE_FILE)
        payload = {**cached, "source": "cache"} if isinstance(cached, dict) else default_inputs()
    known = {item["key"]: item.get("default") for item in inputs_schema()}
    payload["inputs"] = {key: payload.get("inputs", {}).get(key, default) for key, default in known.items()}
    INPUTS_STATE["payload"] = payload
    return payload


def refresh_inputs():
    """Reads the sheet and replaces the copy; on failure the copy stays and the reason is recorded."""
    try:
        result = bridge_call("inputs")
        with INPUTS_LOCK:
            previous = loaded_inputs()
            values, errors = validate_inputs(result.get("inputs"), previous["inputs"])
            INPUTS_STATE["payload"] = {"source": "google", "fetchedAt": utc_now(), "inputs": values, "errors": errors}
            write_json(INPUTS_CACHE_FILE, INPUTS_STATE["payload"])
        mark_rejected(errors)
    except Exception as error:
        with INPUTS_LOCK:
            previous = loaded_inputs()
            INPUTS_STATE["payload"] = {**previous, "source": "cache" if previous.get("fetchedAt") else "defaults", "bridgeError": clean(error, 200)}
    finally:
        INPUTS_STATE["refreshing"] = False


def current_inputs(force=False):
    """Answers at once from the copy; a stale copy is refreshed in the background, a missing one — right away."""
    with INPUTS_LOCK:
        payload = loaded_inputs()
        due = time.time() - INPUTS_STATE["checked_at"] >= INPUTS_MAX_AGE_SECONDS
        start = bool(bridge_config()) and (force or due) and not INPUTS_STATE["refreshing"]
        wait_for_result = force or payload.get("fetchedAt") is None
        if start:
            INPUTS_STATE["checked_at"] = time.time()
            INPUTS_STATE["refreshing"] = True
    if start and wait_for_result:
        refresh_inputs()
    elif start:
        threading.Thread(target=refresh_inputs, daemon=True).start()
    with INPUTS_LOCK:
        return {**loaded_inputs(), "refreshing": INPUTS_STATE["refreshing"]}


def mark_rejected(errors):
    rejected = sorted((item["key"], item["message"]) for item in errors if item.get("message") != "в таблице нет строки с этим ключом")
    if INPUTS_STATE["marked"] == rejected:
        return
    try:
        bridge_call("mark", {"rejected": [{"key": key, "message": message} for key, message in rejected]}, timeout=BRIDGE_WRITE_TIMEOUT_SECONDS)
        INPUTS_STATE["marked"] = rejected
    except Exception:
        pass


def form_value(item, raw):
    """Turns a form field into a sheet value; empty means null for optional inputs."""
    text = clean(raw, 200)
    if text == "":
        if item.get("optional"):
            return None
        raise ValueError("значение пустое")
    value = coerce_input(item, text)
    return value


def save_inputs(form):
    """Writes changed cells to the sheet; the sheet refuses cells edited by someone else meanwhile."""
    current = current_inputs()
    changes, rejected = [], []
    for item in inputs_schema():
        key = item["key"]
        if f"value__{key}" not in form:
            continue
        seen = current["inputs"].get(key)
        try:
            value = form_value(item, form[f"value__{key}"][0])
        except ValueError as error:
            rejected.append({"key": key, "message": str(error)})
            continue
        if value == seen or (value is None and seen is None):
            continue
        changes.append({"key": key, "expected": seen, "value": value})
    result = {"saved": [], "conflicts": [], "rejected": rejected, "error": None}
    if changes:
        try:
            answer = bridge_call("update", {"changes": changes}, timeout=BRIDGE_WRITE_TIMEOUT_SECONDS)
            result["saved"] = list(answer.get("saved") or [])
            result["conflicts"] = list(answer.get("conflicts") or [])
        except Exception as error:
            result["error"] = clean(error, 200)
        current_inputs(force=True)
    return result


def queued_leads():
    try:
        return [json.loads(line) for line in BRIDGE_QUEUE_FILE.read_text(encoding="utf-8").splitlines() if line.strip()]
    except (OSError, ValueError):
        return []


def mirror_lead(lead=None):
    """Appends the lead to the «Заявки» sheet; failures wait in a queue for the next attempt."""
    if not bridge_config():
        return
    with QUEUE_LOCK:
        pending = queued_leads() + ([lead] if lead else [])
        failed = []
        for item in pending:
            try:
                if failed:
                    raise RuntimeError("очередь остановлена")
                bridge_call("lead", {"lead": {key: item.get(key) for key in LEAD_MIRROR_FIELDS}}, timeout=BRIDGE_WRITE_TIMEOUT_SECONDS)
            except Exception:
                failed.append(item)
        if failed:
            BRIDGE_QUEUE_FILE.parent.mkdir(parents=True, exist_ok=True)
            BRIDGE_QUEUE_FILE.write_text("".join(json.dumps(item, ensure_ascii=False) + "\n" for item in failed), encoding="utf-8")
        elif BRIDGE_QUEUE_FILE.exists():
            BRIDGE_QUEUE_FILE.unlink()


def escape(value):
    return html.escape(str(value or ""), quote=True)


def layout(title, body):
    return f"""<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow, noarchive">
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


def safe_control_next(value):
    parsed = urlsplit(value or "")
    if parsed.scheme or parsed.netloc or not parsed.path.startswith("/control"):
        return "/control"
    return f"{parsed.path}{f'?{parsed.query}' if parsed.query else ''}"


def control_login_page(next_path="/control", message=""):
    return layout(
        "Control — Колобочная",
        f"""<section class="panel">
  <h1>Control</h1>
  <p>Введите пароль для доступа к внутренним инструментам проекта.</p>
  {f'<p>{escape(message)}</p>' if message else ''}
  <form class="login" method="post" action="/control/login">
    <input name="next" type="hidden" value="{escape(safe_control_next(next_path))}">
    <input name="password" type="password" autocomplete="current-password" placeholder="Пароль" required autofocus>
    <button type="submit">Открыть Control</button>
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


def inputs_page(payload, message=""):
    config = bridge_config()
    errors = {item["key"]: item["message"] for item in payload.get("errors", [])}
    fetched = payload.get("fetchedAt") or ""
    try:
        fetched = datetime.fromisoformat(fetched.replace("Z", "+00:00")).astimezone().strftime("%d.%m.%Y, %H:%M:%S")
    except Exception:
        pass
    if not config:
        status = "Таблица не подключена. Сайт считает на значениях по умолчанию."
    elif payload.get("source") == "google":
        status = f"Значения взяты из таблицы: {fetched}."
    elif payload.get("fetchedAt"):
        status = f"Таблица не ответила, показана последняя исправная копия от {fetched}."
    else:
        status = "Таблица не ответила, копии ещё нет. Сайт считает на значениях по умолчанию."
    if payload.get("bridgeError"):
        status += f" Причина: {payload['bridgeError']}."
    rows = []
    for item in inputs_schema():
        key = item["key"]
        value = payload.get("inputs", {}).get(key)
        note = f'<br><strong>Не принято: {escape(errors[key])}. Оставлено прежнее значение.</strong>' if key in errors else ""
        rows.append(
            f"""<tr>
  <td data-label="Название">{escape(item.get('title'))}{note}<br><small>{escape(item.get('comment'))}</small></td>
  <td data-label="Значение">{input_control(item, value, editable=bool(config))}</td>
  <td data-label="Единица">{escape(item.get('unit'))}</td>
  <td data-label="Ключ"><small>{escape(key)}</small></td>
</tr>"""
        )
    sheet_button = f'<a class="button" href="{escape(config["sheetUrl"])}" target="_blank" rel="noreferrer">Открыть таблицу</a>' if config and config.get("sheetUrl") else ""
    save_button = '<button type="submit" form="inputs-form">Сохранить в таблицу</button>' if config else ""
    queue = len(queued_leads())
    queue_note = f"<p>Заявок, ожидающих отправки в таблицу: {queue}.</p>" if queue else ""
    return layout(
        "Вводные — Колобочная",
        f"""<section class="panel">
  <h1>Вводные</h1>
  <p>{escape(status)}</p>
  {f'<p><strong>{escape(message)}</strong></p>' if message else ''}
  {queue_note}
  <div class="toolbar">
    {save_button}
    {sheet_button}
    <form method="post" action="/control/inputs/refresh"><button type="submit">Обновить сейчас</button></form>
    <a class="button" href="/control">В Control</a>
    <a class="button" href="/leads">Заявки</a>
  </div>
  <form id="inputs-form" method="post" action="/control/inputs/save">
  <table>
    <thead><tr><th>Название</th><th>Значение</th><th>Единица</th><th>Ключ</th></tr></thead>
    <tbody>{''.join(rows)}</tbody>
  </table>
  </form>
</section>""",
    )


def input_control(item, value, editable):
    """One form control per input: a list for fixed options, a field for free numbers."""
    key = item["key"]
    name = f"value__{key}"
    if not editable:
        return escape(format_input_value(value))
    kind = item.get("type", "number")
    if kind == "boolean":
        options = [("да", "да"), ("нет", "нет")]
        chosen = "да" if value else "нет"
    elif kind == "choice":
        options = [(choice, choice) for choice in item.get("choices", [])]
        chosen = str(value if value is not None else "")
    elif "allowed" in item:
        options = [(format_input_value(allowed), format_input_value(allowed)) for allowed in item["allowed"]]
        chosen = format_input_value(value)
    else:
        text = "" if value is None else (str(int(value)) if isinstance(value, (int, float)) and value == int(value) else str(value))
        placeholder = "пусто — по составу" if item.get("optional") else ""
        return f'<input name="{escape(name)}" value="{escape(text)}" inputmode="decimal" placeholder="{escape(placeholder)}" style="width: 150px">'
    rendered = "".join(
        f'<option value="{escape(option)}"{" selected" if option == chosen else ""}>{escape(label)}</option>' for option, label in options
    )
    return f'<select name="{escape(name)}" style="min-height: 40px; padding: 0 10px; border-radius: 12px; font-size: 15px">{rendered}</select>'


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

    def private_headers(self):
        path = urlsplit(self.path).path
        return {"X-Robots-Tag": "noindex, nofollow, noarchive"} if path.startswith(PRIVATE_PREFIXES) else {}

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for key, value in self.private_headers().items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def send_html(self, status, content, headers=None):
        body = content.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for key, value in self.private_headers().items():
            self.send_header(key, value)
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
        for key, value in self.private_headers().items():
            self.send_header(key, value)
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def redirect(self, location, headers=None, status=303):
        self.send_response(status)
        self.send_header("Location", location)
        self.send_header("Cache-Control", "no-store")
        for key, value in self.private_headers().items():
            self.send_header(key, value)
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()

    def auth_cookie(self):
        secure = os.environ.get("CONTACT_COOKIE_SECURE", "1").lower() not in {"0", "false", "no"}
        return f"{COOKIE_NAME}={token()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800{'; Secure' if secure else ''}"

    def serve_control_file(self, request_path):
        relative_path = unquote(request_path.removeprefix("/control").lstrip("/"))
        if not relative_path or "." not in Path(relative_path).name:
            relative_path = "control.html"
        candidate = (CONTROL_STATIC_ROOT / relative_path).resolve()
        root = CONTROL_STATIC_ROOT.resolve()
        if root not in candidate.parents and candidate != root:
            self.send_text(403, "Forbidden")
            return
        if not candidate.is_file():
            self.send_text(404, "Not found")
            return
        content_type = mimetypes.guess_type(str(candidate))[0] or "application/octet-stream"
        content = candidate.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8" if content_type.startswith("text/") or content_type == "application/javascript" else content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Robots-Tag", "noindex, nofollow, noarchive")
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self):
        parsed = urlsplit(self.path)
        path = parsed.path
        legacy_path = path.rstrip("/") or "/"
        if legacy_path in LEGACY_REDIRECTS:
            query = f"?{parsed.query}" if parsed.query else ""
            self.redirect(f"{LEGACY_REDIRECTS[legacy_path]}{query}", status=308)
            return
        if path == "/health":
            self.send_json(200, {"ok": True})
            return
        if path.startswith("/control/key/"):
            if not is_valid_link_key(unquote(path.removeprefix("/control/key/")).strip("/")):
                self.send_text(404, "Not found")
                return
            self.redirect("/control", {"Set-Cookie": self.auth_cookie()})
            return
        if path == "/control/logout":
            self.redirect("/control/login", {"Set-Cookie": f"{COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"})
            return
        if path == "/api/inputs":
            payload = current_inputs()
            self.send_json(200, {"ok": True, "source": payload.get("source"), "fetchedAt": payload.get("fetchedAt"), "refreshing": payload.get("refreshing", False), "inputs": payload.get("inputs", {})})
            return
        if path == "/control/inputs":
            if not is_authorized(self):
                self.redirect("/control/login?next=/control/inputs")
                return
            message = parse_qs(parsed.query).get("m", [""])[0]
            self.send_html(200, inputs_page(current_inputs(), clean(message, 600)))
            return
        if path == "/control/login":
            next_path = safe_control_next(parse_qs(parsed.query).get("next", ["/control"])[0])
            if is_authorized(self):
                self.redirect(next_path)
                return
            self.send_html(200, control_login_page(next_path))
            return
        if path == "/control" or path.startswith("/control/"):
            if not is_authorized(self):
                requested = f"{path}?{parsed.query}" if parsed.query else path
                self.redirect(f"/control/login?next={quote(requested, safe='/')}")
                return
            self.serve_control_file(path)
            return
        if path == "/leads/logout":
            self.redirect("/leads", {"Set-Cookie": f"{COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"})
            return
        if path == "/leads":
            if not is_authorized(self):
                self.send_html(200, login_page())
                return
            self.send_html(200, leads_page(read_leads()))
            return
        if path == "/api/leads":
            if not is_authorized(self):
                self.send_json(401, {"ok": False, "error": "Unauthorized"})
                return
            self.send_json(200, {"ok": True, "leads": read_leads()})
            return
        if path == "/api/leads.csv":
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
        path = urlsplit(self.path).path
        if path == "/api/contact":
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
            threading.Thread(target=mirror_lead, args=(lead,), daemon=True).start()
            self.send_json(200, {"ok": True})
            return
        if path == "/control/inputs/refresh":
            if not is_authorized(self):
                self.redirect("/control/login?next=/control/inputs")
                return
            current_inputs(force=True)
            threading.Thread(target=mirror_lead, daemon=True).start()
            self.redirect("/control/inputs")
            return
        if path == "/control/inputs/save":
            if not is_authorized(self):
                self.redirect("/control/login?next=/control/inputs")
                return
            result = save_inputs(parse_qs(self.read_body().decode("utf-8")))
            titles = {item["key"]: item.get("title") or item["key"] for item in inputs_schema()}
            parts = []
            if result["saved"]:
                parts.append("Записано в таблицу: " + ", ".join(titles.get(key, key) for key in result["saved"]) + ".")
            for conflict in result["conflicts"]:
                parts.append(f"{titles.get(conflict.get('key'), conflict.get('key'))}: {conflict.get('reason')}, сейчас там «{format_input_value(conflict.get('current'))}».")
            for item in result["rejected"]:
                parts.append(f"{titles.get(item['key'], item['key'])}: {item['message']}.")
            if result["error"]:
                parts.append(f"Таблица не приняла запись: {result['error']}.")
            if not parts:
                parts.append("Изменений не было.")
            self.redirect(f"/control/inputs?m={quote(' '.join(parts))}")
            return
        if path == "/leads/login":
            if not ADMIN_PASSWORD:
                self.send_html(503, login_page("Пароль администратора не настроен на сервере."))
                return
            params = parse_qs(self.read_body().decode("utf-8"))
            password = params.get("password", [""])[0]
            if not hmac.compare_digest(hashlib.sha256(password.encode()).hexdigest(), hashlib.sha256(ADMIN_PASSWORD.encode()).hexdigest()):
                self.send_html(401, login_page("Неверный пароль."))
                return
            self.redirect("/leads", {"Set-Cookie": self.auth_cookie()})
            return
        if path == "/control/login":
            params = parse_qs(self.read_body().decode("utf-8"))
            next_path = safe_control_next(params.get("next", ["/control"])[0])
            if not ADMIN_PASSWORD:
                self.send_html(503, control_login_page(next_path, "Пароль администратора не настроен на сервере."))
                return
            password = params.get("password", [""])[0]
            if not hmac.compare_digest(hashlib.sha256(password.encode()).hexdigest(), hashlib.sha256(ADMIN_PASSWORD.encode()).hexdigest()):
                self.send_html(401, control_login_page(next_path, "Неверный пароль."))
                return
            self.redirect(next_path, {"Set-Cookie": self.auth_cookie()})
            return
        self.send_text(404, "Not found")


def csv_quote(value):
    return '"' + str(value or "").replace('"', '""') + '"'


if __name__ == "__main__":
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Kolob contact server listening on http://{HOST}:{PORT}")
    print(f"Leads file: {LEADS_FILE}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
