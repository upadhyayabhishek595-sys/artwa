const { Queue } = require('bullmq');
const { redisConnection } = require('../config/redis');

// Broadcast queue — jobs added here, worker picks them up
const broadcastQueue = new Queue('broadcast', {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,                         // retry 3 times on failure
        backoff: { type: 'exponential', delay: 5000 }, // wait 5s, 10s, 20s
        removeOnComplete: { count: 100 },    // keep last 100 completed jobs
        removeOnFail:     { count: 200 },    // keep last 200 failed jobs
    }
});

broadcastQueue.on('error', err => {
    console.error('❌ Broadcast queue error:', err.message);
});

module.exports = { broadcastQueue };
