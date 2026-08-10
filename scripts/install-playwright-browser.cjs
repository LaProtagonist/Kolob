const { spawnSync } = require("node:child_process");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const cli = path.join(projectRoot, "node_modules", "playwright", "cli.js");
const browserRoot = path.join(projectRoot, ".playwright-browsers");
const result = spawnSync(process.execPath, [cli, "install", "chromium"], {
  cwd: projectRoot,
  stdio: "inherit",
  env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browserRoot },
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
