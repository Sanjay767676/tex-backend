# Performance Monitoring System

## Overview
The system now includes comprehensive performance monitoring to track:
- Google API quota usage and timing
- PDF generation time
- Email sending time
- Scanner/token processing time

## What Was Added

### 1. Performance Monitor Module
**File**: `src/utils/performanceMonitor.js`

A centralized monitoring system that tracks:
- **Total calls**: Count of operations
- **Total time**: Cumulative time spent
- **Average time**: Mean duration per operation
- **Recent average**: Last 10 operations average
- **Quota errors**: Failed API calls due to quota
- **Retries**: Number of retry attempts

### 2. Integrated Monitoring Points

#### Google Sheets API (`src/services/sheetsService.js`)
- Tracks every API call duration
- Records quota errors (429/503 errors)
- Counts retry attempts
- Logs when quota limits are hit

#### PDF Generation (`src/services/pdfService.js`)
- Measures PDF creation time
- Separate tracking for attendance and lunch passes
- Logs duration in console

#### Email Sending (`src/services/emailService.js`)
- Tracks SMTP send time
- Monitors email delivery performance

#### Scanner Operations (`src/routes/scanRoutes.js`)
- Measures token scanning speed
- Returns processing time in response
- Tracks both successful and failed scans

## API Endpoints

### View Performance Stats
```http
GET /debug/performance
```

**Response Example**:
```json
{
  "status": "ok",
  "timestamp": "2026-03-04T10:30:00.000Z",
  "performance": {
    "googleAPI": {
      "totalCalls": 150,
      "totalTime": 45000,
      "averageTime": "300.00",
      "recentAverageTime": "285.00",
      "quotaErrors": 2,
      "retries": 5
    },
    "pdfGeneration": {
      "totalCalls": 45,
      "totalTime": 67500,
      "averageTime": "1500.00",
      "recentAverageTime": "1450.00"
    },
    "emailSending": {
      "totalCalls": 45,
      "totalTime": 135000,
      "averageTime": "3000.00",
      "recentAverageTime": "2950.00"
    },
    "scanner": {
      "totalCalls": 120,
      "totalTime": 36000,
      "averageTime": "300.00",
      "recentAverageTime": "290.00"
    }
  },
  "insights": {
    "googleAPI": {
      "status": "OK",
      "efficiency": "97% success rate",
      "recommendation": "API performance is good (avg 300.00ms)"
    },
    "pdfGeneration": {
      "status": "OK",
      "recommendation": "PDF generation is fast (avg 1500.00ms)"
    },
    "emailSending": {
      "status": "OK",
      "recommendation": "Email sending is fast (avg 3000.00ms)"
    },
    "scanner": {
      "status": "OK",
      "recommendation": "Scanner is fast (avg 300.00ms)"
    }
  }
}
```

### Generate Console Report
```http
GET /debug/performance/report
```

Prints a detailed formatted report in the server console:
```
╔═══════════════════════════════════════════════════════════╗
║         PERFORMANCE MONITORING REPORT                     ║
╚═══════════════════════════════════════════════════════════╝

📊 GOOGLEAPI
   Total Calls: 150
   Total Time: 45.00s
   Average Time: 300.00ms
   Recent Avg (last 10): 285.00ms
   Quota Errors: 2
   Retries: 5
   Recent Calls:
     1. 2026-03-04T10:29:58.000Z - 290ms
     2. 2026-03-04T10:29:59.000Z - 285ms
     3. 2026-03-04T10:30:00.000Z - 280ms

📊 PDFGENERATION
   Total Calls: 45
   Total Time: 67.50s
   Average Time: 1500.00ms
   Recent Avg (last 10): 1450.00ms
   ...
```

### Reset Performance Metrics
```http
POST /debug/performance/reset
```

Clears all performance counters and timers.

## Performance Benchmarks

### Expected Timings (per operation)

| Operation | Target | Warning Threshold | Notes |
|-----------|--------|-------------------|-------|
| Google API Call | < 300ms | > 500ms | Depends on network and Google's response time |
| PDF Generation | < 2000ms | > 3000ms | Includes image loading and QR code rendering |
| Email Sending | < 3000ms | > 5000ms | SMTP connection pooling helps |
| Scanner Processing | < 500ms | > 1000ms | Should be fast with cache enabled |

### Google API Quota Limits

**Read Requests**: 60 requests/minute/user (default)
**Write Requests**: 60 requests/minute/user (default)

The system includes:
- **Token Bucket**: 50 requests per minute
- **Request Gap**: Minimum 1000ms between requests
- **Exponential Backoff**: Automatic retry on 429/503 errors
- **Batch Updates**: Consolidates writes to reduce quota usage

## Monitoring in Production

### 1. Regular Checks
Check performance stats periodically:
```bash
curl https://your-domain.com/debug/performance
```

### 2. Watch for Quota Errors
If `quotaErrors` > 0:
- Check if you're hitting Google's API limits
- Consider requesting quota increase from Google Cloud Console
- Verify token bucket settings are appropriate

### 3. Optimize Slow Operations
If averages exceed thresholds:
- **Google API**: Increase caching TTL
- **PDF Generation**: Optimize image sizes, enable asset caching
- **Email**: Check SMTP pool settings, verify network latency
- **Scanner**: Increase cache refresh interval

### 4. Console Logs
Every operation now logs its duration:
```
[PDF Service] ⏱️ Registration Pass generated in 1450ms
[Email Service] Registration email sent successfully in 2950ms
[Scan API] Scan completed in 290ms
```

## Scanner Response
QR scanner responses now include timing:
```json
{
  "status": "ok",
  "message": "Attendance marked successfully",
  "data": { ... },
  "processingTime": "290ms"
}
```

## Troubleshooting

### High Google API Times
- Enable scan cache: Set `scanCacheEnabled: true` in eventConfig.json
- Reduce cache refresh: Increase `scanCacheRefreshIntervalMinutes`
- Use batch updates where possible

### High PDF Generation Times
- Images are cached after first load
- Ensure fonts are accessible
- Check server CPU/memory usage

### High Email Times
- Connection pool is enabled (5 connections, 50 messages each)
- Verify SMTP server (smtp.gmail.com) is accessible
- Check network latency to Gmail's servers

### Scanner Slow
- Verify cache is warming up on startup
- Check if cache hits are working (`/debug/cache` endpoint)
- Ensure database/sheet queries are fast

## Best Practices

1. **Monitor regularly** during events (high load periods)
2. **Reset metrics** before major operations to get clean data
3. **Use console report** for detailed debugging
4. **Track quota errors** - they indicate hitting API limits
5. **Compare recent vs average** - shows if performance is degrading

## Azure Deployment Notes

- Performance stats persist in memory only (reset on restart)
- For persistent metrics, consider Azure Application Insights
- Monitor logs stream in Azure Portal for real-time performance data
- Set up alerts for quota errors or slow operations
