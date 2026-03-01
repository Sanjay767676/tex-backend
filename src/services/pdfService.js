const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const assetsPath = path.join(__dirname, '..', '..', 'assets', 'images');

// ── Helpers ─────────────────────────────────────────────────────────────────

const loadImage = (filename) => {
    try {
        return fs.readFileSync(path.join(assetsPath, filename));
    } catch {
        return null;
    }
};

const dataUrlToBuffer = (dataUrl) => {
    const base64 = dataUrl.split(',')[1];
    return Buffer.from(base64, 'base64');
};

const docToBuffer = (doc) =>
    new Promise((resolve, reject) => {
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
    });

// ── Core PDF builder ─────────────────────────────────────────────────────────

/**
 * Shared PDF builder for both attendance pass and lunch token.
 * Matches the Figma layout used in the HTML templates.
 */
const buildPDF = async ({
    title,
    studentName,
    studentEmail,
    college,
    eventsList,
    qrBase64,
    venue,
    token,
    extraRows = [],
}) => {
    // A4 at 96dpi → pdfkit points (72dpi): 794px → 595pt, 1123px → 841pt
    const W = 794;
    const H = 1123;

    const doc = new PDFDocument({ size: [W, H], margin: 0, autoFirstPage: true });
    const bufferPromise = docToBuffer(doc);

    const snsEmblem = loadImage('sns_emblem.png');
    const texperiaLogo = loadImage('texperia_logo.png');
    const snsInstitutions = loadImage('SNS_institutions_logo.png');
    const qrBuffer = qrBase64 ? dataUrlToBuffer(qrBase64) : null;

    // ── Footer gold bar (absolute, drawn first so content overlaps cleanly)
    doc.rect(0, H - 44, W, 44).fill('#FACB01');
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#1a1a1a')
        .text('SNS College of Technology — Texperia 2026', 0, H - 28, { align: 'center', width: W });

    // ── Logos
    if (snsEmblem) doc.image(snsEmblem, 3, 7, { width: 106, height: 106 });
    if (texperiaLogo) doc.image(texperiaLogo, 83, -46, { width: 647 });
    if (snsInstitutions) doc.image(snsInstitutions, 632, 6, { width: 157, height: 110 });

    // ── Title
    doc.font('Helvetica-Bold').fontSize(32).fillColor('#000000')
        .text(title, 0, 305, { align: 'center', width: W });

    // ── Participant Details section
    // Gold left accent bar
    doc.rect(56, 351, 6, 49).fill('#FFB909');
    doc.font('Helvetica-Bold').fontSize(24).fillColor('#000')
        .text('Participant Details :', 64, 373, { width: 250 });

    // Detail content
    let detailText = `Name: ${studentName || 'N/A'}   |   College: ${college || 'N/A'}`;
    extraRows.forEach(([label, val]) => {
        if (val && val !== 'N/A') detailText += `\n${label}: ${val}`;
    });
    doc.font('Helvetica').fontSize(24).fillColor('#000')
        .text(detailText, 142, 412, { width: 650, lineGap: 6 });

    // ── Venue / Event section
    doc.rect(56, 511, 6, 49).fill('#FFB909');
    doc.font('Helvetica-Bold').fontSize(24).fillColor('#000')
        .text('Venue Details :', 64, 531, { width: 225 });

    const eventsText = eventsList && eventsList.length > 0
        ? eventsList.join(', ')
        : 'Texperia 2026';
    doc.font('Helvetica').fontSize(24).fillColor('#000')
        .text(`Event : ${eventsText}\nVenue : ${venue || 'Main Hall'}`, 142, 570, { width: 600, lineGap: 6 });

    // ── QR Code label + image
    doc.font('Helvetica-Bold').fontSize(24).fillColor('#000')
        .text(title.includes('Lunch') ? 'Lunch QR Code' : 'Attendance QR Code', 281, 691, { width: 259, align: 'center' });

    if (qrBuffer) {
        doc.image(qrBuffer, 297, 740, { width: 220, height: 220 });
    }

    doc.end();
    return bufferPromise;
};

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate Registration / Attendance Pass PDF
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
    venue,
}, type = 'attendance') => {
    const title = type === 'lunch' ? 'Lunch Token' : 'Registration Pass';
    const extraRows = [];
    if (department && department !== 'N/A') extraRows.push(['Department', department]);
    if (day && day !== 'N/A') extraRows.push(['Day', day]);

    return buildPDF({
        title,
        studentName,
        studentEmail,
        college,
        eventsList,
        qrBase64,
        venue: venue || 'Main Hall',
        token,
        extraRows,
    });
};

/**
 * Generate Lunch Token PDF
 */
const generateLunchPass = async (data) =>
    generateRegistrationPass(data, 'lunch');

module.exports = {
    generateRegistrationPass,
    generateLunchPass,
};
