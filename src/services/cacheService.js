class CacheService {
    constructor() {
        this.memoryCache = new Map();
        console.log('[Cache Service] 🧠 Using Global In-Memory Cache (Strict)');
    }

    async get(key) {
        return this.memoryCache.get(key);
    }

    async set(key, value) {
        this.memoryCache.set(key, value);
    }

    async delete(key) {
        this.memoryCache.delete(key);
    }

    async clear() {
        this.memoryCache.clear();
    }

    get size() {
        return this.memoryCache.size;
    }

    // Helper to get raw map if needed
    getInternalMap() {
        return this.memoryCache;
    }
}

module.exports = new CacheService();
