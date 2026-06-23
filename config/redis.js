const { Redis } = require('ioredis'); 
const redisConnection = new Redis({ host: process.env.REDIS_HOST || '127.0.0.1', port: parseInt(process.env.REDIS_PORT) || 6379, password: process.env.REDIS_PASSWORD || undefined, maxRetriesPerRequest: null,  }); 
 redisConnection.on('connect', () => console.log('✅ Redis connected'));
 redisConnection.on('error', (err) => console.error('❌ Redis error:', err.message));
  module.exports = { redisConnection };
  