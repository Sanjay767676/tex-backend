/**
 * Create a Nodemailer transporter using smtp.gmail.com hostname directly.
 * Using pool:true for connection reuse.
 */
const nodemailer = require('nodemailer');
const createTransporter = (user, pass) => {
    return nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user, pass },
        pool: true,
        maxConnections: 5,
        maxMessages: 50,
        connectionTimeout: 30000,
        greetingTimeout: 15000,
        socketTimeout: 45000,
    });
};

// Lazy-initialized singleton transporters
let csTransporter = null;
let ncsTransporter = null;

/**
 * Get or create transporter for sender type (lazy-initialized singleton)
 */
const getTransporter = (senderType) => {
    const isNCS = senderType === 'NCS';

    if (isNCS) {
        if (!ncsTransporter) {
            ncsTransporter = createTransporter(
                process.env.NCS_EMAIL_USER,
                process.env.NCS_EMAIL_PASS
            );
            console.log('[SMTP] NCS transporter created (smtp.gmail.com:465)');
        }
        return ncsTransporter;
    } else {
        if (!csTransporter) {
            csTransporter = createTransporter(
                process.env.CS_EMAIL_USER,
                process.env.CS_EMAIL_PASS
            );
            console.log('[SMTP] CS transporter created (smtp.gmail.com:465)');
        }
        return csTransporter;
    }
};


/**
 * Enhanced email template with plain text version for spam prevention
 * - Proper HTML structure with meta viewport
 * - Plain text fallback
 * - Clean subject lines (no spam trigger words)
 * - Proper replyTo headers
 * - List-Unsubscribe header
 */
const renderEmailTemplate = ({
    title,
    greeting,
    message,
    eventsHtml = '',
    qrCid,
    plainTextMessage = null
}) => {
    const htmlTemplate = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
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
            color: #2c3e50;
            margin-bottom: 15px;
        }
        .message {
            font-size: 16px;
            line-height: 1.6;
            color: #5a6c7d;
            margin-bottom: 30px;
        }
        .events {
            background-color: #f8f9fa;
            border-left: 4px solid #4CAF50;
            padding: 20px;
            margin: 20px 0;
            border-radius: 0 8px 8px 0;
        }
        .qr-section {
            text-align: center;
            margin: 30px 0;
            padding: 20px;
            background-color: #f8f9fa;
            border-radius: 8px;
        }
        .footer {
            background-color: #f8f9fa;
            padding: 30px 20px;
            text-align: center;
            color: #7f8c8d;
            font-size: 14px;
        }
        .footer p {
            margin: 5px 0;
        }
        @media only screen and (max-width: 600px) {
            .container { margin: 0 10px; }
            .header { padding: 30px 15px; }
            .content { padding: 30px 20px; }
        }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="container">
            <div class="header">
                <h1>${title}</h1>
                <p>Texperia 2026 Event Management</p>
            </div>
            <div class="content">
                <div class="greeting">${greeting}</div>
                <div class="message">${message}</div>
                ${eventsHtml ? '<div class="events">' + eventsHtml + '</div>' : ''}
                ${qrCid ? '<div class="qr-section"><img src="cid:' + qrCid + '" alt="QR Code" style="max-width: 200px;"/></div>' : ''}
            </div>
            <div class="footer">
                <p><strong>SNS College of Technology</strong></p>
                <p>Texperia 2026 - Technical Symposium</p>
                <p>For support, contact the organizing team</p>
            </div>
        </div>
    </div>
