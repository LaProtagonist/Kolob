import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const host = process.env.CONTACT_SERVER_HOST || "127.0.0.1";
const port = Number(process.env.CONTACT_SERVER_PORT || 8787);
const dataDir = process.env.CONTACT_DATA_DIR || path.resolve(process.cwd(), "runtime-data");
const leadsFile = process.env.CONTACT_LEADS_FILE || path.join(dataDir, "contacts.jsonl");
const adminPassword = process.env.CONTACT_ADMIN_PASSWORD || "";
const adminSecret = process.env.CONTACT_ADMIN_SECRET || adminPassword || "kolob-local-admin";
const cookieName = "kolob_leads_auth";
const maxBodyBytes = 64 * 1024;

function jsonResponse(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function htmlResponse(res, status, html, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(html);
}

function textResponse(res, status, text, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(text);
}

function redirect(res, location, headers = {}) {
  res.writeHead(303, { Location: location, "Cache-Control": "no-store", ...headers });
  res.end();
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function authToken() {
  return hash(`${adminPassword}:${adminSecret}`);
}

function safeCompare(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index === -1) return [part, ""];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function isAuthorized(req) {
  if (!adminPassword) return false;
  const cookies = parseCookies(req);
  return typeof cookies[cookieName] === "string" && safeCompare(cookies[cookieName], authToken());
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        reject(new Error("Body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function clean(value, limit = 2000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function normalizeLead(payload, req) {
  const name = clean(payload.name, 200);
  const company = clean(payload.company, 300);
  const role = clean(payload.role, 300);
  const contact = clean(payload.contact, 300);
  const email = clean(payload.email, 300);
  const interest = clean(payload.interest, 300);
  const comment = clean(payload.comment, 3000);
  const consent = payload.consent === true || payload.consent === "true" || payload.consent === "on";

  if (!name) {
    return { error: "Укажите имя." };
  }

  if (!contact && !email) {
    return { error: "Укажите телефон, Telegram или email." };
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Укажите корректный email." };
  }

  if (!consent) {
    return { error: "Подтвердите согласие на обработку данных." };
  }

  const forwardedFor = clean(req.headers["x-forwarded-for"], 500);
  const ip = forwardedFor.split(",")[0]?.trim() || req.socket.remoteAddress || "";

  return {
    lead: {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      name,
      company,
      role,
      contact,
      email,
      interest,
      comment,
      consent: true,
      source: "colob.spi.ski",
      meta: {
        ip,
        userAgent: clean(req.headers["user-agent"], 600),
        referer: clean(req.headers.referer, 600)
      }
    }
  };
}

async function saveLead(lead) {
  await mkdir(path.dirname(leadsFile), { recursive: true });
  await appendFile(leadsFile, `${JSON.stringify(lead)}\n`, "utf8");
}

async function readLeads() {
  try {
    const content = await readFile(leadsFile, "utf8");
    return content
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function leadsCsv(leads) {
  const columns = ["createdAt", "name", "company", "role", "contact", "email", "interest", "comment", "ip"];
  const header = columns.join(",");
  const rows = leads.map((lead) =>
    [
      lead.createdAt,
      lead.name,
      lead.company,
      lead.role,
      lead.contact,
      lead.email,
      lead.interest,
      lead.comment,
      lead.meta?.ip
    ]
      .map(csvCell)
      .join(",")
  );
  return [header, ...rows].join("\n");
}

function layout(title, body) {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; font-family: Arial, sans-serif; color: #171717; background: #f7f1e6; }
    body { margin: 0; padding: 32px; }
    main { max-width: 1180px; margin: 0 auto; }
    h1 { margin: 0 0 24px; font-size: clamp(32px, 5vw, 56px); line-height: .98; }
    p { color: #65615b; line-height: 1.55; }
    a, button { font: inherit; }
    .panel { padding: 28px; border-radius: 24px; background: #fffaf0; box-shadow: 0 18px 60px rgba(23, 23, 23, .08); }
    .login { display: grid; gap: 16px; max-width: 420px; }
    input { min-height: 48px; padding: 0 14px; border: 1px solid rgba(23,23,23,.18); border-radius: 14px; font-size: 16px; }
    button, .button { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: 0 18px; border: 0; border-radius: 14px; background: #f7b91e; color: #171717; font-weight: 900; text-decoration: none; cursor: pointer; }
    .toolbar { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 18px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; background: white; border-radius: 18px; overflow: hidden; }
    th, td { padding: 12px 10px; border-bottom: 1px solid rgba(23,23,23,.1); text-align: left; vertical-align: top; }
    th { background: #171717; color: #f7b91e; white-space: nowrap; }
    td { max-width: 260px; }
    .empty { padding: 32px; border-radius: 18px; background: #fff; }
    @media (max-width: 760px) {
      body { padding: 18px; }
      .panel { padding: 20px; }
      table, thead, tbody, tr, th, td { display: block; }
      thead { display: none; }
      tr { padding: 14px 0; border-bottom: 1px solid rgba(23,23,23,.1); }
      td { max-width: none; border: 0; padding: 6px 0; }
      td::before { content: attr(data-label); display: block; margin-bottom: 2px; color: #8a6a08; font-size: 12px; font-weight: 900; text-transform: uppercase; }
    }
  </style>
</head>
<body>
  <main>${body}</main>
</body>
</html>`;
}

function loginPage(message = "") {
  return layout(
    "Заявки Колобочной",
    `<section class="panel">
      <h1>Заявки</h1>
      <p>Введите пароль для просмотра оставленных контактов.</p>
      ${message ? `<p>${escapeHtml(message)}</p>` : ""}
      <form class="login" method="post" action="/leads/login">
        <input name="password" type="password" autocomplete="current-password" placeholder="Пароль" required autofocus />
        <button type="submit">Открыть заявки</button>
      </form>
    </section>`
  );
}

function leadsPage(leads) {
  const rows = leads
    .map(
      (lead) => `<tr>
        <td data-label="Дата">${escapeHtml(new Date(lead.createdAt).toLocaleString("ru-RU"))}</td>
        <td data-label="Имя">${escapeHtml(lead.name)}</td>
        <td data-label="Компания">${escapeHtml(lead.company)}</td>
        <td data-label="Должность">${escapeHtml(lead.role)}</td>
        <td data-label="Контакт">${escapeHtml(lead.contact)}</td>
        <td data-label="Email">${escapeHtml(lead.email)}</td>
        <td data-label="Интерес">${escapeHtml(lead.interest)}</td>
        <td data-label="Комментарий">${escapeHtml(lead.comment)}</td>
      </tr>`
    )
    .join("");

  return layout(
    "Заявки Колобочной",
    `<section class="panel">
      <h1>Заявки</h1>
      <div class="toolbar">
        <a class="button" href="/api/leads.csv">Скачать CSV</a>
        <a class="button" href="/leads">Обновить</a>
        <a class="button" href="/leads/logout">Выйти</a>
      </div>
      ${
        leads.length
          ? `<table>
              <thead>
                <tr>
                  <th>Дата</th><th>Имя</th><th>Компания</th><th>Должность</th><th>Контакт</th><th>Email</th><th>Интерес</th><th>Комментарий</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>`
          : `<p class="empty">Заявок пока нет.</p>`
      }
    </section>`
  );
}

function isSecureRequest(req) {
  return req.headers["x-forwarded-proto"] === "https";
}

function authCookie(req) {
  const secure = isSecureRequest(req) ? "; Secure" : "";
  return `${cookieName}=${encodeURIComponent(authToken())}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure}`;
}

function clearCookie() {
  return `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

async function handleContact(req, res) {
  let payload;
  try {
    const raw = await readBody(req);
    payload = JSON.parse(raw || "{}");
  } catch {
    jsonResponse(res, 400, { ok: false, error: "Некорректный запрос." });
    return;
  }

  const result = normalizeLead(payload, req);
  if (result.error) {
    jsonResponse(res, 422, { ok: false, error: result.error });
    return;
  }

  await saveLead(result.lead);
  jsonResponse(res, 200, { ok: true });
}

async function handleLeadsLogin(req, res) {
  if (!adminPassword) {
    htmlResponse(res, 503, loginPage("Пароль администратора не настроен на сервере."));
    return;
  }

  const body = await readBody(req);
  const params = new URLSearchParams(body);
  const password = String(params.get("password") || "");

  if (!safeCompare(hash(password), hash(adminPassword))) {
    htmlResponse(res, 401, loginPage("Неверный пароль."));
    return;
  }

  redirect(res, "/leads", { "Set-Cookie": authCookie(req) });
}

async function handleLeadsPage(req, res) {
  if (!isAuthorized(req)) {
    htmlResponse(res, 200, loginPage());
    return;
  }

  const leads = await readLeads();
  htmlResponse(res, 200, leadsPage(leads));
}

async function handleLeadsApi(req, res) {
  if (!isAuthorized(req)) {
    jsonResponse(res, 401, { ok: false, error: "Unauthorized" });
    return;
  }
  jsonResponse(res, 200, { ok: true, leads: await readLeads() });
}

async function handleLeadsCsv(req, res) {
  if (!isAuthorized(req)) {
    textResponse(res, 401, "Unauthorized");
    return;
  }
  const csv = leadsCsv(await readLeads());
  textResponse(res, 200, csv, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": 'attachment; filename="kolob-contacts.csv"'
  });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && url.pathname === "/health") {
      jsonResponse(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/contact") {
      await handleContact(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/leads") {
      await handleLeadsApi(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/leads.csv") {
      await handleLeadsCsv(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/leads/logout") {
      redirect(res, "/leads", { "Set-Cookie": clearCookie() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/leads/login") {
      await handleLeadsLogin(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/leads") {
      await handleLeadsPage(req, res);
      return;
    }

    textResponse(res, 404, "Not found");
  } catch (error) {
    console.error(error);
    jsonResponse(res, 500, { ok: false, error: "Server error" });
  }
});

server.listen(port, host, () => {
  console.log(`Kolob contact server listening on http://${host}:${port}`);
  console.log(`Leads file: ${leadsFile}`);
});
