const express  = require('express');
const router   = express.Router();
const jwt      = require('jsonwebtoken');
const { pool } = require('../config/database');
const { issueRefreshToken } = require('../utils/tokens');

router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token)
      return res.status(400).json({ success: false, message: 'refresh_token required' });

    let decoded;
    try {
      decoded = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);
    } catch {
      return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
    }

    if (decoded.type !== 'refresh')
      return res.status(401).json({ success: false, message: 'Invalid token type' });

    const [rows] = await pool.execute(
      `SELECT * FROM refresh_tokens
       WHERE token = ? AND revoked = 0 AND expires_at > NOW()`,
      [refresh_token]
    );
    if (!rows.length)
      return res.status(401).json({ success: false, message: 'Refresh token revoked or expired' });

    const stored = rows[0];
    const tableMap = { admin: 'admins', client: 'clients', agent: 'agents', reseller: 'resellers' };
    const table    = tableMap[stored.user_type];

    const [userRows] = await pool.execute(
      `SELECT * FROM ${table} WHERE id = ?`, [stored.user_id]
    );
    if (!userRows.length)
      return res.status(401).json({ success: false, message: 'User not found' });

    const user = userRows[0];

    await pool.execute(
      'UPDATE refresh_tokens SET revoked = 1 WHERE id = ?', [stored.id]
    );

    const newRefreshToken = await issueRefreshToken(stored.user_id, stored.user_type);

    let accessPayload;
    switch (stored.user_type) {
      case 'admin':
        accessPayload = { id: user.id, email: user.email, role: user.role, type: 'admin' };
        break;
      case 'client':
        accessPayload = { id: user.id, email: user.email, type: 'client' };
        break;
      case 'agent':
        accessPayload = { id: user.id, client_id: user.client_id, type: 'agent', role: user.role };
        break;
      case 'reseller':
        accessPayload = { id: user.id, email: user.email, type: 'reseller' };
        break;
      default:
        return res.status(401).json({ success: false, message: 'Unknown user type' });
    }

    const accessToken = jwt.sign(accessPayload, process.env.JWT_SECRET, { expiresIn: '15m' });

    res.json({
      success:       true,
      access_token:  accessToken,
      token:         accessToken,
      refresh_token: newRefreshToken,
      expires_in:    15 * 60,
    });

  } catch (err) {
    console.error('Refresh token error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token)
      return res.status(400).json({ success: false, message: 'refresh_token required' });

    await pool.execute(
      'UPDATE refresh_tokens SET revoked = 1 WHERE token = ?', [refresh_token]
    );

    res.json({ success: true, message: 'Logged out successfully' });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = { router };
