import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { cacheRoot, isMain, parseCli, projectRoot, readConfig, shortHash, writeJson } from "./utils.mjs";

const DEFAULT_URL = "http://127.0.0.1:5173";
const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

async function responds(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1200);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await responds(url)) return;
    if (child.exitCode !== null) throw new Error(`Vite exited before becoming ready (${child.exitCode})`);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Vite did not become ready at ${url}`);
}

async function acquireServer(baseUrl = DEFAULT_URL, root = projectRoot) {
  if (await responds(baseUrl)) return { baseUrl, reused: true, stop: async () => {} };
  const url = new URL(baseUrl);
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error(`Refusing to start a dev server for non-local URL: ${baseUrl}`);
  }
  const child = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", url.port || "5173", "--strictPort"], {
    cwd: root,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const serverOutput = [];
  child.stdout.on("data", chunk => serverOutput.push(chunk.toString()));
  child.stderr.on("data", chunk => serverOutput.push(chunk.toString()));
  try {
    await waitForServer(baseUrl, child);
  } catch (error) {
    child.kill("SIGTERM");
    throw new Error(`${error.message}\n${serverOutput.join("").trim()}`);
  }
  return {
    baseUrl,
    reused: false,
    stop: async () => {
      if (child.exitCode !== null) return;
      child.kill("SIGTERM");
      await Promise.race([
        new Promise(resolve => child.once("exit", resolve)),
        new Promise(resolve => setTimeout(resolve, 2000)),
      ]);
      if (child.exitCode === null) child.kill("SIGKILL");
    },
  };
}

function screenshotFile(domainId, hash, viewport) {
  return path.join(cacheRoot, "screenshots", `${domainId}-${shortHash(hash)}-${viewport}.png`);
}

async function inspectPage(browser, { baseUrl, domainId, domain, impact, hash, viewportName }) {
  const viewport = VIEWPORTS[viewportName];
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", error => pageErrors.push(error.message));
  try {
    const response = await page.goto(`${baseUrl}${domain.visual.route}`, { waitUntil: "domcontentloaded", timeout: 15000 });
    if (!response || response.status() >= 400) throw new Error(`HTTP ${response?.status() ?? "no response"}`);
    await page.locator("#root > *").first().waitFor({ state: "visible", timeout: 10000 });
    for (const selector of domain.visual.requiredSelectors || []) {
      const locator = page.locator(selector).first();
      await locator.waitFor({ state: "visible", timeout: 10000 });
    }
    const metrics = await page.evaluate(() => ({
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      rootChildren: document.querySelector("#root")?.children.length || 0,
    }));
    const overflow = Math.max(metrics.documentWidth, metrics.bodyWidth) > metrics.viewport + 2;
    if (overflow) throw new Error(`horizontal overflow: ${JSON.stringify(metrics)}`);
    if (!metrics.rootChildren) throw new Error("empty #root");
    if (consoleErrors.length) throw new Error(`console errors: ${consoleErrors.join(" | ")}`);
    if (pageErrors.length) throw new Error(`page errors: ${pageErrors.join(" | ")}`);

    let screenshotPath = null;
    if (impact === "high") {
      screenshotPath = screenshotFile(domainId, hash, viewportName);
      fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }
    return { domain: domainId, viewport: viewportName, status: "PASS", consoleErrors: 0, overflow: 0, screenshotPath };
  } finally {
    await context.close();
  }
}

export async function runVisualVerification({ selections, config = readConfig(), baseUrl = DEFAULT_URL, root = projectRoot } = {}) {
  if (!selections?.length) return { serverReused: false, results: [], screenshotPaths: [] };
  const server = await acquireServer(baseUrl, root);
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(root, ".playwright-browsers");
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const selection of selections) {
      const domain = config.domains[selection.domain];
      if (!domain?.visual?.route) continue;
      const viewports = selection.impact === "high" ? ["desktop", "mobile"] : ["desktop"];
      for (const viewportName of viewports) {
        try {
          results.push(await inspectPage(browser, { baseUrl: server.baseUrl, domainId: selection.domain, domain, impact: selection.impact, hash: selection.hash, viewportName }));
        } catch (error) {
          error.domain = selection.domain;
          error.partialResults = results;
          throw error;
        }
      }
    }
  } finally {
    await browser.close();
    await server.stop();
  }
  const report = {
    generatedAt: new Date().toISOString(),
    serverReused: server.reused,
    results,
    screenshotPaths: results.map(result => result.screenshotPath).filter(Boolean).map(filename => path.relative(root, filename)),
  };
  writeJson(path.join(cacheRoot, "visual-last.json"), report);
  return report;
}

function printReport(report) {
  for (const domain of [...new Set(report.results.map(result => result.domain))]) {
    process.stdout.write(`${domain.toUpperCase()}\n`);
    for (const result of report.results.filter(item => item.domain === domain)) {
      process.stdout.write(`  ${result.viewport.padEnd(9)} PASS\n`);
    }
    process.stdout.write("  console   0\n  overflow  0\n");
    if (report.results.some(result => result.domain === domain && result.screenshotPath)) process.stdout.write("  screenshot generated\n");
  }
}

if (isMain(import.meta.url)) {
  const { flags } = parseCli(process.argv.slice(2));
  const config = readConfig();
  const domains = String(flags.get("domains") || "").split(",").filter(Boolean);
  const impacts = JSON.parse(String(flags.get("impacts") || "{}"));
  const hashes = JSON.parse(String(flags.get("hashes") || "{}"));
  try {
    const report = await runVisualVerification({
      config,
      baseUrl: String(flags.get("base-url") || DEFAULT_URL),
      selections: domains.map(domain => ({ domain, impact: impacts[domain] || "high", hash: hashes[domain] || "manual" })),
    });
    printReport(report);
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}
