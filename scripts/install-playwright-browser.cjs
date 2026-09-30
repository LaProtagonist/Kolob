// Браузер для сборки и проверок ставится в общий кэш Playwright на компьютере, а не в папку проекта:
// одна копия на все проекты вместо 539 МБ в каждой рабочей папке.
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const cli = path.join(projectRoot, "node_modules", "playwright", "cli.js");
const result = spawnSync(process.execPath, [cli, "install", "chromium"], {
  cwd: projectRoot,
  stdio: "inherit",
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
