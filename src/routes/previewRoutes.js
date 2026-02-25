const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const QRCode = require('qrcode');
const eventConfig = require('../config/eventConfig.json');

const router = express.Router();

async function getQRCodeDataUrl(text) {
    try {
        return await QRCode.toDataURL(text);
    } catch (err) {
        console.error('Error generating QR code for preview:', err);
        return '';
    }
}

async function renderTemplate(templatePath, data) {
    let html = await fs.readFile(templatePath, 'utf8');
    for (const [key, value] of Object.entries(data)) {
        const placeholder = `{{${key}}}`;
        html = html.split(placeholder).join(value);
    }
    return html;
}

router.get('/attendance', async (req, res) => {
    try {
        const templatePath = path.join(__dirname, '../../templates/attendance/attendance.html');
        const qrCodeUrl = await getQRCodeDataUrl('SAMPLE-ATTENDANCE-TOKEN-123');

        const sampleData = {
            name: 'John Doe',
            email: 'john.doe@example.com',
            college: 'SNS College of Technology',
            event: 'Hackathon 2026, Technical Quiz',
            qrCode: qrCodeUrl
        };

        const html = await renderTemplate(templatePath, sampleData);
        res.send(html);
    } catch (error) {
        console.error('Error rendering attendance preview:', error);
        res.status(500).send('Error rendering preview');
    }
});

router.get('/lunch', async (req, res) => {
    try {
        const templatePath = path.join(__dirname, '../../templates/lunch/lunch.html');
        const qrCodeUrl = await getQRCodeDataUrl('SAMPLE-LUNCH-TOKEN-456');

        const sampleData = {
            name: 'John Doe',
            college: 'SNS College of Technology',
            event: eventConfig.eventName || 'Texperia 2026',
            venue: eventConfig.lunchVenue || 'Main Block Cafeteria',
            qrCode: qrCodeUrl
        };

        const html = await renderTemplate(templatePath, sampleData);
        res.send(html);
    } catch (error) {
        console.error('Error rendering lunch preview:', error);
        res.status(500).send('Error rendering preview');
    }
});

module.exports = router;
