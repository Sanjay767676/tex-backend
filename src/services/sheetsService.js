const { env } = require('../config/env');
const sheets = require('../config/googleSheets');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { sendConfirmationEmail, sendAttendanceEmail, sendLunchEmail } = require('./emailService');
const { generateRegistrationPass, generateLunchPass } = require('./pdfService');
const {
    normalizeValue,
    getColumnByAlias,
    indexToColumn,
    buildHeaderMap,
    validateRequiredColumns,
    getColumnLetterByAlias,
    getDayType,
} = require('../utils/columnResolver');
const eventConfig = require('../config/eventConfig.json');

const SHEET_NAME = 'A:ZZ';

// ─── Rate limiting & retry helpers ───────────────────────────────────────────
const MIN_REQUEST_GAP_MS = 1500; // minimum ms between Sheets API calls
let lastRequestTime = 0;

const throttle = () => {
    const now = Date.now();
    const wait = Math.max(0, MIN_REQUEST_GAP_MS - (now - lastRequestTime));
    lastRequestTime = now + wait;
    return wait > 0 ? new Promise(resolve => setTimeout(resolve, wait)) : Promise.resolve();
};

/**
 * Wraps a Sheets API call with throttling + exponential back-off retry.
 * Retries on 429 (rate limit) and 503 (service unavailable / quota).
 */
