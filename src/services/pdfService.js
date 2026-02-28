const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

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
 * Generate a professional PDF Registration Pass using HTML template
 * @param {Object} data - Student and event details
 * @param {String} type - Type of PDF: 'attendance' or 'lunch'
 * @returns {Promise<Buffer>} - Resolves to a Buffer containing PDF data
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
    let browser = null;
    
    try {
        // Read the appropriate HTML template
        const templatePath = path.join(__dirname, '..', '..', 'templates', type, `${type}.html`);
        let htmlTemplate = await fs.readFile(templatePath, 'utf-8');
        
        // Read and convert images to base64
        const assetsPath = path.join(__dirname, '..', '..', 'assets', 'images');
        const snsEmblem = await imageToBase64(path.join(assetsPath, 'sns_emblem.png'));
        const texperiaLogo = await imageToBase64(path.join(assetsPath, 'texperia_logo.png'));
        const snsInstitutionsLogo = await imageToBase64(path.join(assetsPath, 'SNS_institutions_logo.png'));
        
        // Prepare event list as string
        const eventsText = eventsList && eventsList.length > 0 
            ? eventsList.join(', ') 
            : 'No specific events selected';
        
        // Replace template variables
        htmlTemplate = htmlTemplate
            .replace(/{{name}}/g, studentName || 'N/A')
            .replace(/{{email}}/g, studentEmail || 'N/A')
            .replace(/{{college}}/g, college || 'N/A')
            .replace(/{{event}}/g, eventsText)
            .replace(/{{qrCode}}/g, qrBase64)
            .replace(/{{venue}}/g, venue || 'Main Hall')
            // Replace image sources with base64 data URLs
            .replace(/src="\/assets\/images\/sns_emblem\.png"/g, `src="${snsEmblem}"`)
            .replace(/src="\/assets\/images\/texperia_logo\.png"/g, `src="${texperiaLogo}"`)
            .replace(/src="\/assets\/images\/SNS_institutions_logo\.png"/g, `src="${snsInstitutionsLogo}"`);

        // Inline CSS to avoid external file dependencies
        const cssPath = path.join(__dirname, '..', '..', 'assets', 'css', 'pdf-style.css');
        const cssContent = await fs.readFile(cssPath, 'utf-8');
        
        // Replace the CSS link with inline styles
        htmlTemplate = htmlTemplate.replace(
            /<link rel="stylesheet" href="\/assets\/css\/pdf-style\.css">/g, 
            `<style>${cssContent}</style>`
        );

        // Launch Puppeteer
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu'
            ]
        });

        const page = await browser.newPage();
        
        // Set the HTML content
        await page.setContent(htmlTemplate, { waitUntil: 'networkidle0' });
        
        // Generate PDF
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: 0,
                bottom: 0,
                left: 0,
                right: 0
            }
        });

        return pdfBuffer;
        
    } catch (error) {
        console.error('[PDF Service] Error generating PDF:', error);
        throw error;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
};

/**
 * Generate a lunch token PDF using lunch HTML template
 * @param {Object} data - Student and event details
 * @returns {Promise<Buffer>} - Resolves to a Buffer containing PDF data
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
    venue
}) => {
    return await generateRegistrationPass({
        studentName,
        studentEmail,
        college,
        department,
        day,
        eventsList,
        token,
        qrBase64,
        venue
    }, 'lunch');
};

module.exports = {
    generateRegistrationPass,
    generateLunchPass
};
