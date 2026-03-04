const fs = require('fs');
const path = require('path');

const sheets = require('../src/config/googleSheets');
const { env } = require('../src/config/env');
const { generateRegistrationPass, generateLunchPass } = require('../src/services/pdfService');
const { extractEvents } = require('../src/services/sheetsService');

const pickFirstNonEmpty = (...values) => {
  for (const value of values) {
    if (value && String(value).trim()) return String(value).trim();
  }
  return '';
};

const findColIndex = (headers, variants) => {
  const lowered = headers.map((header) => String(header || '').trim().toLowerCase());
  return lowered.findIndex((header) => variants.some((variant) => header.includes(variant)));
};

const normalizeDay = (value) => {
  const dayValue = String(value || '').trim().toLowerCase();
  if (!dayValue) return 'N/A';
  if (dayValue.includes('day 1')) return 'Day 1';
  if (dayValue.includes('day 2')) return 'Day 2';
  if (dayValue.includes('both')) return 'Both Days';
  return String(value).trim();
};

const getCandidateSheets = () => {
  const sheetIds = [
    env.csSheets?.events,
    env.csSheets?.workshop,
    env.csSheets?.hackathon,
    env.ncsSheets?.events,
    env.ncsSheets?.workshop,
    env.ncsSheets?.hackathon,
  ].filter((sheetId) => sheetId && String(sheetId).trim());

  return Array.from(new Set(sheetIds));
};

const fetchFirstUsableRow = async () => {
  const candidateSheets = getCandidateSheets();
  if (candidateSheets.length === 0) {
    throw new Error('No sheet IDs found in environment configuration');
  }

  for (const spreadsheetId of candidateSheets) {
    try {
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
      const firstSheetTitle = spreadsheet.data.sheets?.[0]?.properties?.title;
      if (!firstSheetTitle) continue;

      const valuesResp = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${firstSheetTitle}'!A1:ZZ300`,
      });

      const rows = valuesResp.data.values || [];
      if (rows.length < 2) continue;

      const headers = rows[0];
      for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex] || [];
        if (!row.some((cell) => String(cell || '').trim())) continue;

        const nameIdx = findColIndex(headers, ['name']);
        const emailIdx = findColIndex(headers, ['email']);
        const collegeIdx = findColIndex(headers, ['college', 'institute']);
        const deptIdx = findColIndex(headers, ['department', 'dept', 'branch']);
        const dayIdx = findColIndex(headers, ['event happening days', 'registration day', 'day']);

        const studentName = pickFirstNonEmpty(nameIdx >= 0 ? row[nameIdx] : '', 'Student');
        const studentEmail = pickFirstNonEmpty(emailIdx >= 0 ? row[emailIdx] : '', 'student@example.com');
        const college = pickFirstNonEmpty(collegeIdx >= 0 ? row[collegeIdx] : '', 'N/A');
        const department = pickFirstNonEmpty(deptIdx >= 0 ? row[deptIdx] : '', 'N/A');
        const day = normalizeDay(dayIdx >= 0 ? row[dayIdx] : '');
        const extracted = extractEvents(row, headers);
        const eventsList = [...extracted.day1Events, ...extracted.day2Events].slice(0, 6);

        return {
          spreadsheetId,
          sheetTitle: firstSheetTitle,
          rowNumber: rowIndex + 1,
          payload: {
            studentName,
            studentEmail,
            college,
            department,
            day,
            eventsList: eventsList.length > 0 ? eventsList : ['Texperia 2026'],
            token: `MOCK-${Date.now()}`,
            qrBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
            venue: 'N/A',
          }
        };
      }
    } catch (error) {
      console.error(`[Mock PDF] Skipping sheet ${spreadsheetId}: ${error.message}`);
    }
  }

  throw new Error('No usable rows found in any configured sheets');
};

(async () => {
  try {
    const data = await fetchFirstUsableRow();
    console.log(`[Mock PDF] Using sheet ${data.spreadsheetId}, tab '${data.sheetTitle}', row ${data.rowNumber}`);
    console.log('[Mock PDF] Student:', data.payload.studentName, '| Day:', data.payload.day);

    const attendancePdfBuffer = await generateRegistrationPass(data.payload, 'attendance');
    const attendanceOutputPath = path.join(process.cwd(), 'mock_sheet_attendance.pdf');
    fs.writeFileSync(attendanceOutputPath, attendancePdfBuffer);

    const lunchPdfBuffer = await generateLunchPass({
      ...data.payload,
      token: `MOCK-LUNCH-${Date.now()}`,
    });
    const lunchOutputPath = path.join(process.cwd(), 'mock_sheet_lunch.pdf');
    fs.writeFileSync(lunchOutputPath, lunchPdfBuffer);

    console.log(`[Mock PDF] ✅ Attendance PDF generated: ${attendanceOutputPath}`);
    console.log(`[Mock PDF] ✅ Lunch PDF generated: ${lunchOutputPath}`);
  } catch (error) {
    console.error('[Mock PDF] ❌ Failed:', error.message);
    process.exit(1);
  }
})();
