/**
 * Performance Monitoring Utility
 * Tracks timing and counts for all major operations
 */

class PerformanceMonitor {
    constructor() {
        this.metrics = {
            googleAPI: {
                totalCalls: 0,
                totalTime: 0,
                calls: [],
                quotaErrors: 0,
                retries: 0
            },
            pdfGeneration: {
                totalCalls: 0,
                totalTime: 0,
                calls: []
            },
            emailSending: {
                totalCalls: 0,
                totalTime: 0,
                calls: []
            },
            scanner: {
                totalCalls: 0,
                totalTime: 0,
                calls: []
            },
            tokenGeneration: {
                totalCalls: 0,
                totalTime: 0,
                calls: []
            }
        };
    }

    startTimer(category) {
        return {
            category,
            startTime: Date.now(),
            end: () => this.endTimer(category, Date.now())
        };
    }

    endTimer(category, startTime) {
        const duration = Date.now() - startTime;
        
        if (this.metrics[category]) {
            this.metrics[category].totalCalls++;
            this.metrics[category].totalTime += duration;
            this.metrics[category].calls.push({
                timestamp: new Date().toISOString(),
                duration
            });

            // Keep only last 100 calls to prevent memory issues
            if (this.metrics[category].calls.length > 100) {
                this.metrics[category].calls.shift();
            }
        }

        return duration;
    }

    recordAPICall(duration, isRetry = false, isQuotaError = false) {
        this.metrics.googleAPI.totalCalls++;
        this.metrics.googleAPI.totalTime += duration;
        this.metrics.googleAPI.calls.push({
            timestamp: new Date().toISOString(),
            duration,
            isRetry,
            isQuotaError
        });

        if (isRetry) this.metrics.googleAPI.retries++;
        if (isQuotaError) this.metrics.googleAPI.quotaErrors++;

        // Keep only last 100 calls
        if (this.metrics.googleAPI.calls.length > 100) {
            this.metrics.googleAPI.calls.shift();
        }
    }

    getStats(category = null) {
        if (category) {
            const metric = this.metrics[category];
            if (!metric) return null;

            const avgTime = metric.totalCalls > 0 
                ? (metric.totalTime / metric.totalCalls).toFixed(2) 
                : 0;

            const recentCalls = metric.calls.slice(-10);
            const recentAvg = recentCalls.length > 0
                ? (recentCalls.reduce((sum, c) => sum + c.duration, 0) / recentCalls.length).toFixed(2)
                : 0;

            return {
                totalCalls: metric.totalCalls,
                totalTime: metric.totalTime,
                averageTime: avgTime,
                recentAverageTime: recentAvg,
                recentCalls: recentCalls.map(c => ({
                    timestamp: c.timestamp,
                    duration: `${c.duration}ms`
                })),
                ...(category === 'googleAPI' && {
                    quotaErrors: metric.quotaErrors,
                    retries: metric.retries
                })
            };
        }

        // Return all stats
        return {
            googleAPI: this.getStats('googleAPI'),
            pdfGeneration: this.getStats('pdfGeneration'),
            emailSending: this.getStats('emailSending'),
            scanner: this.getStats('scanner'),
            tokenGeneration: this.getStats('tokenGeneration')
        };
    }

    getReport() {
        const stats = this.getStats();
        
        console.log('\n╔═══════════════════════════════════════════════════════════╗');
        console.log('║         PERFORMANCE MONITORING REPORT                     ║');
        console.log('╚═══════════════════════════════════════════════════════════╝');
        
        Object.entries(stats).forEach(([category, data]) => {
            if (!data) return;
            
            console.log(`\n📊 ${category.toUpperCase()}`);
            console.log(`   Total Calls: ${data.totalCalls}`);
            console.log(`   Total Time: ${(data.totalTime / 1000).toFixed(2)}s`);
            console.log(`   Average Time: ${data.averageTime}ms`);
            console.log(`   Recent Avg (last 10): ${data.recentAverageTime}ms`);
            
            if (data.quotaErrors !== undefined) {
                console.log(`   Quota Errors: ${data.quotaErrors}`);
                console.log(`   Retries: ${data.retries}`);
            }
            
            if (data.recentCalls && data.recentCalls.length > 0) {
                console.log(`   Recent Calls:`);
                data.recentCalls.slice(-3).forEach((call, idx) => {
                    console.log(`     ${idx + 1}. ${call.timestamp} - ${call.duration}`);
                });
            }
        });
        
        console.log('\n' + '─'.repeat(61) + '\n');
        
        return stats;
    }

    reset() {
        Object.keys(this.metrics).forEach(key => {
            this.metrics[key] = {
                totalCalls: 0,
                totalTime: 0,
                calls: [],
                ...(key === 'googleAPI' && {
                    quotaErrors: 0,
                    retries: 0
                })
            };
        });
        console.log('[Performance Monitor] 🔄 Metrics reset');
    }
}

// Singleton instance
const monitor = new PerformanceMonitor();

module.exports = monitor;
