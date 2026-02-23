const PDFDocument = require('pdfkit');

/**
 * Generate a professional PDF Registration Pass in memory
 * @param {Object} data - Student and event details
 * @returns {Promise<Buffer>} - Resovles to a Buffer containing PDF data
 */
const generateRegistrationPass = async ({
    studentName,
    studentEmail,
    department,
    day,
    eventsList,
    token,
    qrBase64
}) => {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50 });
            let buffers = [];

            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {
                const pdfData = Buffer.concat(buffers);
                resolve(pdfData);
            });

            // --- PDF Content ---

            // Header
            doc.fillColor('#4CAF50').fontSize(26).text('Texperia 2026', { align: 'center' });
            doc.fillColor('#333333').fontSize(18).text('Registration Pass', { align: 'center' });
            doc.moveDown(2);

            // Student Details
            doc.fillColor('#4CAF50').fontSize(14).text('Student Details', { underline: true });
            doc.moveDown(0.5);
            doc.fillColor('#333333').fontSize(12);
            doc.text(`Name: ${studentName}`);
            doc.text(`Email: ${studentEmail}`);
            doc.text(`Department: ${department || 'N/A'}`);
            doc.text(`Day: ${day}`);
            doc.moveDown(1.5);

            // Registered Events
            doc.fillColor('#4CAF50').fontSize(14).text('Registered Events', { underline: true });
            doc.moveDown(0.5);
            doc.fillColor('#333333').fontSize(12);
            if (eventsList && eventsList.length > 0) {
                eventsList.forEach(event => {
                    doc.text(`• ${event}`);
                });
            } else {
                doc.text('No specific events selected.');
            }
            doc.moveDown(1.5);

            // Token
            doc.fillColor('#4CAF50').fontSize(14).text('Token', { underline: true });
            doc.moveDown(0.5);
            doc.fillColor('#333333').fontSize(12).text(token);
            doc.moveDown(1.5);

            // QR Code
            doc.fillColor('#4CAF50').fontSize(14).text('Entry QR Code', { underline: true });
            doc.moveDown(0.5);

            // Convert base64 to Buffer for embedding
            const qrImageBuffer = Buffer.from(qrBase64.split(',')[1], 'base64');
            doc.image(qrImageBuffer, {
                fit: [150, 150],
                align: 'left'
            });
            doc.moveDown(1);

            // Footer
            doc.moveDown(3);
            doc.fontSize(10).fillColor('#999999').text('Please bring this pass to the venue. QR will be scanned at entry.', {
                align: 'center',
                italic: true
            });

            doc.end();
        } catch (error) {
            console.error('[PDF Service] Error generating PDF:', error);
            reject(error);
        }
    });
};

module.exports = {
    generateRegistrationPass
};
