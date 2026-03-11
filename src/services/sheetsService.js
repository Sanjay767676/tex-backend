const { env } = require('../config/env');
const sheets = require('../config/googleSheets');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { sendConfirmationEmail, sendAttendanceEmail, sendLunchEmail, sendSimpleAttendanceConfirmationEmail } = require('./emailService');
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
const performanceMonitor = require('../utils/performanceMonitor');

const SHEET_NAME = 'A:ZZ';

// ─── Rate limiting & write-queue ───────────────────────────────────────────
const MIN_REQUEST_GAP_MS = 1000;
let lastRequestTime = 0;

// ─── Token Bucket Rate Limiter ──────────────────────────────────────────────
class TokenBucket {
    constructor(limit, interval) {
        this.limit = limit;
        this.interval = interval;
        this.tokens = limit;
        this.lastRefill = Date.now();
    }

    async consume() {
        this.refill();
        if (this.tokens < 1) {
            const waitTime = this.interval / this.limit;
            await new Promise(resolve => setTimeout(resolve, waitTime));
            return this.consume();
        }
        this.tokens -= 1;
    }

    refill() {
        const now = Date.now();
        const elapsed = now - this.lastRefill;
        const refillAmount = Math.floor(elapsed * (this.limit / this.interval));
        if (refillAmount > 0) {
            this.tokens = Math.min(this.limit, this.tokens + refillAmount);
            this.lastRefill = now;
        }
    }
}

const requestLimiter = new TokenBucket(50, 60000); // 50 requests per minute

const throttle = async () => {
    await requestLimiter.consume();
    const now = Date.now();
    const wait = Math.max(0, MIN_REQUEST_GAP_MS - (now - lastRequestTime));
    lastRequestTime = now + wait;
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
};

/**
 * Wraps a Sheets API call with throttling + exponential back-off retry.
 * Retries on 429 (rate limit) and 503 (service unavailable / quota).
 */
