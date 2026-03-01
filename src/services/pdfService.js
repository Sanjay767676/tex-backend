const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const fs = require('fs').promises;
const path = require('path');

// Pre-configure @sparticuz/chromium for Azure
chromium.setHeadlessMode = true;
chromium.setGraphicsMode = false;

/**
 * Convert image to base64 data URL
 */
const imageToBase64 = async (imagePath) => {
    try {
        const imageBuffer = await fs.readFile(imagePath);
        const ext = path.extname(imagePath).toLowerCase();
        const mimeType = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
        return `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
    } catch (error) {
        console.warn(`[PDF Service] Could not load image ${imagePath}:`, error.message);
        return '';
    }
};

/**
 * Generate a PDF from an HTML template file.
 * Images and CSS are inlined automatically so Puppeteer
 * doesn't need network access.
 *
 * @param {string} templatePath - absolute path to HTML template
 * @param {Object} placeholders  - key/value map: {{key}} → value
 * @returns {Promise<Buffer>}
 */
const generatePDFFromHTML = async (templatePath, placeholders = {}) => {
    let browser = null;

    try {
        // Load template
        let html = await fs.readFile(templatePath, 'utf-8');

        // Inline CSS (replace link tag with <style>)
        const cssPath = path.join(__dirname, '..', '..', 'assets', 'css', 'pdf-style.css');
        try {
            const cssContent = await fs.readFile(cssPath, 'utf-8');
            html = html.replace(
                /<link\s[^>]*href=["'][^"']*pdf-style\.css["'][^>]*>/gi,
                `<style>${cssContent}</style>`
            );
        } catch (e) {
            console.warn('[PDF Service] Could not inline CSS:', e.message);
        }

        // Inline images (replace src paths with base64)
        const assetsPath = path.join(__dirname, '..', '..', 'assets', 'images');
        const imageFiles = ['sns_emblem.png', 'texperia_logo.png', 'SNS_institutions_logo.png'];
        for (const imgFile of imageFiles) {
            const imgPath = path.join(assetsPath, imgFile);
            const b64 = await imageToBase64(imgPath);
            if (b64) {
                // Replace both /assets/images/... and relative paths
                html = html.replace(
                    new RegExp(`src=["'][^"']*${imgFile.replace('.', '\\.')}["']`, 'g'),
                    `src="${b64}"`
                );
            }
        }

        // Replace all {{placeholders}}
        Object.entries(placeholders).forEach(([key, value]) => {
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            html = html.replace(regex, value != null ? String(value) : '');
        });

        // Launch Puppeteer
        const executablePath = await chromium.executablePath();
        console.log(`[PDF Service] Launching Chromium from: ${executablePath}`);

        browser = await puppeteer.launch({
            executablePath,
            headless: chromium.headless,
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
        });

        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: 0, bottom: 0, left: 0, right: 0 },
        });

        return pdfBuffer;
    } catch (error) {
        console.error('[PDF Service] Error generating PDF:', error.message);
        throw error;
    } finally {
        if (browser) await browser.close();
    }
};

/**
 * Generate a Registration / Attendance Pass PDF
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
    const templatePath = path.join(
        __dirname, '..', '..', 'templates', type, `${type}.html`
    );

    const eventsText = eventsList && eventsList.length > 0
        ? eventsList.join(', ')
        : 'No specific events selected';

    return generatePDFFromHTML(templatePath, {
        name: studentName || 'N/A',
        email: studentEmail || 'N/A',
        college: college || 'N/A',
        event: eventsText,
        qrCode: qrBase64 || '',
        venue: venue || 'Main Hall',
        department: department || 'N/A',
        day: day || 'N/A',
    });
};

/**
 * Generate a Lunch Token PDF
 */
const generateLunchPass = async ({
    studentName,
    studentEmail,
    college,
    department,
    day,
    eventsList,
    token,
    qrBase64,
    venue,
}) => {
    return generateRegistrationPass({
        studentName,
        studentEmail,
        college,
        department,
        day,
        eventsList,
        token,
        qrBase64,
        venue,
    }, 'lunch');
};

module.exports = {
    generateRegistrationPass,
    generateLunchPass,
    generatePDFFromHTML,
};
