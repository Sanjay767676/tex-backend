const { env } = require('../config/env');
const { getPendingPayments, processPaymentTokens } = require('./sheetsService');

/**
 * Automatically process pending payments for both CS and NCS sheets
 * @returns {Promise<Object>} Summary of processed payments
 */
const processPayments = async () => {
    const startTime = Date.now();

    try {
        const sheetConfigs = [
            { id: env.csSheets.events, type: 'CS', name: 'CS Events' },
            { id: env.csSheets.workshop, type: 'CS', name: 'CS Workshop' },
            { id: env.csSheets.hackathon, type: 'CS', name: 'CS Hackathon' },
            { id: env.ncsSheets.events, type: 'NCS', name: 'NCS Events' },
            { id: env.ncsSheets.workshop, type: 'NCS', name: 'NCS Workshop' },
            { id: env.ncsSheets.hackathon, type: 'NCS', name: 'NCS Hackathon' },
        ];

        // Include the testing sheet if configured (Removed as requested)

        console.log(`[Payment Processor] Starting automatic payment check across ${sheetConfigs.length} sheets...`);

        let totalProcessedCount = 0;
        const results = [];

        for (const config of sheetConfigs) {
            try {
                // Delay between sheets to stay within Google Sheets API quota (60 req/min)
                await new Promise(resolve => setTimeout(resolve, 3000));

                const { headers, pending, sheetTitle } = await getPendingPayments(config.id);
                console.log(`[Payment Processor] Found ${pending.length} pending payments in ${config.name}`);

                if (pending.length > 0) {
                    const processed = await processPaymentTokens(config.id, pending, headers, config.type, sheetTitle);
                    totalProcessedCount += processed.length;
                    results.push({ name: config.name, count: processed.length });
                }
            } catch (sheetErr) {
                console.error(`[Payment Processor] Error processing ${config.name}:`, sheetErr.message);
            }
        }

        const duration = Date.now() - startTime;
        console.log(`[Payment Processor] Completed: ${totalProcessedCount} total payments processed in ${duration}ms`);

        return {
            results,
            totalProcessedCount,
            duration,
        };
    } catch (error) {
        console.error('[Payment Processor] Global Error:', error.message);
        throw error;
    }
};

module.exports = {
    processPayments,
};
