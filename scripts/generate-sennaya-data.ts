import fs from "node:fs";
import { projectSennaya } from "./sennaya-projection";

const file = "src/content/sennaya-data.json";
const result = projectSennaya();
const content = `${JSON.stringify(result.public, null, 2)}\n`;
if (process.argv.includes("--check")) {
  if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== content) throw new Error("Sennaya snapshot differs from canonical engines; regenerate explicitly");
  console.log("Sennaya canonical projection: PASS");
} else {
  fs.writeFileSync(file, content);
  fs.mkdirSync(".cache/verification/sennaya", { recursive: true });
  fs.writeFileSync(".cache/verification/sennaya/financial-audit.json", `${JSON.stringify(result.audit, null, 2)}\n`);
  console.log(`Generated ${file}`);
}
