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
    eventsHtml,
    qrCid,
}) => {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {
                    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                    line-height: 1.6;
                    color: #2c3e50;
                    margin: 0;
                    padding: 0;
                    background-color: #f8f9fa;
                }
                .wrapper {
                    background-color: #f8f9fa;
                    padding: 40px 20px;
                }
                .container {
                    max-width: 600px;
                    margin: 0 auto;
                    background-color: #ffffff;
                    border-radius: 12px;
                    overflow: hidden;
                    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
                }
                .header {
                    background-color: #4CAF50;
                    color: #ffffff;
                    padding: 40px 20px;
                    text-align: center;
                }
                .header h1 {
                    margin: 0;
                    font-size: 32px;
                    letter-spacing: 1px;
                }
                .header p {
                    margin: 10px 0 0;
                    font-size: 18px;
                    opacity: 0.9;
                }
                .content {
                    padding: 40px 30px;
                }
                .greeting {
                    font-size: 20px;
                    font-weight: bold;
                    margin-bottom: 20px;
                    color: #333;
                }
                .message {
                    font-size: 16px;
                    color: #555;
                    margin-bottom: 30px;
                }
                .events-section {
                    background-color: #f1f8e9;
                    border-radius: 8px;
                    padding: 20px;
                    margin-bottom: 30px;
                }
                .events-section h3 {
                    margin-top: 0;
                    color: #2e7d32;
                    font-size: 18px;
                    border-bottom: 1px solid #c8e6c9;
                    padding-bottom: 10px;
                }
                .qr-section {
                    text-align: center;
                    margin: 40px 0;
                    padding: 20px;
                    border: 2px dashed #4CAF50;
                    border-radius: 12px;
                }
                .qr-section img {
                    display: block;
                    margin: 0 auto 15px;
                }
                .footer {
                    background-color: #f1f3f5;
                    padding: 30px;
                    text-align: center;
                    color: #6c757d;
                    font-size: 13px;
                }
                .footer p { margin: 5px 0; }
                .button {
                    display: inline-block;
                    padding: 12px 24px;
                    background-color: #4CAF50;
                    color: #ffffff;
                    text-decoration: none;
                    border-radius: 6px;
                    font-weight: bold;
                    margin: 20px 0;
                }
            </style>
        </head>
        <body>
            <div class="wrapper">
                <div class="container">
                    <div class="header">
                        <h1>Texperia 2026</h1>
                        <p>${title}</p>
                    </div>

                    <div class="content">
                        <div class="greeting">${greeting}</div>
                        <div class="message">${message}</div>

                        ${eventsHtml ? `
                        <div class="events-section">
                            <h3>Registered Events</h3>
                            ${eventsHtml}
                        </div>
                        ` : ''}

                        ${qrCid ? `
                        <div class="qr-section">
                            <p style="font-weight: bold; color: #4CAF50; margin-bottom: 15px;">Official Entry QR Pass</p>
                            <img src="cid:${qrCid}" width="200" height="200" alt="QR Code" />
                            <p style="font-size: 12px; color: #888;">Keep this QR code ready at the entrance gate.</p>
                        </div>
                        ` : ''}

                        <p>Best regards,<br><strong>Texperia Organizing Team</strong></p>
                    </div>

                    <div class="footer">
                        <p>© 2026 Texperia at SNS College of Technology.</p>
                        <p>This is an automated system email. Please do not reply.</p>
                    </div>
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
    const fromName = senderType === 'NCS' ? 'Texperia NCS Team' : 'Texperia CS Team';
    const fromEmail = senderType === 'NCS' ? process.env.NCS_EMAIL_USER : process.env.CS_EMAIL_USER;

    const htmlBody = renderEmailTemplate({
        title: 'Registration Successful',
        greeting: `Hi ${name},`,
        message: 'Your registration for Texperia 2026 has been successfully confirmed. We have attached your official registration pass to this email.',
    });

    const mailOptions = {
        from: `"${fromName}" <${fromEmail}>`,
        to,
        subject: 'Texperia 2026 Registration Confirmed ✓',
        html: htmlBody,
        attachments: [
            {
                filename: `Texperia_Pass_${token}.pdf`,
                content: pdfBuffer,
            }
        ],
        headers: {
            'X-Priority': '1 (Highest)',
            'X-MSMail-Priority': 'High',
            'Importance': 'high'
        }
    };

    try {
        console.log(`[Email Service] Sending registration pass to: ${to}`);
        const info = await transporter.sendMail(mailOptions);
        console.log(`[Email Service] Email sent: ${info.response}`);
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
    qrBase64
}) => {
    const transporter = await getTransporter(senderType);
    const fromName = senderType === 'NCS' ? 'Texperia NCS Team' : 'Texperia CS Team';
    const fromEmail = senderType === 'NCS' ? process.env.NCS_EMAIL_USER : process.env.CS_EMAIL_USER;

    const allEvents = [...day1Events, ...day2Events];
    const eventsHtml = allEvents.length > 0
        ? `<ul style="padding-left: 20px;">${allEvents.map(e => `<li>${e}</li>`).join('')}</ul>`
        : '<p>Standard Admission</p>';

    const qrCid = 'entry-qr-code';
    const htmlBody = renderEmailTemplate({
        title: 'Attendance Confirmed',
        greeting: `Welcome, ${name}!`,
        message: 'Your attendance has been officially marked. You are cleared to participate in the events listed below. Enjoy Texperia 2026!',
        eventsHtml,
        qrCid
    });

    const mailOptions = {
        from: `"${fromName}" <${fromEmail}>`,
        to,
        subject: 'Texperia 2026 - Attendance Confirmed ✓',
        html: htmlBody,
        attachments: qrBase64 ? [
            {
                filename: 'qr-code.png',
                content: qrBase64.split('base64,')[1],
                encoding: 'base64',
                cid: qrCid
            }
        ] : [],
        headers: {
            'X-Priority': '1 (Highest)',
            'Importance': 'high'
        }
    };

    try {
        console.log(`[Email Service] Sending attendance confirmation to: ${to}`);
        const info = await transporter.sendMail(mailOptions);
        console.log(`[Email Service] Attendance email sent: ${info.response}`);
        return true;
    } catch (error) {
        console.error('[Email Service] Attendance email error:', error.message);
        return false;
    }
};

module.exports = {
    sendConfirmationEmail,
    sendAttendanceEmail,
};
