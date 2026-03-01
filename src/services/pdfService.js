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
    // Canvas matches pixel coordinates in the user provided HTML
    const W = 794;
    const H = 1123;

    const doc = new PDFDocument({ size: [W, H], margin: 0, autoFirstPage: true });
    const bufferPromise = docToBuffer(doc);

    const snsEmblem = loadImage('sns_emblem.png');
    const texperiaLogo = loadImage('texperia_logo.png');
    const snsInstitutions = loadImage('SNS_institutions_logo.png');
    const qrBuffer = qrBase64 ? dataUrlToBuffer(qrBase64) : null;

    // ── Footer gold bar (Rectangle 1)
    doc.rect(0, 1079, 794, 44).fill('#FACB01');

    // ── Logos
    if (snsEmblem) doc.image(snsEmblem, 3, 7, { width: 106, height: 106 });
    if (texperiaLogo) doc.image(texperiaLogo, 83, -46, { width: 647, height: 458 });
    if (snsInstitutions) doc.image(snsInstitutions, 632, 6, { width: 157, height: 110 });

    // ── Title (Registration Pass / Lunch Pass)
    const titleText = title === 'Registration Pass' ? 'Registration Pass' : 'Lunch Pass';
    doc.font('Helvetica-Bold').fontSize(32).fillColor('#000000')
        .text(titleText, 260, 305, { width: 295, align: 'center' });

    // ── Student Details Header
    doc.rect(56, 351, 6, 49).fill('#FFB909'); // Rectangle 2
    doc.font('Helvetica').fontSize(24).fillColor('#000000')
        .text('Student Details :', 64, 373, { width: 185 });

    // ── Student Details Content
    const detailY = 412;
    const detailX = 142;
    doc.font('Helvetica').fontSize(24).fillColor('#000000')
        .text(`Name : ${studentName}`, detailX, detailY, { width: 450 })
        .text(`Email : ${studentEmail}`, detailX, doc.y + 6)
        .text(`College : ${college}`, detailX, doc.y + 6);

    // ── Registered Event / Event Venue Header
    doc.rect(56, 511, 6, 49).fill('#FFB909'); // Rectangle 3
    const secondHeader = title === 'Registration Pass' ? 'Registered Event :' : 'Event  Venue';
    doc.font('Helvetica').fontSize(24).fillColor('#000000')
        .text(secondHeader, 64, 531, { width: 225 });

    // ── Events / Venue Content
    const eventsText = eventsList && eventsList.length > 0 ? eventsList.join('\n') : 'Texperia 2026';
    const secondContent = title === 'Registration Pass' ? eventsText : (venue || 'Main Hall');
    doc.font('Helvetica').fontSize(24).fillColor('#000000')
        .text(secondContent, 142, 570, { width: 600, lineGap: 4 });

    // ── QR Code Label (Attendance QR Code / Lunch QR code)
    const isLunch = title.includes('Lunch');
    const qrLabel = isLunch ? 'Lunch QR code' : 'Attendance QR Code';
    doc.font('Helvetica').fontSize(24).fillColor('#000000')
        .text(qrLabel, 281, 691, { width: 259, align: 'center' });

    // ── QR Image
    if (qrBuffer) {
        // Lunch QR is specific size in HTML, using similar for both
        const qrSize = isLunch ? { w: 263, h: 247, x: 249, y: 715 } : { w: 220, h: 220, x: 287, y: 735 };
        doc.image(qrBuffer, qrSize.x, qrSize.y, { width: qrSize.w, height: qrSize.h });
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

    return buildPDF({
        title,
        studentName,
        studentEmail,
        college,
        eventsList,
        qrBase64,
        venue, // Pass the venue as is (null for attendance)
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
