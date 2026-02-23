const express = require('express');
const rateLimit = require('express-rate-limit');
const QRCode = require('qrcode');
const { handleScan } = require('../services/sheetsService');

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
        console.log('QR requested for token:', token);

        if (!token) {
            return res.status(400).send('Token missing');
        }

        const qrBuffer = await QRCode.toBuffer(token, {
            type: 'png',
            width: 300,
            margin: 2,
        });

        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'no-cache');
        return res.send(qrBuffer);
    } catch (error) {
        console.error('QR generation error:', error);
        return res.status(500).send('QR generation failed');
    }
});

module.exports = router;
