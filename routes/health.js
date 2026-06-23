const express  = require('express');
const router   = express.Router();
const { pool } = require('../config/database');
const { redisConnection } = require('../config/redis');

router.get('/', async (req, res) => {
  const checks = {
    api:      'ok',
    database: 'unknown',
    redis:    process.env.REDIS_HOST ? 'unknown' : 'not_configured',
  };

  try {
    await pool.execute('SELECT 1');
    checks.database = 'ok';
  } catch {
    checks.database = 'error';
  }

  if (process.env.REDIS_HOST) {
    try {
      await redisConnection.ping();
      checks.redis = 'ok';
    } catch {
      checks.redis = 'error';
    }
  }

  const healthy = checks.database === 'ok';
  res.status(healthy ? 200 : 503).json({
    success: healthy,
    status:  healthy ? 'healthy' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
