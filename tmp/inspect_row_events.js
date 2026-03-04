const sheets = require('../src/config/googleSheets');

const spreadsheetId = '1Bf0B1jzSMIE0IGz8BWBvBLHH_gQUz_04hhfxJ0-d2os';
const sheetTitle = 'Form Responses 1';
const targetRowNumber = 2;

(async () => {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetTitle}'!A1:ZZ${targetRowNumber}`,
  });

  const rows = response.data.values || [];
  const headers = rows[0] || [];
  const row = rows[targetRowNumber - 1] || [];

  console.log(`Inspecting row ${targetRowNumber}`);
  headers.forEach((header, index) => {
    const h = String(header || '').trim();
    const v = String(row[index] || '').trim();
    const lower = h.toLowerCase();
    if (!h || !v) return;

    if (lower.includes('day') || lower.includes('event')) {
      console.log(`[${index}] HEADER="${h}" | VALUE="${v}"`);
    }
  });
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
