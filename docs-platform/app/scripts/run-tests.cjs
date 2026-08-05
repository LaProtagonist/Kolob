const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const appRoot = path.resolve(__dirname, "..");
const testRoot = path.join(appRoot, "test");
const tsxCli = path.join(appRoot, "node_modules", "tsx", "dist", "cli.mjs");
const files = fs.readdirSync(testRoot)
  .filter(file => file.endsWith(".test.ts"))
  .sort((left, right) => left.localeCompare(right));

for (const file of files) {
  const result = spawnSync(process.execPath, [tsxCli, "--test", path.join("test", file)], {
    cwd: appRoot,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
