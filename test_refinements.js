const { buildToken, isValidToken, handleScan } = require('./src/services/sheetsService');
const { generateRegistrationPass, generateLunchPass } = require('./src/services/pdfService');
const fs = require('fs');
const path = require('path');
const eventConfig = require('./src/config/eventConfig.json');

async function testAll() {
    console.log('--- Testing Tokens ---');
    const attToken = buildToken('CS');
    const lunchToken = buildToken('lunch');
    console.log('Attendance Token:', attToken);
    console.log('Lunch Token:', lunchToken);
    console.log('Att Token Valid?', isValidToken(attToken));
    console.log('Lunch Token Valid?', isValidToken(lunchToken));

    console.log('\n--- Testing Security ---');
    try {
        await handleScan(attToken, 'WRONG-SECRET');
    } catch (e) {
        console.log('Secret check (Wrong):', e.message, 'Status:', e.statusCode);
    }

    // We can't fully run handleScan without Google Auth in this environment, 
    // but we saw the secret check is the first line.

    console.log('\n--- Testing PDF Generation (Lora Font) ---');
    try {
        const attPdf = await generateRegistrationPass({
            studentName: 'Sivasudhan (Test)',
            studentEmail: 'ksanjuma1234@gmail.com',
            college: 'SNS College of Technology',
            department: 'CSE',
            day: 'Day 2',
            eventsList: ['CST/CSD/CSE-IOT', 'Paper Presentation'],
            token: attToken,
            qrBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
            venue: 'N/A'
        });
        fs.writeFileSync('test_att.pdf', attPdf);
        console.log('✅ Attendance PDF generated (test_att.pdf)');

        const lunchPdf = await generateLunchPass({
            studentName: 'Sivasudhan (Test)',
            studentEmail: 'ksanjuma1234@gmail.com',
            college: 'SNS College of Technology',
            department: 'N/A',
            day: 'Day 2',
            eventsList: ['GSD Lab(Adobe Lab)', 'Gamestrom(Workshop on Game Design)'],
            token: lunchToken,
            qrBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
            venue: 'N/A' // This should be removed from pass as per request
        });
        fs.writeFileSync('test_lunch.pdf', lunchPdf);
        console.log('✅ Lunch PDF generated (test_lunch.pdf)');
    } catch (e) {
        console.error('❌ PDF Generation Failed:', e);
    }
}

testAll();
