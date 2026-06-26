const { Redis } = require("ioredis");

const redisConnection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: true,

  tls: {
    rejectUnauthorized: false,
  },

  retryStrategy(times) {
    return Math.min(times * 1000, 5000);
  },
});

(async () => {
  try {
    await redisConnection.connect();
    console.log("✅ Redis connected");
  } catch (err) {
    console.error("❌ Redis connect failed:", err);
  }
})();

redisConnection.on("ready", () => {
  console.log("🚀 Redis ready");
});

redisConnection.on("error", (err) => {
  console.error("Redis error:", err);
});

module.exports = { redisConnection };