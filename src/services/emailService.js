const nodemailer = require('nodemailer');
const dns = require('dns');
const { promisify } = require('util');

const resolve4 = promisify(dns.resolve4);

// Cache resolved IPv4 address and transporters
let gmailIPv4 = null;
let csTransporter = null;
let ncsTransporter = null;

const resolveGmailIPv4 = async () => {
    if (gmailIPv4) return gmailIPv4;
    try {
        const addresses = await resolve4('smtp.gmail.com');
        gmailIPv4 = addresses[0];
        console.log(`[SMTP] Resolved smtp.gmail.com → ${gmailIPv4}`);
        return gmailIPv4;
    } catch (err) {
        console.error('[SMTP] DNS resolve failed, falling back to hostname:', err.message);
        return 'smtp.gmail.com';
    }
};

const buildSmtpConfig = (host) => ({
    host,
    port: 465,
    secure: true,
    connectionTimeout: 30000,
    greetingTimeout: 20000,
    socketTimeout: 30000,
    tls: {
        rejectUnauthorized: false,
        servername: 'smtp.gmail.com',
    },
});

const getCSTransporter = async () => {
    if (csTransporter) return csTransporter;
    const ip = await resolveGmailIPv4();
    csTransporter = nodemailer.createTransport({
        ...buildSmtpConfig(ip),
        auth: {
            user: process.env.CS_EMAIL_USER,
            pass: process.env.CS_EMAIL_PASS,
        },
    });
    return csTransporter;
};

const getNCSTransporter = async () => {
    if (ncsTransporter) return ncsTransporter;
    const ip = await resolveGmailIPv4();
    ncsTransporter = nodemailer.createTransport({
        ...buildSmtpConfig(ip),
        auth: {
            user: process.env.NCS_EMAIL_USER,
            pass: process.env.NCS_EMAIL_PASS,
        },
    });
    return ncsTransporter;
};

// Verify on startup (non-blocking)
(async () => {
    try {
        const cs = await getCSTransporter();
        await cs.verify();
        console.log('[SMTP] CS Ready (port 465, IPv4)');
    } catch (err) {
        console.error('[SMTP] CS verify failed:', err.message);
    }
    try {
        const ncs = await getNCSTransporter();
        await ncs.verify();
        console.log('[SMTP] NCS Ready (port 465, IPv4)');
    } catch (err) {
        console.error('[SMTP] NCS verify failed:', err.message);
    }
})();

const getTransporter = async (senderType) => {
    const type = String(senderType || '').toUpperCase();
    if (type === 'NCS') return getNCSTransporter();
    if (type === 'CS') return getCSTransporter();
    throw new Error(`Unknown sender type: ${senderType}`);
};

const renderEventList = (events) => {
    if (!events || events.length === 0) {
        return '<p><em>No events selected</em></p>';
    }
    return `<ul>${events.map((event) => `<li>${event}</li>`).join('')}</ul>`;
};

