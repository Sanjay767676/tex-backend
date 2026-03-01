const express = require('express');
const router = express.Router();
const { generateRegistrationPass, generateLunchPass } = require('../services/pdfService');
const cacheService = require('../services/cacheService');
const { env } = require('../config/env');

// Enhanced health check route
router.get('/health', function (req, res) {
    try {
        var cacheStats = cacheService.getStats();

        var healthData = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            server: 'running',
            environment: {
                testMode: env.testMode,
                nodeEnv: process.env.NODE_ENV || 'development',
                port: env.port
            },
            cache: {
                size: cacheStats.size,
                lastRefresh: cacheStats.lastRefresh,
                isRefreshing: cacheStats.isRefreshing
            },
            sheets: {
                csSheets: Object.keys(env.csSheets).length,
                ncsSheets: Object.keys(env.ncsSheets).length,
                activeSheets: [
                    ...Object.values(env.csSheets),
                    ...Object.values(env.ncsSheets)
                ].filter(function (id) { return id && id.trim() !== ''; }).length
            },
            uptime: process.uptime(),
            memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
            }
        };

        console.log('[Health Check] Status requested - Cache size: ' + cacheStats.size + ', Test mode: ' + env.testMode);

        res.json(healthData);
    } catch (error) {
        console.error('[Health Check] Error:', error.message);
        res.status(500).json({
            status: 'error',
            message: 'Health check failed',
            error: error.message
        });
    }
});

// PDF debug test route - GET /debug/pdf-test?type=attendance or ?type=lunch
router.get('/debug/pdf-test', async function (req, res) {
    try {
        console.log('[PDF Debug] Generating test PDF...');

        var testData = {
            studentName: 'John Doe',
            studentEmail: 'john.doe@example.com',
            college: 'SNS College of Technology',
            department: 'Computer Science',
            day: 'Day 1',
            eventsList: ['Opening Ceremony', 'Technical Workshop', 'Quiz Competition'],
            token: 'TEST-' + Date.now(),
            qrBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
            venue: 'Main Hall'
        };

        var pdfType = req.query.type === 'lunch' ? 'lunch' : 'attendance';
        console.log('[PDF Debug] Generating ' + pdfType + ' PDF...');

        var pdfBuffer;
        if (pdfType === 'lunch') {
            pdfBuffer = await generateLunchPass(testData);
        } else {
            pdfBuffer = await generateRegistrationPass(testData, 'attendance');
        }

        console.log('[PDF Debug] ' + pdfType + ' PDF generated successfully - Size: ' + pdfBuffer.length + ' bytes');

        // Return PDF in browser
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="test_' + pdfType + '_' + testData.token + '.pdf"');
        res.setHeader('Content-Length', pdfBuffer.length);

        res.send(pdfBuffer);

    } catch (error) {
        console.error('[PDF Debug] PDF generation failed:', error.message);
        console.error('[PDF Debug] Error stack:', error.stack);

        res.status(500).json({
            status: 'error',
            message: 'PDF generation failed',
            error: error.message,
            details: {
                pdfEngine: 'pdfkit',
                assetsPath: 'assets/'
            }
        });
    }
});

// Cache debug route - GET /debug/cache
router.get('/debug/cache', function (req, res) {
    try {
        var cacheStats = cacheService.getStats();
        var internalCache = cacheService.getInternalMap();

        var sampleTokens = [];
        var count = 0;
        for (var entry of internalCache) {
            var token = entry[0];
            var data = entry[1];
            if (count < 5) {
                sampleTokens.push({
                    token: token,
                    sheetId: data.sheetId || data.spreadsheetId,
                    rowIndex: data.rowIndex,
                    attendance: data.attendance,
                    lunch: data.lunch
                });
            }
            count++;
        }

        res.json({
            status: 'ok',
            stats: cacheStats,
            sampleTokens: sampleTokens,
            totalTokens: internalCache.size,
            environment: {
                testMode: env.testMode,
                activeSheets: {
                    cs: env.csSheets,
                    ncs: env.ncsSheets
                }
            }
        });
    } catch (error) {
        console.error('[Cache Debug] Error:', error.message);
        res.status(500).json({
            status: 'error',
            message: 'Cache debug failed',
            error: error.message
        });
    }
});

module.exports = router;