</body>
</html>`;

    // Generate plain text version for spam prevention
    const plainText = plainTextMessage || [
        title,
        '='.repeat(title.length),
        '',
        greeting,
        '',
        message.replace(/<[^>]*>/g, ''),
        '',
        eventsHtml ? eventsHtml.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, '') : '',
        '',
        '---',
        'SNS College of Technology',
        'Texperia 2026 - Technical Symposium',
        'For support, contact the organizing team'
    ].join('\n');

    return { html: htmlTemplate, text: plainText };
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
    const replyToEmail = fromEmail;

    const emailTemplate = renderEmailTemplate({
        title: 'Registration Confirmed',
        greeting: 'Hello ' + name + ',',
        message: 'Your registration for Texperia 2026 has been successfully confirmed. We have attached your official registration pass to this email. Please bring this pass to the venue for entry.',
    });

    // Log PDF buffer validation
    console.log('[Email Service] PDF Buffer - Size: ' + (pdfBuffer ? pdfBuffer.length : 0) + ' bytes, Valid: ' + (pdfBuffer && pdfBuffer.length > 0));

    if (!pdfBuffer || pdfBuffer.length === 0) {
        console.error('[Email Service] WARNING: PDF buffer is empty or invalid!');
    }

    const mailOptions = {
        from: '"' + fromName + '" <' + fromEmail + '>',
        to,
        replyTo: replyToEmail,
        subject: 'Texperia 2026 Registration Confirmed',
        text: emailTemplate.text,
        html: emailTemplate.html,
        attachments: [
            {
                filename: 'Texperia_Pass_' + token + '.pdf',
                content: pdfBuffer,
                contentType: 'application/pdf'
            }
        ],
        headers: {
            'X-Priority': '3',
            'X-Mailer': 'Texperia Event System',
            'Organization': 'SNS College of Technology',
            'List-Unsubscribe': '<mailto:noreply@' + fromEmail.split('@')[1] + '>',
        }
    };

    try {
        console.log('[Email Service] Sending registration pass to: ' + to);
        console.log('[Email Service] Using sender: ' + fromName + ' <' + fromEmail + '>');

        const info = await transporter.sendMail(mailOptions);
        console.log('[Email Service] Registration email sent successfully');
        console.log('[Email Service] Message ID: ' + info.messageId);
        console.log('[Email Service] Response: ' + info.response);

        // DKIM/SPF suggestion
        console.log('[Email Service] TIP: Ensure SPF record includes: v=spf1 include:_spf.google.com ~all');
        console.log('[Email Service] TIP: Ensure DKIM is configured in Google Workspace Admin');

        return true;
    } catch (error) {
        console.error('[Email Service] Registration email failed for ' + to + ': ' + error.message);
        console.error('[Email Service] Error details:', {
            code: error.code,
            command: error.command,
            response: error.response
        });
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
        ? '<ul style="padding-left: 20px;">' + allEvents.map(function (e) { return '<li>' + e + '</li>'; }).join('') + '</ul>'
        : '<p>Standard Admission</p>';

    const qrCid = 'entry-qr-code';
    const emailTemplate = renderEmailTemplate({
        title: 'Attendance Confirmed',
        greeting: 'Welcome, ' + name + '!',
        message: 'Your attendance has been officially marked. You are cleared to participate in the events listed below. Enjoy Texperia 2026!',
        eventsHtml: eventsHtml,
        qrCid: qrCid
    });

    const mailOptions = {
        from: '"' + fromName + '" <' + fromEmail + '>',
        to,
        replyTo: fromEmail,
        subject: 'Texperia 2026 - Attendance Confirmed',
        html: emailTemplate.html,
        text: emailTemplate.text,
        attachments: qrBase64 ? [
            {
                filename: 'qr-code.png',
                content: qrBase64.split('base64,')[1],
                encoding: 'base64',
                cid: qrCid
            }
        ] : [],
        headers: {
            'X-Priority': '3',
            'X-Mailer': 'Texperia Event System',
            'Organization': 'SNS College of Technology',
        }
    };

    try {
        console.log('[Email Service] Sending attendance confirmation to: ' + to);
        const info = await transporter.sendMail(mailOptions);
        console.log('[Email Service] Attendance email sent: ' + info.response);
        return true;
    } catch (error) {
        console.error('[Email Service] Attendance email error:', error.message);
        return false;
    }
};

const sendLunchEmail = async ({
    senderType,
    to,
    name,
    token,
    pdfBuffer
}) => {
    const transporter = await getTransporter(senderType);
    const fromName = senderType === 'NCS' ? 'Texperia NCS Team' : 'Texperia CS Team';
    const fromEmail = senderType === 'NCS' ? process.env.NCS_EMAIL_USER : process.env.CS_EMAIL_USER;
    const replyToEmail = fromEmail;

    const emailTemplate = renderEmailTemplate({
        title: 'Lunch Token Ready',
        greeting: 'Hello ' + name + ',',
        message: 'Your lunch for Texperia 2026 is confirmed! We have attached your lunch token to this email. Please present this token at the lunch venue during meal time.',
    });

    // Log PDF buffer validation
    console.log('[Email Service] Lunch PDF Buffer - Size: ' + (pdfBuffer ? pdfBuffer.length : 0) + ' bytes, Valid: ' + (pdfBuffer && pdfBuffer.length > 0));

    if (!pdfBuffer || pdfBuffer.length === 0) {
        console.error('[Email Service] WARNING: Lunch PDF buffer is empty or invalid!');
    }

    const mailOptions = {
        from: '"' + fromName + '" <' + fromEmail + '>',
        to,
        replyTo: replyToEmail,
        subject: 'Texperia 2026 Lunch Token',
        text: emailTemplate.text,
        html: emailTemplate.html,
        attachments: [
            {
                filename: 'Texperia_Lunch_' + token + '.pdf',
                content: pdfBuffer,
                contentType: 'application/pdf'
            }
        ],
        headers: {
            'X-Priority': '3',
            'X-Mailer': 'Texperia Event System',
            'Organization': 'SNS College of Technology',
            'List-Unsubscribe': '<mailto:noreply@' + fromEmail.split('@')[1] + '>',
        }
    };

    try {
        console.log('[Email Service] Sending lunch token to: ' + to);
        console.log('[Email Service] Using sender: ' + fromName + ' <' + fromEmail + '>');

        const info = await transporter.sendMail(mailOptions);
        console.log('[Email Service] Lunch email sent successfully');
        console.log('[Email Service] Message ID: ' + info.messageId);
        console.log('[Email Service] Response: ' + info.response);

        return true;
    } catch (error) {
        console.error('[Email Service] Lunch email failed for ' + to + ': ' + error.message);
        console.error('[Email Service] Error details:', {
            code: error.code,
            command: error.command,
            response: error.response
        });
        return false;
    }
};

module.exports = {
    sendConfirmationEmail,
    sendAttendanceEmail,
    sendLunchEmail,
};
