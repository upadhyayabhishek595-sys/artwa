const crypto = require('crypto');
const { pool } = require('../config/database');

const authenticateApiKey = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({ success: false, message: 'API key required' });
  }

  try {
    // FIX 1: hash incoming key before querying (manage.js stores hashed key)
    const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');

    // FIX 2: use pool not db (db was never defined)
    const [rows] = await pool.execute(
      `SELECT ak.*, c.id as client_id, c.status as client_status 
       FROM api_keys ak 
       JOIN clients c ON ak.client_id = c.id 
       WHERE ak.api_key = ? AND ak.status = 'active'`,
      [hashedKey]
    );

    if (!rows[0]) {
      return res.status(403).json({ success: false, message: 'Invalid or inactive API key' });
    }

    if (rows[0].client_status !== 'active') {
      return res.status(403).json({ success: false, message: 'Client account suspended' });
    }

    // FIX 3: use pool not db
    await pool.execute(
      'UPDATE api_keys SET last_used_at = NOW() WHERE api_key = ?',
      [hashedKey]
    );

    req.user = { id: rows[0].client_id, client_id: rows[0].client_id, type: 'client' };
    next();
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { authenticateApiKey };