const renderEmailTemplate = ({
    title,
    greeting,
    message,
    day1Events,
    day2Events,
    scanUrl,
}) => {
    const day1Html = renderEventList(day1Events);
    const day2Html = renderEventList(day2Events);

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    background-color: #f4f4f4;
                    margin: 0;
                    padding: 0;
                }
                .container {
                    max-width: 600px;
                    margin: 20px auto;
                    background-color: #ffffff;
                    padding: 30px;
                    border-radius: 8px;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                }
                .header {
                    text-align: center;
                    border-bottom: 3px solid #4CAF50;
                    padding-bottom: 20px;
                    margin-bottom: 20px;
                }
                .header h1 {
                    color: #4CAF50;
                    margin: 0;
                    font-size: 28px;
                }
                .greeting {
                    font-size: 16px;
                    margin: 20px 0;
                    color: #333;
                }
                .section {
                    margin-bottom: 25px;
                }
                .section h3 {
                    color: #4CAF50;
                    border-left: 4px solid #4CAF50;
                    padding-left: 10px;
                    margin-top: 0;
                }
                .section ul {
                    list-style-type: none;
                    padding-left: 0;
                    margin: 10px 0;
                }
                .section li {
                    padding: 8px 0;
                    padding-left: 20px;
                    position: relative;
                    color: #555;
                }
                .section li:before {
                    content: "✓";
                    position: absolute;
                    left: 0;
                    color: #4CAF50;
                    font-weight: bold;
                }
                .qr-section {
                    text-align: center;
                    background-color: #f9f9f9;
                    padding: 20px;
                    border-radius: 6px;
                    margin: 20px 0;
                }
                .qr-section p {
                    color: #666;
                    margin: 10px 0;
                    font-size: 14px;
                }
                .qr-section img {
                    border: 2px solid #4CAF50;
                    border-radius: 4px;
                    margin: 10px 0;
                }
                .footer {
                    text-align: center;
                    padding-top: 20px;
                    border-top: 1px solid #eee;
                    color: #999;
                    font-size: 12px;
                    margin-top: 30px;
                }
                .footer p {
                    margin: 5px 0;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Texperia 2026</h1>
                    <p>${title}</p>
                </div>

                <div class="greeting">
                    <p>${greeting}</p>
                    <p>${message}</p>
                </div>

                <div class="qr-section">
                    <p><strong>Your Entry QR Code</strong></p>
                        <img src="${scanUrl}" width="200" alt="QR Code" />
                    <p>Show this QR code during event entry</p>
                </div>

                <div class="section">
                    <h3>Day 1 Events</h3>
                    ${day1Html}
                </div>

                <div class="section">
                    <h3>Day 2 Events</h3>
                    ${day2Html}
                </div>

                <div class="footer">
                    <p>© 2026 Texperia. All rights reserved.</p>
                    <p>If you have any questions, please contact us at support@texperia.com</p>
                </div>
            </div>
        </body>
        </html>
    `;
};

const sendConfirmationEmail = async ({
    senderType,
    to,
    name,
    token,
    pdfBuffer
}) => {
    const transporter = await getTransporter(senderType);

    const htmlBody = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #eee; border-radius: 8px; }
                .footer { margin-top: 30px; font-size: 12px; color: #777; border-top: 1px solid #eee; padding-top: 10px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>Texperia 2026 Registration Confirmed</h2>
                <p>Hi <strong>${name}</strong>,</p>
                <p>Your Texperia 2026 registration is confirmed.</p>
                <p>Please find your <strong>Registration Pass</strong> attached to this email as a PDF.</p>
                <p><strong>Carry this PDF (digital or printed) to the venue.</strong> Your QR code inside the PDF will be scanned at entry.</p>
                <p>Best Regards,<br>Texperia Team</p>
                
                <div class="footer">
                    <p>© 2026 Texperia. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
    `;

    const mailOptions = {
        from: senderType === 'NCS' ? process.env.NCS_EMAIL_USER : process.env.CS_EMAIL_USER,
        to,
        subject: 'Texperia 2026 Registration Confirmed',
        html: htmlBody,
        attachments: [
            {
                filename: `Texperia_Pass_${token}.pdf`,
                content: pdfBuffer,
            }
        ]
    };

    try {
        console.log(`[Email Service] Sending registration pass to: ${to}`);
        const info = await transporter.sendMail(mailOptions);
        console.log(`[Email Service] Email sent successfully: ${info.response}`);
        return true;
    } catch (error) {
        console.error('[Email Service] Error sending registration email:', error);
        return false;
    }
};

const sendAttendanceEmail = async ({
    senderType,
    to,
    name,
    day1Events,
    day2Events,
}) => {
    const transporter = await getTransporter(senderType);
    
    // Format events list
    const allEvents = [...day1Events, ...day2Events];
    const eventsList = allEvents.length > 0 ? allEvents.join(', ') : 'Registered Events';
    
    const htmlBody = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    background-color: #f4f4f4;
                    margin: 0;
                    padding: 0;
                }
                .container {
                    max-width: 600px;
                    margin: 20px auto;
                    background-color: #ffffff;
                    padding: 30px;
                    border-radius: 8px;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                }
                .header {
                    text-align: center;
                    border-bottom: 3px solid #4CAF50;
                    padding-bottom: 20px;
                    margin-bottom: 20px;
                }
                .header h1 {
                    color: #4CAF50;
                    margin: 0;
                    font-size: 28px;
                }
                .content {
                    font-size: 16px;
                    margin: 20px 0;
                    color: #333;
                    line-height: 1.8;
                }
                .highlight {
                    color: #4CAF50;
                    font-weight: bold;
                }
                .footer {
                    text-align: center;
                    padding-top: 20px;
                    border-top: 1px solid #eee;
                    color: #999;
                    font-size: 12px;
                    margin-top: 30px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Texperia 2026</h1>
                </div>
                
                <div class="content">
                    <p>Hi <span class="highlight">${name}</span>,</p>
                    
                    <p>Your <span class="highlight">attendance has been confirmed</span> for Texperia 2026!</p>
                    
                    <p><strong>Registered Events:</strong><br>${eventsList}</p>
                    
                    <p style="background-color: #f0f8f0; padding: 15px; border-left: 4px solid #4CAF50; margin: 20px 0;">
                        <strong>Please reach out to your designated venue ASAP!</strong><br>
                        Venue details will be shared separately. Make sure to arrive on time.
                    </p>
                    
                    <p>Thank you for registering with us. We look forward to seeing you!</p>
                    
                    <p>Best regards,<br><strong>Texperia Team</strong></p>
                </div>
                
                <div class="footer">
                    <p>This is an automated email. Please do not reply.</p>
                    <p>&copy; 2026 Texperia. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
    `;

    const mailOptions = {
        from: senderType === 'NCS' ? process.env.NCS_EMAIL_USER : process.env.CS_EMAIL_USER,
        to,
        subject: 'Texperia 2026 - Attendance Confirmed ✓',
        html: htmlBody,
    };

    try {
        console.log('Preparing to send attendance email to:', to);
        const info = await transporter.sendMail(mailOptions);
        console.log('Attendance email sent successfully:', info.response);
        return true;
    } catch (error) {
        console.error('EMAIL ERROR:', error.message);
        return false;
    }
};

module.exports = {
    sendConfirmationEmail,
    sendAttendanceEmail,
};
