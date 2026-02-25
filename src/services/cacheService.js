const { createClient } = require('redis');

class CacheService {
    constructor() {
        this.client = null;
        this.memoryCache = new Map();
        this.isRedis = false;

        const redisUrl = process.env.REDIS_URL;
        if (redisUrl) {
            console.log('[Cache Service] 🔌 Connecting to Redis...');
            this.client = createClient({ url: redisUrl });
            this.client.on('error', (err) => {
                console.error('[Cache Service] ❌ Redis Error:', err.message);
                this.isRedis = false;
            });
            this.client.connect()
                .then(() => {
                    console.log('[Cache Service] ✅ Redis Connected');
                    this.isRedis = true;
                })
                .catch((err) => {
                    console.error('[Cache Service] ❌ Redis Connection Failed:', err.message);
                    this.isRedis = false;
                });
        } else {
            console.log('[Cache Service] 🧠 Using In-Memory Cache (Fallback)');
        }
    }

    async get(key) {
        if (this.isRedis) {
            try {
                const value = await this.client.get(key);
                return value ? JSON.parse(value) : null;
            } catch (err) {
                console.error('[Cache Service] Get Error:', err.message);
                return this.memoryCache.get(key);
            }
        }
        return this.memoryCache.get(key);
    }

    async set(key, value, ttlSeconds = 0) {
        if (this.isRedis) {
            try {
                const options = ttlSeconds > 0 ? { EX: ttlSeconds } : {};
                await this.client.set(key, JSON.stringify(value), options);
            } catch (err) {
                console.error('[Cache Service] Set Error:', err.message);
                this.memoryCache.set(key, value);
            }
        } else {
            this.memoryCache.set(key, value);
        }
    }

    async delete(key) {
        if (this.isRedis) {
            try {
                await this.client.del(key);
            } catch (err) {
                this.memoryCache.delete(key);
            }
        } else {
            this.memoryCache.delete(key);
        }
    }

    async clear() {
        if (this.isRedis) {
            try {
                await this.client.flushAll();
            } catch (err) {
                this.memoryCache.clear();
            }
        } else {
            this.memoryCache.clear();
        }
    }

    get size() {
        return this.isRedis ? 'Redis-Managed' : this.memoryCache.size;
    }
}

module.exports = new CacheService();
