import { createGovernedService, resolveCapabilityMode } from "./server.js";

if (resolveCapabilityMode() !== "review") {
  throw new Error("mcp:smoke is review-only. Set MCP_CAPABILITY_MODE=review or remove it.");
}
const service = createGovernedService();
const output = {
  project_status: await service.projectStatus(),
  documents_list: await service.documentsList(),
  document_read: await service.documentRead("TEST-DOC-001"),
  spreadsheet_read: await service.spreadsheetRead("TEST-SHEET-001", "README", "A1:B4"),
  registry_validate: await service.registryValidate()
};
console.log(JSON.stringify(output, null, 2));