const callWithRetry = async (fn, maxRetries = 4) => {
    let attempt = 0;
    while (true) {
        await throttle();
        try {
            return await fn();
        } catch (err) {
            const code = err?.code || err?.response?.status;
            const isRetryable =
                code === 429 ||
                code === 503 ||
                (err.message && err.message.includes('Quota exceeded')) ||
                (err.message && err.message.includes('Rate Limit'));

            attempt++;
            if (!isRetryable || attempt > maxRetries) throw err;

            const backoff = Math.min(2000 * Math.pow(2, attempt - 1), 30000);
            const jitter = Math.floor(Math.random() * 1000);
            console.log(`[Sheets Service] ⏳ Quota/rate-limit hit – retrying in ${backoff + jitter}ms (attempt ${attempt}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, backoff + jitter));
        }
    }
};
// ─────────────────────────────────────────────────────────────────────────────
const HEADER_CACHE_TTL_MS = 5 * 60 * 1000;
const METADATA_TTL_MS = 24 * 60 * 60 * 1000;
const TOKEN_REGEX = /^(CS|NCS)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CACHE_FILE = path.join(process.cwd(), 'sheet_metadata_cache.json');

// Using cache abstraction (Redis or In-Memory)
const cacheService = require('./cacheService');
let isCacheWarming = false;

const headerCache = new Map();

// Persistent metadata cache
const loadMetadataCache = () => {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
            console.log(`[Sheets Service] 💾 Loaded persistence cache for ${Object.keys(data).length} sheets`);
            return new Map(Object.entries(data));
        }
    } catch (e) {
        console.error('[Sheets Service] Failed to load metadata cache:', e.message);
    }
    return new Map();
};

const saveMetadataCache = (cache) => {
    try {
        const data = Object.fromEntries(cache);
        fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('[Sheets Service] Failed to save metadata cache:', e.message);
    }
};

const metadataCache = loadMetadataCache();

/**
 * Helper to fetch headers and build map
 */
const getHeaderInfo = async (spreadsheetId) => {
    const cached = headerCache.get(spreadsheetId);
    if (cached && Date.now() - cached.timestamp < HEADER_CACHE_TTL_MS) {
        return cached.data;
    }

    const response = await callWithRetry(() =>
        sheets.spreadsheets.values.get({
            spreadsheetId,
            range: '1:1',
        })
    );

    const headers = response.data.values ? response.data.values[0] : [];
    const headerMap = buildHeaderMap(headers);
    const data = { headers, headerMap };
    headerCache.set(spreadsheetId, { data, timestamp: Date.now() });
    return data;
};

/**
 * Raw row fetcher
 */
const getSheetRows = async (spreadsheetId, range) => {
    const response = await callWithRetry(() =>
        sheets.spreadsheets.values.get({
            spreadsheetId,
            range,
        })
    );
    return response.data.values || [];
};

/**
 * Parses raw sheet rows into structured pending objects
 */
const parseRows = (rows, spreadsheetId, sheetTitle) => {
    if (rows.length === 0) return [];

    const headers = rows[0];
    const headerMap = buildHeaderMap(headers);

    try {
        validateRequiredColumns(headers, headerMap, ['paymentStatus', 'token', 'timestamp']);
    } catch (e) {
        return [];
    }

    const paymentStatusIdx = getColumnByAlias(headerMap, 'paymentStatus');
    const tokenIdx = getColumnByAlias(headerMap, 'token');
    const timestampIdx = getColumnByAlias(headerMap, 'timestamp');
    const mailSentIdx = getColumnByAlias(headerMap, 'mailSent');

    return rows.slice(1).map((row, index) => {
        const rowIndex = index + 2;
        const status = normalizeValue(row[paymentStatusIdx]).toUpperCase();
        const token = normalizeValue(row[tokenIdx]);
        const timestamp = normalizeValue(row[timestampIdx]);
        const mailSent = mailSentIdx === -1 ? '' : normalizeValue(row[mailSentIdx]).toUpperCase();

        if (status === 'APPROVED' && token === '' && (mailSent === '' || mailSent === 'NO')) {
            console.log(`[Sheets Service] Row ${rowIndex} matches criteria on "${sheetTitle}"`);
            return {
                rowIndex,
                row,
                status,
                token,
                timestamp,
                mailSent,
            };
        }

        // Log "why skipped" for the first 5 rows to avoid bloat
        if (index < 5) {
            let reason = '';
            if (status !== 'APPROVED') reason = `Status is "${status}"`;
            else if (token !== '') reason = 'Token already exists';
            else if (mailSent === 'YES') reason = 'Mail already sent';

            if (reason && (spreadsheetId === env.csSheets.events || spreadsheetId === env.testSheetId)) {
                console.log(`[Sheets Service] Row ${rowIndex} skipped on "${sheetTitle}": ${reason}`);
            }
        }

        return null;
    }).filter(item => item !== null);
};

/**
 * Core function to find pending payments across tabs
 */
const getPendingPayments = async (spreadsheetId) => {
    try {
        // 1. Check metadata cache
        let cachedMetadata = metadataCache.get(spreadsheetId);
        if (cachedMetadata && Date.now() - cachedMetadata.timestamp < METADATA_TTL_MS) {
            const { sheetTitle } = cachedMetadata;
            const rows = await getSheetRows(spreadsheetId, `'${sheetTitle}'!${SHEET_NAME}`);
            if (rows.length > 0) {
                const pending = parseRows(rows, spreadsheetId, sheetTitle);
                return { headers: rows[0], pending, sheetTitle };
            }
        }

        // 2. Scan tabs
        const spreadsheet = await callWithRetry(() =>
            sheets.spreadsheets.get({ spreadsheetId })
        );
        const allSheets = spreadsheet.data.sheets;

        console.log(`[Sheets Service] Scanning ${allSheets.length} tabs in ${spreadsheetId}...`);

        for (const sheet of allSheets) {
            const sheetTitle = sheet.properties.title;
            const range = `'${sheetTitle}'!${SHEET_NAME}`;

            const rows = await getSheetRows(spreadsheetId, range);

            if (rows.length > 0) {
                const headers = rows[0];
                const headerMap = buildHeaderMap(headers);

                try {
                    validateRequiredColumns(headers, headerMap, ['paymentStatus', 'token', 'timestamp']);

                    console.log(`[Sheets Service] ✅ Targeted valid tab: "${sheetTitle}"`);
                    metadataCache.set(spreadsheetId, { sheetTitle, timestamp: Date.now() });
                    saveMetadataCache(metadataCache);

                    const pending = parseRows(rows, spreadsheetId, sheetTitle);
                    return { headers, pending, sheetTitle };
                } catch (e) {
                    continue; // Structural mismatch, check next tab
                }
            }
        }

        return { headers: [], pending: [] };
    } catch (error) {
        if (error.message.includes('Quota exceeded')) {
            console.error(`[Sheets Service] ⚠️ API Quota Exceeded for ${spreadsheetId}.`);
        } else {
            console.error(`[Sheets Service] Error in getPendingPayments for ${spreadsheetId}:`, error.message);
        }
        return { headers: [], pending: [] };
    }
};

const extractEvents = (row, headers) => {
    const day1Events = [];
    const day2Events = [];

    headers.forEach((header, index) => {
        if (index >= row.length) return;

        const cellValue = normalizeValue(row[index]);
        if (!cellValue) return;

        const dayType = getDayType(header);
        if (dayType === 'day1') {
            day1Events.push(cellValue);
        } else if (dayType === 'day2') {
            day2Events.push(cellValue);
        }
    });

    return { day1Events, day2Events };
};

const generateQRCode = async (token) => {
    const scanUrl = `${process.env.BASE_URL}/scan?token=${token}`;
    const qrDataUrl = await QRCode.toDataURL(scanUrl);
    return { qrBase64: qrDataUrl, scanUrl };
};

const updateRowColumns = async (spreadsheetId, rowIndex, updates, headers, headerMap, sheetTitle) => {
    const data = [];

    Object.entries(updates).forEach(([aliasKey, value]) => {
        const colLetter = getColumnLetterByAlias(headers, headerMap, aliasKey);
        if (colLetter) {
            data.push({
                range: `'${sheetTitle}'!${colLetter}${rowIndex}`,
                values: [[value]],
            });
        }
    });

    if (data.length === 0) return null;

    const response = await callWithRetry(() =>
        sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            requestBody: {
                valueInputOption: 'USER_ENTERED',
                data,
            },
        })
    );

    console.log(`[Sheets Service] Updated row ${rowIndex} in ${spreadsheetId}`);
    return response.data;
};

const buildToken = (prefix) => `${prefix}-${randomUUID()}`;

const isValidToken = (token) => TOKEN_REGEX.test(normalizeValue(token));

const getRowByIndex = async (spreadsheetId, rowIndex, headers, sheetTitle) => {
    const lastColumn = indexToColumn(Math.max(headers.length - 1, 0));
    const range = `'${sheetTitle}'!A${rowIndex}:${lastColumn}${rowIndex}`;
    const response = await callWithRetry(() =>
        sheets.spreadsheets.values.get({
            spreadsheetId,
            range,
        })
    );
    return response.data.values ? response.data.values[0] : [];
};

const processPaymentTokens = async (spreadsheetId, pendingPayments, headers, senderType, sheetTitle) => {
    const processed = [];
    const { headerMap } = await getHeaderInfo(spreadsheetId);

    // Validate required columns using aliases
    validateRequiredColumns(headers, headerMap, ['paymentStatus', 'token', 'timestamp', 'tokenGeneratedTime', 'qrLink']);

    for (const payment of pendingPayments) {
        try {
            console.log(`\n[Payment Processing] Processing row ${payment.rowIndex}...`);

            const latestRow = await getRowByIndex(spreadsheetId, payment.rowIndex, headers, sheetTitle);

            // Get column indices using aliases
            const paymentStatusIdx = getColumnByAlias(headerMap, 'paymentStatus');
            const tokenIdx = getColumnByAlias(headerMap, 'token');
            const timestampIdx = getColumnByAlias(headerMap, 'timestamp');
            const mailSentIdx = getColumnByAlias(headerMap, 'mailSent');
            const nameIdx = getColumnByAlias(headerMap, 'name');
            const emailIdx = getColumnByAlias(headerMap, 'email');
            const deptIdx = getColumnByAlias(headerMap, 'department');
            const collegeIdx = getColumnByAlias(headerMap, 'college');

            const status = normalizeValue(latestRow[paymentStatusIdx]).toUpperCase();
            const existingToken = normalizeValue(latestRow[tokenIdx]);
            const qrLinkInSheet = normalizeValue(latestRow[getColumnByAlias(headerMap, 'qrLink')]);
            const timestamp = normalizeValue(latestRow[timestampIdx]);
            const mailSent = mailSentIdx === -1 ? '' : normalizeValue(latestRow[mailSentIdx]).toUpperCase();

            // Double-check eligibility
            if (status !== 'APPROVED' || existingToken !== '') {
                console.log(`[Payment Processing] ⏭️ Row ${payment.rowIndex} no longer eligible - skipping`);
                continue;
            }

            // Generate token and QR data
            const token = buildToken(senderType);
            const { qrBase64, scanUrl } = await generateQRCode(token);
            const { day1Events, day2Events } = extractEvents(latestRow, headers);

            console.log(`[Payment Processing] ✅ Token generated: ${token}`);

            // Student information
            const studentName = nameIdx !== -1 ? normalizeValue(latestRow[nameIdx]) || 'Student' : 'Student';
            const studentEmail = emailIdx !== -1 ? normalizeValue(latestRow[emailIdx]) : '';
            const department = deptIdx !== -1 ? normalizeValue(latestRow[deptIdx]) : 'N/A';
            const college = collegeIdx !== -1 ? normalizeValue(latestRow[collegeIdx]) : 'N/A';

            // Determine registration day
            let dayText = 'N/A';
            if (day1Events.length > 0 && day2Events.length > 0) dayText = 'Both Days';
            else if (day1Events.length > 0) dayText = 'Day 1';
            else if (day2Events.length > 0) dayText = 'Day 2';

            // Generate PDF Buffer
            console.log(`[Payment Processor] 📄 Generating PDF for ${studentName}...`);
            const pdfBuffer = await generateRegistrationPass({
                studentName,
                studentEmail,
                college,
                department,
                day: dayText,
                eventsList: [...day1Events, ...day2Events],
                token,
                qrBase64
            }, 'attendance');

            // Update sheet FIRST (token, QR Link, Time, Pending Mail)
            const updates = {
                token,
                qrLink: scanUrl,
                tokenGeneratedTime: new Date().toISOString(),
                mailSent: 'PENDING',
            };

            await updateRowColumns(spreadsheetId, payment.rowIndex, updates, headers, headerMap, sheetTitle);

            // Send email
            if (studentEmail) {
                console.log(`[Payment Processor] 📤 Sending email to ${studentEmail}...`);
                sendConfirmationEmail({
                    senderType,
                    to: studentEmail,
                    name: studentName,
                    token,
                    pdfBuffer
                }).then(async (emailResult) => {
                    const mailStatus = emailResult ? 'YES' : 'NO';
                    await updateRowColumns(spreadsheetId, payment.rowIndex, { mailSent: mailStatus }, headers, headerMap, sheetTitle);
                }).catch((err) => {
                    console.error(`[Payment Processor] ❌ Email error (Catch) for row ${payment.rowIndex}:`, err);
                    updateRowColumns(spreadsheetId, payment.rowIndex, { mailSent: 'NO' }, headers, headerMap, sheetTitle).catch(() => { });
                });
            } else {
                console.warn(`[Payment Processor] ⚠️ No email found for row ${payment.rowIndex}`);
                await updateRowColumns(spreadsheetId, payment.rowIndex, { mailSent: 'NO_EMAIL' }, headers, headerMap, sheetTitle);
            }

            processed.push({
                rowIndex: payment.rowIndex,
                senderType,
                emailSent: 'QUEUED',
            });
        } catch (error) {
            console.error(`[Payment Processor] ❌ FAILED at row ${payment.rowIndex}:`, error);
        }
    }

    return processed;
};

/**
 * Warms up the in-memory cache by fetching tokens from all configured sheets.
 * Enhanced with TEST_MODE support and better error handling.
 */
const warmUpCache = async () => {
    if (isCacheWarming) return;
    isCacheWarming = true;
    console.log('[Sheets Service] 🚀 Warming up registration cache...');
    console.log(`[Sheets Service] Mode: ${env.testMode ? '🧪 TEST' : '🚀 PRODUCTION'}`);

    const allSheetIds = [
        ...Object.values(env.csSheets),
        ...Object.values(env.ncsSheets),
        env.testSheetId
    ].filter(id => id && id.trim() !== '');

    console.log(`[Sheets Service] Fetching from ${allSheetIds.length} sheets:`, allSheetIds);

    let totalTokens = 0;

    for (const spreadsheetId of allSheetIds) {
        try {
            console.log(`[Sheets Service] Processing sheet: ${spreadsheetId}`);
            
            const { headerMap } = await getHeaderInfo(spreadsheetId);
            const cachedMetadata = metadataCache.get(spreadsheetId);
            const sheetTitle = cachedMetadata?.sheetTitle || 'Form Responses 1';

            const tokenIdx = getColumnByAlias(headerMap, 'token');
            const attendanceIdx = getColumnByAlias(headerMap, 'attendance');
            const lunchIdx = getColumnByAlias(headerMap, 'lunch');

            if (tokenIdx === -1) {
                console.warn(`[Sheets Service] No token column found in sheet ${spreadsheetId}`);
                continue;
            }

            const rows = await getSheetRows(spreadsheetId, `'${sheetTitle}'!${SHEET_NAME}`);
            if (rows.length < 2) {
                console.log(`[Sheets Service] No data rows in sheet ${spreadsheetId}`);
                continue;
            }

            console.log(`[Sheets Service] Found ${rows.length - 1} data rows in sheet ${spreadsheetId}`);

            const headers = rows[0];
            let sheetTokens = 0;

            rows.slice(1).forEach((row, index) => {
                const token = normalizeValue(row[tokenIdx]);
                if (token && isValidToken(token)) {
                    const attendanceVal = attendanceIdx !== -1 ? normalizeValue(row[attendanceIdx]).toUpperCase() : '';
                    const lunchVal = lunchIdx !== -1 ? normalizeValue(row[lunchIdx]).toUpperCase() : '';

                    cacheService.set(token, {
                        spreadsheetId,
                        rowIndex: index + 2,
                        headers,
                        headerMap,
                        sheetTitle,
                        row,
                        attendance: attendanceVal === 'PRESENT',
                        lunch: ['PRESENT', 'SCANNED', 'TRUE', 'TAKEN'].includes(lunchVal) || (lunchVal !== '' && lunchVal !== 'ABSENT' && lunchVal !== 'FALSE')
                    });
                    sheetTokens++;
                    totalTokens++;
                }
            });
            
            console.log(`[Sheets Service] ✅ Sheet ${spreadsheetId}: ${sheetTokens} tokens cached`);
            
        } catch (err) {
            console.error(`[Sheets Service] ❌ Warmup failed for sheet ${spreadsheetId}:`, err.message);
            
            // Check for common Google Sheets API errors
            if (err.message.includes('Unable to parse range')) {
                console.error(`[Sheets Service] 🔍 Sheet format issue - check if sheet has proper structure`);
            } else if (err.message.includes('not found')) {
                console.error(`[Sheets Service] 🔍 Sheet not found - verify spreadsheet ID: ${spreadsheetId}`);
            } else if (err.message.includes('permission')) {
                console.error(`[Sheets Service] 🔍 Permission denied - check service account access for: ${spreadsheetId}`);
            } else if (err.message.includes('Quota')) {
                console.error(`[Sheets Service] 🔍 API Quota exceeded - reduce request frequency`);
            }
        }
    }

    console.log(`[Sheets Service] ✅ Cache warmed up. Total tokens loaded: ${totalTokens}`);
    isCacheWarming = false;
};

// Start warmup on init and setup periodic refresh
warmUpCache().catch(console.error);
if (eventConfig.scanCacheEnabled) {
    const intervalMs = (eventConfig.scanCacheRefreshIntervalMinutes || 15) * 60 * 1000;
    setInterval(() => {
        warmUpCache().catch(err => console.error('[Sheets Service] Periodic cache refresh failed:', err.message));
    }, intervalMs);
}

const findRowByToken = async (spreadsheetId, token) => {
    const normalizedToken = normalizeValue(token);

    // 1. Check cache abstraction (Redis/Mem) for sub-millisecond lookup
    const cached = await cacheService.get(normalizedToken);
    if (cached) {
        return cached;
    }

    const { headers, headerMap } = await getHeaderInfo(spreadsheetId);
    validateRequiredColumns(headers, headerMap, ['token']);

    // Get sheet title from metadata cache (populated by getPendingPayments)
    const cachedMetadata = metadataCache.get(spreadsheetId);
    const sheetTitle = cachedMetadata?.sheetTitle || 'Form Responses 1';

    const tokenCol = getColumnLetterByAlias(headers, headerMap, 'token');
    const range = `'${sheetTitle}'!${tokenCol}2:${tokenCol}`;

    const response = await callWithRetry(() =>
        sheets.spreadsheets.values.get({
            spreadsheetId,
            range,
        })
    );

    const values = response.data.values || [];

    for (let i = 0; i < values.length; i += 1) {
        const cellValue = normalizeValue(values[i][0]);
        if (cellValue && cellValue === normalizedToken) {
            return { rowIndex: i + 2, headers, headerMap, sheetTitle };
        }
    }
    return null;
};

const markAttendancePresent = async (spreadsheetId, rowIndex, headers, headerMap, sheetTitle, token) => {
    try {
        validateRequiredColumns(headers, headerMap, ['attendance']);
        await updateRowColumns(spreadsheetId, rowIndex, { attendance: 'PRESENT' }, headers, headerMap, sheetTitle);
    } catch (error) {
        console.warn(`[Sheets Service] Failed to update attendance for ${token}, retrying once...`);
        try {
            await updateRowColumns(spreadsheetId, rowIndex, { attendance: 'PRESENT' }, headers, headerMap, sheetTitle);
        } catch (retryError) {
            console.error(`[Sheets Service] Persistent failure updating attendance for ${token}:`, retryError.message);
        }
    }
};

const markLunchPresent = async (spreadsheetId, rowIndex, headers, headerMap, sheetTitle, token) => {
    try {
        validateRequiredColumns(headers, headerMap, ['lunch']);
        await updateRowColumns(spreadsheetId, rowIndex, { lunch: 'TAKEN' }, headers, headerMap, sheetTitle);
    } catch (error) {
        console.warn(`[Sheets Service] Failed to update lunch for ${token}, retrying once...`);
        try {
            await updateRowColumns(spreadsheetId, rowIndex, { lunch: 'TAKEN' }, headers, headerMap, sheetTitle);
        } catch (retryError) {
            console.error(`[Sheets Service] Persistent failure updating lunch for ${token}:`, retryError.message);
        }
    }
};

const handleScan = async (token) => {
    const normalizedToken = normalizeValue(token);

    if (!isValidToken(normalizedToken)) {
        const error = new Error('Invalid token format');
        error.statusCode = 400;
        throw error;
    }

    const senderType = normalizedToken.toUpperCase().startsWith('NCS-') ? 'NCS' : 'CS';
    const sheetIds = senderType === 'NCS' ? Object.values(env.ncsSheets) : Object.values(env.csSheets);

    // Add testing sheet to search path
    if (env.testSheetId) sheetIds.push(env.testSheetId);

    // 1. FAST LOOKUP VIA CACHE
    let rowInfo = await cacheService.get(normalizedToken);

    // 2. FALLBACK LOOKUP IF NOT IN CACHE
    if (!rowInfo) {
        for (const id of sheetIds) {
            rowInfo = await findRowByToken(id, normalizedToken);
            if (rowInfo) {
                rowInfo.spreadsheetId = rowInfo.spreadsheetId || id;
                break;
            }
        }
    }

    if (!rowInfo) {
        const error = new Error('Token not found or not approved');
        error.statusCode = 400;
        throw error;
    }

    const { rowIndex, headers, headerMap, attendance, sheetTitle, spreadsheetId } = rowInfo;

    // 3. CHECK STATUS (Memory-First)
    if (attendance === true) {
        const error = new Error('Attendance already marked');
        error.statusCode = 409;
        throw error;
    }

    // 4. UPDATE MEMORY IMMEDIATELY
    rowInfo.attendance = true;
    await cacheService.set(normalizedToken, rowInfo);

    // 5. UPDATE SHEETS ASYNC (Single Instance Safety)
    markAttendancePresent(spreadsheetId, rowIndex, headers, headerMap, sheetTitle, normalizedToken)
        .catch(err => console.error(`[Sheets Service] Critical background update failure for ${normalizedToken}:`, err.message));

    // 6. SEND EMAIL ASYNC
    const nameIdx = getColumnByAlias(headerMap, 'name');
    const emailIdx = getColumnByAlias(headerMap, 'email');
    const row = rowInfo.row || await getRowByIndex(spreadsheetId, rowIndex, headers, sheetTitle);

    console.log(`[Attendance Email] Column resolution - nameIdx: ${nameIdx}, emailIdx: ${emailIdx}`);
    console.log(`[Attendance Email] Row data available: ${row ? 'YES (' + row.length + ' cols)' : 'NO'}`);

    const studentEmail = emailIdx === -1 ? '' : normalizeValue(row[emailIdx]);
    const studentName = nameIdx === -1 ? 'Student' : normalizeValue(row[nameIdx]) || 'Student';

    console.log(`[Attendance Email] Student: ${studentName}, Email: ${studentEmail || 'NOT FOUND'}, SenderType: ${senderType}`);

    if (studentEmail) {
        console.log(`[Attendance Email] Generating QR and sending email to ${studentEmail}...`);
        const { day1Events, day2Events } = extractEvents(row, headers);
        console.log(`[Attendance Email] Events - Day1: [${day1Events.join(', ')}], Day2: [${day2Events.join(', ')}]`);
        generateQRCode(normalizedToken).then(({ qrBase64 }) => {
            console.log(`[Attendance Email] QR generated, sending email now...`);
            return sendAttendanceEmail({
                senderType,
                to: studentEmail,
                name: studentName,
                day1Events,
                day2Events,
                qrBase64,
            });
        }).then(() => {
            console.log(`[Attendance Email] ✅ Email sent successfully to ${studentEmail}`);
        }).catch((err) => {
            console.error(`[Attendance Email] ❌ Failed to send attendance email to ${studentEmail}:`, err.message);
            console.error(`[Attendance Email] ❌ Error stack:`, err.stack);
        });
    } else {
        console.warn(`[Attendance Email] ⚠️ No email found for row ${rowIndex} - emailIdx: ${emailIdx}, skipping email send`);
        if (emailIdx !== -1 && row) {
            console.warn(`[Attendance Email] ⚠️ Raw value at emailIdx[${emailIdx}]: "${row[emailIdx]}"`);
        }
    }

    return { rowIndex, senderType };
};

const handleLunchScan = async (token) => {
    const normalizedToken = normalizeValue(token);

    if (!isValidToken(normalizedToken)) {
        const error = new Error('Invalid token format');
        error.statusCode = 400;
        throw error;
    }

    const senderType = normalizedToken.toUpperCase().startsWith('NCS-') ? 'NCS' : 'CS';
    const sheetIds = senderType === 'NCS' ? Object.values(env.ncsSheets) : Object.values(env.csSheets);

    // Add testing sheet to search path
    if (env.testSheetId) sheetIds.push(env.testSheetId);

    // 1. FAST LOOKUP VIA CACHE
    let rowInfo = await cacheService.get(normalizedToken);

    // 2. FALLBACK LOOKUP
    if (!rowInfo) {
        for (const id of sheetIds) {
            rowInfo = await findRowByToken(id, normalizedToken);
            if (rowInfo) {
                rowInfo.spreadsheetId = rowInfo.spreadsheetId || id;
                break;
            }
        }
    }

    if (!rowInfo) {
        const error = new Error('Token not found or not approved');
        error.statusCode = 400;
        throw error;
    }

    const { rowIndex, headers, headerMap, lunch, sheetTitle, spreadsheetId } = rowInfo;

    // 3. CHECK LUNCH STATUS
    if (lunch === true) {
        const error = new Error('Lunch already scanned');
        error.statusCode = 409;
        throw error;
    }

    // 4. UPDATE MEMORY IMMEDIATELY
    rowInfo.lunch = true;
    await cacheService.set(normalizedToken, rowInfo);

    // 5. GENERATE AND SEND LUNCH PDF
    try {
        const nameIdx = getColumnByAlias(headerMap, 'name');
        const emailIdx = getColumnByAlias(headerMap, 'email');
        const collegeIdx = getColumnByAlias(headerMap, 'college');
        const row = rowInfo.row || await getRowByIndex(spreadsheetId, rowIndex, headers, sheetTitle);
        
        const studentName = nameIdx === -1 ? 'Student' : normalizeValue(row[nameIdx]) || 'Student';
        const studentEmail = emailIdx === -1 ? '' : normalizeValue(row[emailIdx]);
        const college = collegeIdx === -1 ? 'N/A' : normalizeValue(row[collegeIdx]) || 'N/A';
        
        if (studentEmail) {
            const { day1Events, day2Events } = extractEvents(row, headers);
            const { qrBase64 } = await generateQRCode(normalizedToken);
            
            const lunchPdfBuffer = await generateLunchPass({
                studentName,
                studentEmail,
                college,
                department: 'N/A',
                day: 'N/A',
                eventsList: [...day1Events, ...day2Events],
                token: normalizedToken,
                qrBase64,
                venue: 'Main Cafeteria'
            });

            sendLunchEmail({
                senderType: rowInfo.senderType || 'CS',
                to: studentEmail,
                name: studentName,
                token: normalizedToken,
                pdfBuffer: lunchPdfBuffer
            }).then((emailResult) => {
                console.log(`[Lunch Service] Lunch email sent: ${emailResult}`);
            }).catch((err) => {
                console.error(`[Lunch Service] Failed to send lunch email:`, err.message);
            });
        }
    } catch (error) {
        console.error('[Lunch Service] Error generating lunch PDF:', error.message);
    }

    // 6. UPDATE SHEETS ASYNC
    markLunchPresent(spreadsheetId, rowIndex, headers, headerMap, sheetTitle, normalizedToken)
        .catch(err => console.error(`[Sheets Service] Critical lunch update failure for ${normalizedToken}:`, err.message));

    return { rowIndex, senderType };
};

module.exports = {
    getSheetRows,
    getPendingPayments,
    processPaymentTokens,
    extractEvents,
    generateQRCode,
    updateRowColumns,
    buildToken,
    isValidToken,
    handleScan,
    handleLunchScan,
    warmUpCache, // For cache refresh
};
