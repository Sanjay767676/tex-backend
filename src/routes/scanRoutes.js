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
    try {
        const token = req.body && req.body.token ? String(req.body.token).trim() : '';
        if (!token) {
            return res.status(400).json({ error: 'Token is required' });
        }

        const result = await handleScan(token);
        return res.json({
            status: 'ok',
            rowIndex: result.rowIndex,
            senderType: result.senderType,
        });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({
            error: error.message || 'Scan failed',
        });
    }
});

router.get('/scan', async (req, res) => {
    try {
        const token = req.query && req.query.token ? String(req.query.token).trim() : '';
        if (!token) {
            return res.status(400).send('<h1>Error</h1><p>Token missing</p>');
        }

        const result = await handleScan(token);

        // Return a simple success page for browsers
        return res.send(`
            <html>
                <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; text-align: center; background: #f0fdf4;">
                    <div style="padding: 2rem; background: white; border-radius: 1rem; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
                        <h1 style="color: #166534;">✅ Attendance Marked</h1>
                        <p style="font-size: 1.25rem;">Token type: ${result.senderType}</p>
                        <p style="color: #4b5563;">Successfully recorded in Google Sheets</p>
                        <button onclick="window.close()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #166534; color: white; border: none; border-radius: 0.5rem; cursor: pointer;">Close Pass</button>
                    </div>
                </body>
            </html>
        `);
    } catch (error) {
        console.error('Browser scan error:', error);
        const statusCode = error.statusCode || 500;
        const message = error.message || 'Scan failed';
        const color = statusCode === 409 ? '#854d0e' : '#991b1b'; // Yellow for conflict, Red for error
        const title = statusCode === 409 ? '⚠️ Already Marked' : '❌ Scan Failed';

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

router.post('/lunch', scanLimiter, async (req, res) => {
    try {
        const token = req.body && req.body.token ? String(req.body.token).trim() : '';
        if (!token) {
            return res.status(400).json({ error: 'Token is required' });
        }

        const result = await handleLunchScan(token);
        return res.json({
            status: 'ok',
            rowIndex: result.rowIndex,
            senderType: result.senderType,
        });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({
            error: error.message || 'Lunch scan failed',
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
