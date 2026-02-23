const app = require('./app');
const { validateEnv } = require('./config/env');
const { processPayments } = require('./services/paymentProcessor');

// Validate environment variables before starting
validateEnv();
console.log('[Startup] Environment loaded');

// To use ngrok:
// 1. Run backend normally (npm start)
// 2. Run: ngrok http 3000
// 3. Copy HTTPS URL
// 4. Set in .env:
//    BASE_URL=https://your-ngrok-url.ngrok-free.app
// 5. Restart server

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log('[Startup] Server started successfully');
    console.log('Running with BASE_URL:', process.env.BASE_URL);
});

// Automatic payment processing with overlap protection
let isProcessing = false;

const runAutomaticPaymentCheck = async () => {
    if (isProcessing) {
        console.log('[Payment Processor] Skipping cycle - previous check still running');
        return;
    }

    isProcessing = true;

    try {
        await processPayments();
    } catch (error) {
        console.error('[Payment Processor] Auto payment check failed:', error.message);
    } finally {
        isProcessing = false;
    }
};

// Poll every 90 seconds to stay within Google Sheets API quota
const pollingInterval = setInterval(runAutomaticPaymentCheck, 90000);

// Run first check immediately (optional - remove if you want to wait 10s)
setTimeout(runAutomaticPaymentCheck, 2000);

// Graceful shutdown handling
const shutdown = (signal) => {
    console.log(`Received ${signal}. Shutting down gracefully...`);

    // Stop polling
    clearInterval(pollingInterval);
    console.log('[Payment Processor] Automatic polling stopped');

    server.close(() => {
        console.log('HTTP server closed.');
        process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
        console.error('Forcefully shutting down.');
        process.exit(1);
    }, 10000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
