import type { drive_v3, sheets_v4 } from "googleapis";
import { SHEET_MIME } from "./types.js";
export async function createTestSpreadsheet(drive: drive_v3.Drive, sheets: sheets_v4.Sheets, folderId: string) {
  const created = await drive.files.create({ requestBody: { name: "TEST — Financial Model", mimeType: SHEET_MIME, parents: [folderId] }, fields: "id" });
  const id = created.data.id; if (!id) throw new Error("Drive API did not return test spreadsheet ID.");
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: id, requestBody: { requests: [{ updateSheetProperties: { properties: { sheetId: 0, title: "README" }, fields: "title" } }, { addSheet: { properties: { title: "ASSUMPTIONS_TEST" } } }] } });
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: id, requestBody: { valueInputOption: "RAW", data: [
    { range: "README!A1:B4", values: [["Статус", "TEST"], ["Дата создания", new Date().toISOString().slice(0, 10)], ["Назначение", "Проверка безопасной интеграции Google Sheets API"], ["Предупреждение", "Данные не являются финансовой моделью."]] },
    { range: "ASSUMPTIONS_TEST!A1:D4", values: [["ID", "Scenario", "Status", "Value"], ["ASM-PURCHASE", "PURCHASE", "research", ""], ["ASM-RENT", "RENT", "research", ""], ["ASM-MASTER-LEASE", "MASTER_LEASE", "research", ""]] }
  ] } }); return id;
}
export async function readTestSpreadsheet(sheets: sheets_v4.Sheets, id: string) { const values = await sheets.spreadsheets.values.batchGet({ spreadsheetId: id, ranges: ["README!A1:B4", "ASSUMPTIONS_TEST!A1:D4"] }); return values.data.valueRanges ?? []; }
