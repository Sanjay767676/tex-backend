const express = require('express');
const rateLimit = require('express-rate-limit');
const QRCode = require('qrcode');
const { handleScan, handleLunchScan } = require('../services/sheetsService');

const router = express.Router();

// Add JSON body parser to this router
router.use(express.json());

const scanLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
});

router.post('/scan', scanLimiter, async (req, res) => {
    const token = req.body && req.body.token ? String(req.body.token).trim() : '';
    
    // Enhanced logging
    console.log(`[Scan API] POST request - Token: ${token || 'MISSING'}`);
    console.log(`[Scan API] Request headers:`, {
        userAgent: req.headers['user-agent'],
        contentType: req.headers['content-type'],
        origin: req.headers.origin
    });
    
    if (!token) {
        console.log(`[Scan API] ❌ Missing token in request body`);
        return res.status(400).json({ 
            status: "error",
            message: "Token is required in request body",
            code: "MISSING_TOKEN"
        });
    }

    try {
        console.log(`[Scan API] Processing token: ${token}`);
        const result = await handleScan(token);
        
        console.log(`[Scan API] ✅ Success - Row: ${result.rowIndex}, Type: ${result.senderType}`);
        
        return res.json({
            status: 'ok',
            message: 'Attendance marked successfully',
            data: {
                rowIndex: result.rowIndex,
                senderType: result.senderType,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        console.error(`[Scan API] ❌ Error - Status: ${statusCode}, Message: ${error.message}`);
        console.error(`[Scan API] 🔍 Error details:`, {
            code: error.code,
            stack: error.stack?.split('\n')[0],
            token: token
        });
        
        return res.status(statusCode).json({
            status: "error",
            message: error.message || 'Scan processing failed',
            code: error.statusCode === 409 ? "ALREADY_SCANNED" : 
                  error.statusCode === 400 ? "INVALID_TOKEN" : 
                  "SYSTEM_ERROR"
        });
    }
});

router.get('/scan', async (req, res) => {
    try {
        const token = req.query && req.query.token ? String(req.query.token).trim() : '';
        if (!token) {
            if (req.headers.accept && req.headers.accept.includes('application/json')) {
                return res.status(400).json({ error: 'Token missing' });
            }
            return res.status(400).send('<h1>Error</h1><p>Token missing</p>');
        }

        console.log(`[Scan Route] Processing GET scan for token: ${token}`);
        const result = await handleScan(token);

        // If explicitly requested JSON (often by custom scanner apps)
        if (req.query.format === 'json' || (req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.json({
                status: 'ok',
                message: 'Attendance marked',
                senderType: result.senderType,
                rowIndex: result.rowIndex
            });
        }

        // Return a simple success page for browsers
        return res.send(`
            <html>
                <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; text-align: center; background: #f0fdf4;">
                    <div style="padding: 2.5rem; background: white; border-radius: 1.5rem; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1); border-top: 5px solid #16a34a;">
                        <div style="font-size: 4rem; margin-bottom: 1rem;">✅</div>
                        <h1 style="color: #166534; margin: 0;">Attendance Marked</h1>
                        <p style="font-size: 1.25rem; color: #374151; margin: 1rem 0;">Type: <strong>${result.senderType}</strong></p>
                        <p style="color: #6b7280;">Your attendance has been recorded successfully.</p>
                        <button onclick="window.close()" style="margin-top: 1.5rem; padding: 0.75rem 1.5rem; background: #166534; color: white; border: none; border-radius: 0.75rem; cursor: pointer; font-weight: bold; font-size: 1rem;">Close Pass</button>
                    </div>
                </body>
            </html>
        `);
    } catch (error) {
        console.error('[Scan Route] Browser scan error:', error);
        const statusCode = error.statusCode || 500;
        const message = error.message || 'Scan failed';

        // JSON error response
        if (req.query.format === 'json' || (req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.status(statusCode).json({ error: message, code: statusCode });
        }

        const color = statusCode === 409 ? '#854d0e' : '#991b1b';
        const bg = statusCode === 409 ? '#fefce8' : '#fef2f2';
        const title = statusCode === 409 ? '⚠️ Already Marked' : '❌ Scan Failed';

        return res.status(statusCode).send(`
            <html>
                <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; text-align: center; background: ${bg};">
                    <div style="padding: 2.5rem; background: white; border-radius: 1.5rem; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1); border-top: 5px solid ${color};">
                        <h1 style="color: ${color}; margin-top: 0;">${title}</h1>
                        <p style="font-size: 1.2rem; color: #374151;">${message}</p>
                        <button onclick="window.close()" style="margin-top: 1.5rem; padding: 0.75rem 1.5rem; background: #4b5563; color: white; border: none; border-radius: 0.75rem; cursor: pointer; font-weight: bold;">Return to Pass</button>
                    </div>
                </body>
            </html>
        `);
    }
});

router.post('/lunch', scanLimiter, async (req, res) => {
    const token = req.body && req.body.token ? String(req.body.token).trim() : '';
    
    // Enhanced logging
    console.log(`[Lunch API] POST request - Token: ${token || 'MISSING'}`);
    console.log(`[Lunch API] Request headers:`, {
        userAgent: req.headers['user-agent'],
        contentType: req.headers['content-type'],
        origin: req.headers.origin
    });
    
    if (!token) {
        console.log(`[Lunch API] ❌ Missing token in request body`);
        return res.status(400).json({ 
            status: "error",
            message: "Token is required in request body",
            code: "MISSING_TOKEN"
        });
    }

    try {
        console.log(`[Lunch API] Processing token: ${token}`);
        const result = await handleLunchScan(token);
        
        console.log(`[Lunch API] ✅ Success - Row: ${result.rowIndex}, Type: ${result.senderType}`);
        
        return res.json({
            status: 'ok',
            message: 'Lunch marked successfully',
            data: {
                rowIndex: result.rowIndex,
                senderType: result.senderType,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        console.error(`[Lunch API] ❌ Error - Status: ${statusCode}, Message: ${error.message}`);
        console.error(`[Lunch API] 🔍 Error details:`, {
            code: error.code,
            stack: error.stack?.split('\n')[0],
            token: token
        });
        
        return res.status(statusCode).json({
            status: "error",
            message: error.message || 'Lunch scan processing failed',
            code: error.statusCode === 409 ? "ALREADY_SCANNED" : 
                  error.statusCode === 400 ? "INVALID_TOKEN" : 
                  "SYSTEM_ERROR"
        });
    }
});

router.get('/lunch', async (req, res) => {
    try {
        const token = req.query && req.query.token ? String(req.query.token).trim() : '';
        if (!token) {
            return res.status(400).send('<h1>Error</h1><p>Token missing</p>');
        }

        const result = await handleLunchScan(token);

        return res.send(`
            <html>
                <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; text-align: center; background: #fff7ed;">
                    <div style="padding: 2rem; background: white; border-radius: 1rem; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
                        <h1 style="color: #9a3412;">🍱 Lunch Scanned</h1>
                        <p style="font-size: 1.25rem;">Token type: ${result.senderType}</p>
                        <p style="color: #4b5563;">Successfully recorded lunch status</p>
                        <button onclick="window.close()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #9a3412; color: white; border: none; border-radius: 0.5rem; cursor: pointer;">Close</button>
                    </div>
                </body>
            </html>
        `);
    } catch (error) {
        console.error('Browser lunch scan error:', error);
        const statusCode = error.statusCode || 500;
        const message = error.message || 'Lunch scan failed';
        const color = statusCode === 409 ? '#854d0e' : '#991b1b';
        const title = statusCode === 409 ? '⚠️ Already Scanned' : '❌ Lunch Scan Failed';

        return res.status(statusCode).send(`
            <html>
                <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; text-align: center; background: #fef2f2;">
                    <div style="padding: 2rem; background: white; border-radius: 1rem; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
                        <h1 style="color: ${color};">${title}</h1>
                        <p style="font-size: 1.25rem;">${message}</p>
                        <button onclick="window.close()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #4b5563; color: white; border: none; border-radius: 0.5rem; cursor: pointer;">Close</button>
                    </div>
                </body>
            </html>
        `);
    }
});

module.exports = router;
