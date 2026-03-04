const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const performanceMonitor = require('../utils/performanceMonitor');

const assetsPath = path.join(__dirname, '..', '..', 'assets', 'images');
const imageCache = new Map();

// ── Helpers ─────────────────────────────────────────────────────────────────

const loadImage = (filename) => {
    if (imageCache.has(filename)) return imageCache.get(filename);
    try {
        const buffer = fs.readFileSync(path.join(assetsPath, filename));
        imageCache.set(filename, buffer);
        return buffer;
    } catch {
        return null;
    }
};

const dataUrlToBuffer = (dataUrl) => {
    const base64 = dataUrl.split(',')[1];
    return Buffer.from(base64, 'base64');
};

const cleanCollegeName = (name) => {
    if (!name) return 'N/A';
    // Remove "1.", "2.", "3." prefixes and trailing colons
    return name.replace(/^[0-9]\.\s*/, '').replace(/:\s*$/, '').trim();
};

const docToBuffer = (doc) =>
    new Promise((resolve, reject) => {
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
    });

// ── Core PDF builder ─────────────────────────────────────────────────────────

const fontsPath = path.join(__dirname, '..', '..', 'assets', 'fonts');
const fontPaths = {
    'Lora': path.join(fontsPath, 'Lora-Regular.ttf'),
    'Lora-Bold': path.join(fontsPath, 'Lora-Bold.ttf'),
};

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
    day,
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

    doc.registerFont('Lora', fontPaths['Lora']);
    doc.registerFont('Lora-Bold', fontPaths['Lora-Bold']);

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
    doc.font('Lora-Bold').fontSize(32).fillColor('#000000')
        .text(titleText, 0, 305, { width: 794, align: 'center' });

    // ── Student Details Header
    doc.rect(56, 351, 6, 49).fill('#FFB909'); // Rectangle 2
    doc.font('Lora-Bold').fontSize(24).fillColor('#000000')
        .text('Student Details :', 74, 363, { width: 200 });

    // ── Student Details Content
    const detailY = 412;
    const detailX = 142;
    const formattedDay = day ? (day.includes('Day') ? day : `Day ${day}`) : 'N/A';
    const eventsText = eventsList && eventsList.length > 0 ? eventsList.join('\n') : 'Texperia 2026';

    doc.font('Lora').fontSize(18).fillColor('#000000'); // Slightly smaller font

    // Clean college name
    const cleanedCollege = cleanCollegeName(college);

    // Render details with tighter spacing
    doc.text(`Name : ${studentName}`, detailX, detailY);
    doc.text(`Email : ${studentEmail}`, detailX, doc.y + 6);
    doc.text(`College : ${cleanedCollege}`, detailX, doc.y + 6);
    doc.text(`Day : ${formattedDay}`, detailX, doc.y + 6);

    // Aligned event section
    const eventsY = doc.y + 6;
    doc.text(`Event :`, detailX, eventsY);
    doc.text(eventsText, detailX + 70, eventsY, { width: 500, lineGap: 1 });

    // ── QR Code Label (Attendance QR Code / Lunch QR code)
    const isLunch = title.includes('Lunch');
    const qrLabel = isLunch ? 'Lunch QR code' : 'Attendance QR Code';
    doc.font('Lora-Bold').fontSize(20).fillColor('#000000')
        .text(qrLabel, 0, 691, { width: 794, align: 'center' });

    // ── QR Image
    if (qrBuffer) {
        const qrSize = { w: 220, h: 220, x: 287, y: 735 };
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
    const pdfStartTime = Date.now();
    const title = type === 'lunch' ? 'Lunch Token' : 'Registration Pass';
    const extraRows = [];

    const result = await buildPDF({
        title,
        studentName,
        studentEmail,
        college,
        eventsList,
        day,
        qrBase64,
        venue, // Pass the venue as is (null for attendance)
        token,
        extraRows,
    });
    
    const duration = performanceMonitor.endTimer('pdfGeneration', pdfStartTime);
    console.log(`[PDF Service] ⏱️ ${title} generated in ${duration}ms`);
    
    return result;
};

/**
 * Generate Lunch Token PDF
 */
const generateLunchPass = async (data) =>
    generateRegistrationPass(data, 'lunch');

module.exports = {
    generateRegistrationPass,
    generateLunchPass,
    cleanCollegeName,
};
