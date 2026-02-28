class CacheService {
    constructor() {
        this.tokenCache = new Map(); // Level 1 Native In-Memory Cache
        this.lastRefresh = null;
        this.isRefreshing = false;
        console.log('[Cache Service] 🧠 Level 1 Native In-Memory Cache initialized');
        
        // Start auto-refresh every 30 seconds
        this.startAutoRefresh();
    }

    startAutoRefresh() {
        setInterval(() => {
            this.refreshFromSheets().catch(err => {
                console.error('[Cache Service] Auto-refresh failed:', err.message);
            });
        }, 30000); // 30 seconds
    }

    async refreshFromSheets() {
        if (this.isRefreshing) {
            console.log('[Cache Service] Refresh already in progress, skipping...');
            return;
        }

        this.isRefreshing = true;
        try {
            const sheetsService = require('./sheetsService');
            console.log('[Cache Service] 🔄 Refreshing token cache from sheets...');
            
            await sheetsService.warmUpCache();
            this.lastRefresh = new Date().toISOString();
            console.log(`[Cache Service] ✅ Cache refreshed successfully. Size: ${this.tokenCache.size}`);
        } catch (error) {
            console.error('[Cache Service] ❌ Cache refresh failed:', error.message);
        } finally {
            this.isRefreshing = false;
        }
    }

    async get(token) {
        const data = this.tokenCache.get(token);
        if (data) {
            console.log(`[Cache Service] 🎯 Cache HIT for token: ${token}`);
            return data;
        } else {
            console.log(`[Cache Service] 💭 Cache MISS for token: ${token}`);
            return null;
        }
    }

    async set(token, data) {
        // Ensure data has required structure
        const tokenData = {
            sheetId: data.spreadsheetId || data.sheetId,
            rowIndex: data.rowIndex,
            attendance: data.attendance || false,
            lunch: data.lunch || false,
            ...data // Include all other properties
        };
        
        this.tokenCache.set(token, tokenData);
        console.log(`[Cache Service] 📝 Token cached: ${token}`);
    }

    async delete(token) {
        const deleted = this.tokenCache.delete(token);
        if (deleted) {
            console.log(`[Cache Service] 🗑️ Token deleted: ${token}`);
        }
        return deleted;
    }

    async clear() {
        this.tokenCache.clear();
        console.log('[Cache Service] 🧹 Cache cleared');
    }

    get size() {
        return this.tokenCache.size;
    }

    getStats() {
        return {
            size: this.tokenCache.size,
            lastRefresh: this.lastRefresh,
            isRefreshing: this.isRefreshing
        };
    }

    // Helper to get raw map if needed (for sheetsService)
    getInternalMap() {
        return this.tokenCache;
    }
}

module.exports = new CacheService();
