const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const assetsPath = path.join(__dirname, '..', '..', 'assets', 'images');

/**
 * Helper to load image buffer from disk
 */
const loadImage = (filename) => {
    const imgPath = path.join(assetsPath, filename);
    try {
        return fs.readFileSync(imgPath);
    } catch {
        return null;
    }
};

/**
 * Decode a base64 data URL to a Buffer
 */
const dataUrlToBuffer = (dataUrl) => {
    const base64 = dataUrl.split(',')[1];
    return Buffer.from(base64, 'base64');
};

/**
 * Wrap PDFDocument stream into a Promise<Buffer>
 */
const docToBuffer = (doc) =>
    new Promise((resolve, reject) => {
        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
    });

/**
 * Generate a Registration Pass PDF using PDFKit
 * @param {Object} data
 * @param {String} type - 'attendance' or 'lunch'
 * @returns {Promise<Buffer>}
 */
const generateRegistrationPass = async ({
    studentName,
    studentEmail,
    college,
    department,
    day,
    eventsList,
    token,
    qrBase64,
    venue
}, type = 'attendance') => {
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    const bufferPromise = docToBuffer(doc);

    const W = 595.28; // A4 width in points
    const H = 841.89; // A4 height in points

    const snsEmblem = loadImage('sns_emblem.png');
    const texperiaLogo = loadImage('texperia_logo.png');
    const snsInstitutions = loadImage('SNS_institutions_logo.png');
    const qrBuffer = dataUrlToBuffer(qrBase64);

    // ── Background ─────────────────────────
    doc.rect(0, 0, W, H).fill('#ffffff');

    // ── Gold top bar ───────────────────────
    doc.rect(0, 0, W, 8).fill('#FFB909');

    // ── Header logos ──────────────────────
    if (snsEmblem) doc.image(snsEmblem, 20, 15, { height: 80 });
    if (texperiaLogo) doc.image(texperiaLogo, W / 2 - 120, -20, { width: 240 });
    if (snsInstitutions) doc.image(snsInstitutions, W - 160, 15, { height: 75 });

    // ── Header divider ─────────────────────
    doc.moveTo(20, 105).lineTo(W - 20, 105).strokeColor('#FFB909').lineWidth(2).stroke();

    // ── Title ──────────────────────────────
    const title = type === 'lunch' ? 'Lunch Token' : 'Registration Pass';
    doc.font('Helvetica-Bold').fontSize(26).fillColor('#1a1a1a')
        .text(title, 0, 120, { align: 'center' });

    // ── Gold accent bar under title ────────
    doc.rect(W / 2 - 60, 155, 120, 4).fill('#FFB909');

    // ── Details Section ────────────────────
    let y = 185;
    const labelX = 50;
    const valueX = 200;

    const drawRow = (label, value) => {
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#666666')
            .text(label.toUpperCase(), labelX, y);
        doc.font('Helvetica').fontSize(13).fillColor('#111111')
            .text(value || 'N/A', valueX, y - 1, { width: 300 });
        y += 32;
    };

    drawRow('Name', studentName);
    drawRow('Email', studentEmail);
    drawRow('College', college);
    if (department && department !== 'N/A') drawRow('Department', department);
    if (type === 'attendance') drawRow('Day', day || 'N/A');

    // ── Events / Venue section ─────────────
    if (eventsList && eventsList.length > 0) {
        doc.moveTo(labelX, y).lineTo(W - labelX, y).strokeColor('#eeeeee').lineWidth(1).stroke();
        y += 15;
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#666666').text('EVENTS', labelX, y);
        y += 16;
        eventsList.forEach(ev => {
            doc.font('Helvetica').fontSize(12).fillColor('#111111')
                .text(`• ${ev}`, labelX + 10, y);
            y += 20;
        });
    }

    if (venue && venue !== 'N/A') {
        y += 5;
        drawRow('Venue', venue);
    }

    // ── Divider ────────────────────────────
    doc.moveTo(labelX, y + 10).lineTo(W - labelX, y + 10).strokeColor('#eeeeee').lineWidth(1).stroke();
    y += 30;

    // ── QR Code ───────────────────────────
    const qrLabel = type === 'lunch' ? 'Lunch QR Code' : 'Scan QR Code';
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#666666')
        .text(qrLabel.toUpperCase(), 0, y, { align: 'center' });
    y += 16;

    if (qrBuffer) {
        const qrSize = 180;
        doc.image(qrBuffer, W / 2 - qrSize / 2, y, { width: qrSize, height: qrSize });
        y += qrSize + 10;
    }

    // Token below QR
    doc.font('Helvetica').fontSize(9).fillColor('#999999')
        .text(token || '', 0, y, { align: 'center' });

    // ── Gold footer bar ────────────────────
    doc.rect(0, H - 44, W, 44).fill('#FACB01');
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#1a1a1a')
        .text('SNS College of Technology — Texperia 2026', 0, H - 28, { align: 'center' });

    doc.end();
    return bufferPromise;
};

/**
 * Generate a Lunch Pass PDF
 */
const generateLunchPass = async (data) => {
    return generateRegistrationPass(data, 'lunch');
};

module.exports = {
    generateRegistrationPass,
    generateLunchPass,
};
