const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

/**
 * Find a working Chrome/Chromium executable path.
 * Checks env var, common system paths, and falls back to Puppeteer's bundled Chrome.
 */
const findChromePath = () => {
    // 1. Check env var first
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        console.log(`[PDF Service] Using Chrome from env: ${process.env.PUPPETEER_EXECUTABLE_PATH}`);
        return process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    // 2. Try common system paths (Azure Linux, Ubuntu, Alpine)
    const commonPaths = [
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/usr/local/bin/chromium',
    ];

    for (const p of commonPaths) {
        try {
            const stat = require('fs').statSync(p);
            if (stat.isFile()) {
                console.log(`[PDF Service] Found system Chrome at: ${p}`);
                return p;
            }
        } catch (e) {
            // not found, continue
        }
    }

    // 3. Try 'which' command
    try {
        const result = execSync('which chromium-browser || which chromium || which google-chrome-stable 2>/dev/null', { encoding: 'utf-8' }).trim();
        if (result) {
            console.log(`[PDF Service] Found Chrome via which: ${result}`);
            return result;
        }
    } catch (e) {
        // not found
    }

    // 4. Let Puppeteer use its bundled Chrome (works locally)
    console.log('[PDF Service] No system Chrome found, using Puppeteer bundled Chrome');
    return undefined;
};

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
        const executablePath = findChromePath();
        const launchOptions = {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--single-process',
                '--no-zygote'
            ]
        };
        if (executablePath) {
            launchOptions.executablePath = executablePath;
        }
        browser = await puppeteer.launch(launchOptions);

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