const callWithRetry = async (fn, maxRetries = 8) => {
    const apiStartTime = Date.now();
    let attempt = 0;
    let isQuotaError = false;
    
    while (true) {
        await throttle();
        try {
            const result = await fn();
            const duration = Date.now() - apiStartTime;
            performanceMonitor.recordAPICall(duration, attempt > 0, isQuotaError);
            return result;
        } catch (err) {
            const code = err?.code || err?.response?.status;
            const isRetryable =
                code === 429 ||
                code === 503 ||
                (err.message && err.message.includes('Quota exceeded')) ||
                (err.message && err.message.includes('Rate Limit'));

            if (code === 429 || (err.message && err.message.includes('Quota'))) {
                isQuotaError = true;
            }

            attempt++;
            if (!isRetryable || attempt > maxRetries) {
                const duration = Date.now() - apiStartTime;
                performanceMonitor.recordAPICall(duration, true, isQuotaError);
                throw err;
            }

            const backoff = Math.min(2000 * Math.pow(2, attempt - 1), 30000);
            const jitter = Math.floor(Math.random() * 1000);
            console.log(`[Sheets Service] ⏳ Quota/rate-limit hit – retrying in ${backoff + jitter}ms (attempt ${attempt}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, backoff + jitter));
        }
    }
};

/**
 * Consolidates multiple row updates into a single batchUpdate call every few seconds.
 */
class UpdateBatcher {
    constructor(delayMs = 5000) {
        this.delayMs = delayMs;
        this.batches = new Map(); // spreadsheetId -> { timeout, updates: [{range, values}] }
    }

    add(spreadsheetId, range, values, callback) {
        if (!this.batches.has(spreadsheetId)) {
            this.batches.set(spreadsheetId, {
                updates: [],
                callbacks: [],
                timeout: setTimeout(() => this.flush(spreadsheetId), this.delayMs)
            });
        }

        const batch = this.batches.get(spreadsheetId);
        batch.updates.push({ range, values });
        if (callback) batch.callbacks.push(callback);
    }

    async flush(spreadsheetId) {
        const batch = this.batches.get(spreadsheetId);
        if (!batch || batch.updates.length === 0) return;

        this.batches.delete(spreadsheetId);

        try {
            console.log(`[Batcher] 🚀 Flushing ${batch.updates.length} updates to ${spreadsheetId}`);
            const result = await callWithRetry(() =>
                sheets.spreadsheets.values.batchUpdate({
                    spreadsheetId,
                    requestBody: {
                        valueInputOption: 'USER_ENTERED',
                        data: batch.updates,
                    },
                })
            );
            batch.callbacks.forEach(cb => cb(null, result.data));
        } catch (err) {
            console.error(`[Batcher] ❌ Batch update failed for ${spreadsheetId}:`, err.message);
            batch.callbacks.forEach(cb => cb(err));
        }
    }
}

const batcher = new UpdateBatcher();
// ─────────────────────────────────────────────────────────────────────────────
const HEADER_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const METADATA_TTL_MS = 24 * 60 * 60 * 1000;
const TOKEN_REGEX = /^(CS--|CSL-|NCSL-|NCS--|NCS-|LUNCH-)[a-f0-9]{8}/i;
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

const isSelectedEventValue = (value) => {
    const normalized = normalizeValue(value).toLowerCase();
    if (!normalized) return false;

    // Exclude common negative / placeholder values from forms/sheets
    const negativeValues = new Set(['no', 'n', 'false', '0', 'na', 'n/a', '-', '--']);
    return !negativeValues.has(normalized);
};

const isAffirmativeMarker = (value) => {
    const normalized = normalizeValue(value).toLowerCase();
    return ['yes', 'y', 'true', '1', 'selected', 'checked'].includes(normalized);
};

const splitEventNamesFromCell = (value) => {
    return normalizeValue(value)
        .split(/,|\n|\|/)
        .map(item => normalizeValue(item))
        .filter(Boolean);
};

const pushUniqueEvent = (list, eventName) => {
    const normalized = normalizeValue(eventName);
    if (!normalized) return;

    const exists = list.some(item => normalizeValue(item).toLowerCase() === normalized.toLowerCase());
    if (!exists) list.push(normalized);
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

        const headerText = normalizeValue(header);
        const cellValue = normalizeValue(row[index]);
        if (!isSelectedEventValue(cellValue)) return;

        const dayType = getDayType(headerText);
        if (!dayType) return;

        const targetList = dayType === 'day1' ? day1Events : day2Events;

        // Case 1: checkbox-style sheets => header is event name, cell is YES/TRUE/1
        if (isAffirmativeMarker(cellValue)) {
            pushUniqueEvent(targetList, headerText);
            return;
        }

        // Case 2: dropdown/multiselect sheets => cell stores event names directly
        const parsedEvents = splitEventNamesFromCell(cellValue);
        if (parsedEvents.length > 0) {
            parsedEvents.forEach((eventName) => pushUniqueEvent(targetList, eventName));
            return;
        }

        // Fallback
        pushUniqueEvent(targetList, headerText);
    });

    return { day1Events, day2Events };
};

const generateQRCode = async (token, endpoint = 'scan') => {
    const scanUrl = `${process.env.BASE_URL}/${endpoint}?token=${token}`;
    const qrDataUrl = await QRCode.toDataURL(scanUrl);
    return { qrBase64: qrDataUrl, scanUrl };
};

/**
 * Exact string match column finder — avoids alias ambiguity.
 * @param {Array} headers
 * @param {string} exactHeader
 * @returns {number} index or -1
 */
const exactColumnIndex = (headers, exactHeader) => {
    return headers.findIndex(h => h && h.trim() === exactHeader);
};

const updateRowColumns = (spreadsheetId, rowIndex, updates, headers, headerMap, sheetTitle) => {
    return new Promise((resolve, reject) => {
        const data = [];

        Object.entries(updates).forEach(([aliasKey, value]) => {
            const colLetter = getColumnLetterByAlias(headers, headerMap, aliasKey);
            if (colLetter) {
                batcher.add(
                    spreadsheetId,
                    `'${sheetTitle}'!${colLetter}${rowIndex}`,
                    [[value]],
                    (err, result) => (err ? reject(err) : resolve(result))
                );
            }
        });
    });
};

const buildToken = (prefix, isLunch = false) => {
    const id = randomUUID().split('-')[0]; // 8-char hex
    if (isLunch) {
        return prefix === 'CS' ? `CSL-${id}` : `NCSL-${id}`;
    }
    if (prefix === 'CS') return `CS--${id}`;
    if (prefix === 'NCS') return `NCS--${id}`;
    return `${prefix}-${id}`;
};

const isValidToken = (token) => {
    const val = normalizeValue(token);
    // Support both new and old formats during transition if needed, 
    // but prioritized the new ones.
    return TOKEN_REGEX.test(val) || /^[A-Z0-9-]+-[0-9a-f-]{8,}$/i.test(val);
};

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
            const tokenGenStart = Date.now();
            const token = buildToken(senderType);
            const { qrBase64, scanUrl } = await generateQRCode(token);
            const { day1Events, day2Events } = extractEvents(latestRow, headers);

            console.log(`[Payment Processing] ✅ Token generated: ${token}`);
            const tokenGenEnd = Date.now();
            performanceMonitor.endTimer('tokenGeneration', tokenGenStart);

            // Student information
            const studentName = nameIdx !== -1 ? normalizeValue(latestRow[nameIdx]) || 'Student' : 'Student';
            const studentEmail = emailIdx !== -1 ? normalizeValue(latestRow[emailIdx]) : '';
            const department = deptIdx !== -1 ? normalizeValue(latestRow[deptIdx]) : 'N/A';
            const college = collegeIdx !== -1 ? normalizeValue(latestRow[collegeIdx]) : 'N/A';

            // Write token to sheet FIRST (prevents duplicate processing on next cycle)
            const updates = {
                token,
                qrLink: scanUrl,
                tokenGeneratedTime: new Date().toISOString(),
                mailSent: 'PENDING',
            };
            await updateRowColumns(spreadsheetId, payment.rowIndex, updates, headers, headerMap, sheetTitle);
            console.log(`[Payment Processing] 💾 Token written to sheet for row ${payment.rowIndex}`);

            // Determine registration day - check explicit Day column first
            let dayText = 'N/A';
            const dayIdx = getColumnByAlias(headerMap, 'registrationDay');
            if (dayIdx !== -1 && latestRow[dayIdx]) {
                // Use explicit day column if available
                const dayValue = normalizeValue(latestRow[dayIdx]);
                if (dayValue) {
                    // Extract day from formats like "Day 1  - 12.03.2026" or "Day 2  - 13.03.2026"
                    if (dayValue.toLowerCase().includes('day 1')) {
                        dayText = 'Day 1';
                    } else if (dayValue.toLowerCase().includes('day 2')) {
                        dayText = 'Day 2';
                    } else if (dayValue.toLowerCase().includes('both')) {
                        dayText = 'Both Days';
                    } else if (dayValue.includes('1') && !dayValue.includes('2')) {
                        dayText = 'Day 1';
                    } else if (dayValue.includes('2') && !dayValue.includes('1')) {
                        dayText = 'Day 2';
                    } else if (dayValue.includes('1') && dayValue.includes('2')) {
                        dayText = 'Both Days';
                    }
                }
            }
            
            // Fallback: infer from events if no explicit day column
            if (dayText === 'N/A') {
                if (day1Events.length > 0 && day2Events.length > 0) dayText = 'Both Days';
                else if (day1Events.length > 0) dayText = 'Day 1';
                else if (day2Events.length > 0) dayText = 'Day 2';
            }

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
                qrBase64,
                venue: null // Hide venue in registration pass as requested
            }, 'attendance');

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

const warmUpCache = async () => {
    if (isCacheWarming) return;
    isCacheWarming = true;

    try {
        console.log('[Sheets Service] 🚀 Warming up registration cache...');
        console.log(`[Sheets Service] Mode: ${env.testMode ? '🧪 TEST' : '🚀 PRODUCTION'}`);

        const allSheetIds = [
            ...Object.values(env.csSheets),
            ...Object.values(env.ncsSheets)
        ].filter(id => id && id.trim() !== '');

        console.log(`[Sheets Service] Fetching from ${allSheetIds.length} sheets:`, allSheetIds);

        const sheetContexts = [];

        // Phase 1: Get titles and headers in parallel
        for (const spreadsheetId of allSheetIds) {
            try {
                const { headers, headerMap } = await getHeaderInfo(spreadsheetId);
                const cachedMetadata = metadataCache.get(spreadsheetId);
                const sheetTitle = cachedMetadata?.sheetTitle || 'Form Responses 1';

                sheetContexts.push({
                    spreadsheetId,
                    headers,
                    headerMap,
                    sheetTitle,
                    tokenIdx: getColumnByAlias(headerMap, 'token'),
                    attendanceIdx: getColumnByAlias(headerMap, 'attendance'),
                    lunchIdx: getColumnByAlias(headerMap, 'lunch')
                });
            } catch (err) {
                console.warn(`[Warmup] ⚠️ Failed for ${spreadsheetId}: ${err.message}`);
            }
        }

        // Phase 2: Batch fetch data for all sheets
        let totalTokens = 0;
        for (const ctx of sheetContexts) {
            if (ctx.tokenIdx === -1) continue;

            const rows = await getSheetRows(ctx.spreadsheetId, `'${ctx.sheetTitle}'!${SHEET_NAME}`);
            if (rows && rows.length > 1) {
                let sheetTokens = 0;
                rows.slice(1).forEach((row, i) => {
                    const rowIndex = i + 2;
                    const token = normalizeValue(row[ctx.tokenIdx]);
                    if (token && isValidToken(token)) {
                        const attendanceVal = ctx.attendanceIdx !== -1 ? normalizeValue(row[ctx.attendanceIdx]).toUpperCase() : '';
                        const lunchVal = ctx.lunchIdx !== -1 ? normalizeValue(row[ctx.lunchIdx]).toUpperCase() : '';

                        cacheService.set(token, {
                            spreadsheetId: ctx.spreadsheetId,
                            rowIndex,
                            headers: ctx.headers,
                            headerMap: ctx.headerMap,
                            sheetTitle: ctx.sheetTitle,
                            row,
                            attendance: attendanceVal === 'PRESENT',
                            lunch: ['PRESENT', 'SCANNED', 'TRUE', 'TAKEN'].includes(lunchVal) || (lunchVal !== '' && lunchVal !== 'ABSENT' && lunchVal !== 'FALSE')
                        });
                        sheetTokens++;
                        totalTokens++;
                    }
                });
                console.log(`[Warmup] ✅ Sheet ${ctx.spreadsheetId}: ${sheetTokens} tokens`);
            }
        }
        console.log(`[Sheets Service] ✨ Warmup complete. Total: ${totalTokens}`);
    } catch (error) {
        console.error('[Sheets Service] ❌ Warmup failed:', error.message);
    } finally {
        isCacheWarming = false;
    }
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

    const tokenColIdx = getColumnByAlias(headerMap, 'token');
    const lastColumn = indexToColumn(Math.max(headers.length - 1, 0));
    const range = `'${sheetTitle}'!A2:${lastColumn}`; // Fetch everything at once to find row + data

    const response = await callWithRetry(() =>
        sheets.spreadsheets.values.get({
            spreadsheetId,
            range,
        })
    );

    const values = response.data.values || [];

    for (let i = 0; i < values.length; i += 1) {
        const row = values[i];
        if (tokenColIdx !== -1) {
            const cellValue = normalizeValue(row[tokenColIdx]);
            if (cellValue && cellValue === normalizedToken) {
                return { rowIndex: i + 2, headers, headerMap, sheetTitle, row };
            }
        }
    }

    // fallback: check Token_2 column if searching for a lunch token
    const upToken = normalizedToken.toUpperCase();
    if (upToken.startsWith('LUNCH-') || upToken.startsWith('CSL-')) {
        const token2Idx = getColumnByAlias(headerMap, 'token2');
        if (token2Idx !== -1) {
            for (let i = 0; i < values.length; i += 1) {
                const cellValue = normalizeValue(values[i][token2Idx]);
                if (cellValue && cellValue === normalizedToken) {
                    return { rowIndex: i + 2, headers, headerMap, sheetTitle, row: values[i] };
                }
            }
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

const handleScan = async (token, secret) => {
    // 1. Authorization check
    if (secret !== eventConfig.scannerSecret) {
        console.warn(`[Scan API] ⚠️ Unauthorized scan attempt with token: ${token}`);
        const error = new Error('Unauthorized scanner. Please use the official Texperia app.');
        error.statusCode = 403;
        throw error;
    }

    const normalizedToken = normalizeValue(token);

    // If a lunch token is scanned at the attendance endpoint, redirect it
    if (normalizedToken.toUpperCase().startsWith('LUNCH-') || normalizedToken.toUpperCase().startsWith('CSL-')) {
        console.log(`[Scan Redirection] 🔄 Redirecting lunch token ${normalizedToken} to handleLunchScan`);
        return await handleLunchScan(token, secret);
    }

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
        const error = new Error('already marked');
        error.statusCode = 409;
        throw error;
    }

    // 4. UPDATE MEMORY IMMEDIATELY
    rowInfo.attendance = true;
    await cacheService.set(normalizedToken, rowInfo);

    // 5. UPDATE SHEETS ASYNC (Internally queued in updateRowColumns)
    markAttendancePresent(spreadsheetId, rowIndex, headers, headerMap, sheetTitle, normalizedToken)
        .catch(err => console.error(`[Sheets Service] Queue execution failure for ${normalizedToken}:`, err.message));

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
        const allEvents = [...day1Events, ...day2Events];
        const collegeIdx = getColumnByAlias(headerMap, 'college');
        const college = collegeIdx === -1 ? 'N/A' : normalizeValue(row[collegeIdx]) || 'N/A';

        // Simple background task: resolve Day and send confirmation email
        (async () => {
            try {
                // Determine registration day - check explicit Day column first
                let dayText = 'N/A';
                const dayIdx = getColumnByAlias(headerMap, 'registrationDay');
                if (dayIdx !== -1 && row[dayIdx]) {
                    const dayValue = normalizeValue(row[dayIdx]);
                    if (dayValue) {
                        if (dayValue.toLowerCase().includes('day 1')) dayText = 'Day 1';
                        else if (dayValue.toLowerCase().includes('day 2')) dayText = 'Day 2';
                        else if (dayValue.toLowerCase().includes('both')) dayText = 'Both Days';
                        else if (dayValue.includes('1') && !dayValue.includes('2')) dayText = 'Day 1';
                        else if (dayValue.includes('2') && !dayValue.includes('1')) dayText = 'Day 2';
                        else if (dayValue.includes('1') && dayValue.includes('2')) dayText = 'Both Days';
                    }
                }

                // Fallback: infer from events if no explicit day column
                if (dayText === 'N/A') {
                    const { day1Events, day2Events } = extractEvents(row, headers);
                    if (day1Events.length > 0 && day2Events.length > 0) dayText = 'Both Days';
                    else if (day1Events.length > 0) dayText = 'Day 1';
                    else if (day2Events.length > 0) dayText = 'Day 2';
                }

                console.log(`[Scan Process] Sending simple confirmation for ${dayText} to ${studentEmail}`);
                await sendSimpleAttendanceConfirmationEmail({
                    senderType,
                    to: studentEmail,
                    name: studentName,
                    dayText: dayText
                });
                console.log(`[Workflow] ✅ Attendance confirmed for ${studentName} (${dayText})`);

            } catch (err) {
                console.error(`[Scan Process] ❌ Simple confirmation flow failed for ${studentEmail}:`, err.message);
            }
        })();

    } else {
        console.warn(`[Attendance Email] ⚠️ No email found for row ${rowIndex} - emailIdx: ${emailIdx}, skipping email send`);
        if (emailIdx !== -1 && row) {
            console.warn(`[Attendance Email] ⚠️ Raw value at emailIdx[${emailIdx}]: "${row[emailIdx]}"`);
        }
    }

    return {
        message: 'Marked attendance',
        rowIndex,
        senderType,
        scanType: 'attendance',
        status: 'success'
    };
};

const handleLunchScan = async (token, secret) => {
    // 1. Authorization check
    if (secret !== eventConfig.scannerSecret) {
        console.warn(`[Lunch API] ⚠️ Unauthorized scan attempt with token: ${token}`);
        const error = new Error('Unauthorized scanner. Please use the official Texperia app.');
        error.statusCode = 403;
        throw error;
    }

    const normalizedToken = normalizeValue(token);
    const upToken = normalizedToken.toUpperCase();

    // Enforce lunch-only prefixes at this endpoint
    const isLunchPrefix = upToken.startsWith('LUNCH-') || upToken.startsWith('CSL-') || upToken.startsWith('NCSL-');
    if (!isLunchPrefix) {
        const error = new Error('This QR is for attendance, not lunch.');
        error.statusCode = 400;
        throw error;
    }

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

    const { rowIndex, headers, headerMap, lunch, sheetTitle, spreadsheetId, senderType: cachedSenderType } = rowInfo;
    const resolvedSenderType = cachedSenderType || senderType;

    // 3. CHECK LUNCH STATUS using alias
    const lunchStatusIdx = getColumnByAlias(headerMap, 'lunch');
    let currentLunchStatus = '';
    if (lunchStatusIdx !== -1) {
        const latestRow = rowInfo.row || [];
        currentLunchStatus = normalizeValue(latestRow[lunchStatusIdx]).toUpperCase();
    }

    // Prevent double scan — check both cache flag and sheet value
    if (lunch === true || ['USED', 'TAKEN', 'PRESENT'].includes(currentLunchStatus)) {
        const error = new Error('luchh token alredy availed');
        error.statusCode = 409;
        throw error;
    }

    // 4. UPDATE MEMORY IMMEDIATELY
    rowInfo.lunch = true;
    await cacheService.set(normalizedToken, rowInfo);

    // 5. QUEUE UPDATE IN SHEET (No longer nested in globalWriteQueue.add)
    updateRowColumns(spreadsheetId, rowIndex, { lunch: 'TAKEN' }, headers, headerMap, sheetTitle)
        .then(() => console.log(`[Lunch Scan] ✅ lunch token marked — row ${rowIndex}`))
        .catch(err => console.error(`[Sheets Service] Critical lunch update failure for ${normalizedToken}:`, err.message));

    return {
        message: 'Marked lunch',
        rowIndex,
        senderType: resolvedSenderType,
        scanType: 'lunch',
        status: 'success'
    };
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
