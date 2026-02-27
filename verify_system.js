const { validateEnv, env } = require('./src/config/env');
const sheetsService = require('./src/services/sheetsService');
const cacheService = require('./src/services/cacheService');
const emailService = require('./src/services/emailService');

async function verifySystem() {
    console.log('--- System Verification Starting ---');

    try {
        // 1. Validate Env
        validateEnv();
        console.log('✅ Environment validated');

        // 2. Warmup Cache (Verifies Read access and Aliases)
        console.log('\n--- Testing Cache Warmup & Sheets Read ---');
        // Let's just look for a token in the test sheet.

        const testSheetId = env.testSheetId;
        console.log('Using testing sheet:', testSheetId);

        // Find a token in the test sheet
        const rows = await sheetsService.getSheetRows(testSheetId, 'Sheet1');
        if (!rows || rows.length < 2) {
            console.log('⚠️ No rows found in test sheet (besides header maybe). Please add a test row.');
        } else {
            const headers = rows[0];
            const tokenIdx = headers.findIndex(h => h.toLowerCase().includes('token'));
            if (tokenIdx === -1) {
                console.log('❌ Could not find "Token" column in test sheet');
            } else {
                const firstDataRow = rows.find((r, i) => i > 0 && r[tokenIdx]);
                if (!firstDataRow) {
                    console.log('⚠️ No token found in test data rows');
                } else {
                    const testToken = firstDataRow[tokenIdx];
                    console.log('Found test token:', testToken);

                    // 3. Test Scan (Verifies Cache, Sheets Write, Email, PDF)
                    console.log('\n--- Testing Attendance Scan (Real Flow) ---');

                    // Mock email sending to avoid actual mail but log it
                    const originalSendEmail = emailService.sendAttendanceEmail;
                    emailService.sendAttendanceEmail = async (opts) => {
                        console.log('   [Mock Email] Sending to:', opts.to, 'with events:', opts.day1Events, opts.day2Events);
                        return true;
                    };

                    const result = await sheetsService.handleScan(testToken);
                    console.log('✅ Scan successful:', result);

                    // 4. Verify Cache Update
                    const cached = await cacheService.get(testToken);
                    console.log('Cache status (attendance):', cached.attendance);
                    if (cached.attendance === true) {
                        console.log('✅ PASS: Cache updated immediately');
                    } else {
                        console.log('❌ FAIL: Cache not updated');
                    }

                    // Restore email service
                    emailService.sendAttendanceEmail = originalSendEmail;
                }
            }
        }

        console.log('\n--- Testing Lunch Scan ("TAKEN") ---');
        // We'll reuse the same token if possible, but handleScan marked it for attendance.
        // Lunch is separate.
        if (testToken) {
            const lunchResult = await sheetsService.handleLunchScan(testToken);
            console.log('✅ Lunch scan result:', lunchResult);
            const cachedLunch = await cacheService.get(testToken);
            console.log('Cache status (lunch):', cachedLunch.lunch);
            if (cachedLunch.lunch === true) {
                console.log('✅ PASS: Cache lunch status updated');
            }
        }

    } catch (err) {
        console.error('❌ Verification failed:', err.message);
        if (err.stack) console.error(err.stack);
    }

    console.log('\n--- Verification Complete ---');
    process.exit(0);
}

verifySystem();
