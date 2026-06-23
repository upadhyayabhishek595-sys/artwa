const express  = require('express');
const router   = express.Router();
const { pool } = require('../config/database');
const { verifyClient } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');

const DEFAULT_BUSINESS_HOURS = {
  enabled: false,
  away_message: 'We are currently outside business hours. We will get back to you soon!',
  schedule: {
    monday:    { open: true,  start: '09:00', end: '18:00' },
    tuesday:   { open: true,  start: '09:00', end: '18:00' },
    wednesday: { open: true,  start: '09:00', end: '18:00' },
    thursday:  { open: true,  start: '09:00', end: '18:00' },
    friday:    { open: true,  start: '09:00', end: '18:00' },
    saturday:  { open: false, start: '09:00', end: '13:00' },
    sunday:    { open: false, start: '09:00', end: '13:00' },
  },
};

const parseJson = (val, fallback = null) => {
  if (val == null) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
};

// GET /api/settings
router.get('/', verifyClient, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT business_hours_enabled, business_hours, timezone,
              auto_reply_enabled, auto_reply_message,
              away_message_enabled, away_message,
              assignment_mode, email_notifications, language
       FROM client_settings WHERE client_id = ?`,
      [req.client.id]
    );

    if (!rows.length) {
      await pool.execute('INSERT INTO client_settings (client_id) VALUES (?)', [req.client.id]);
      return res.json({
        success: true,
        data: {
          business_hours_enabled: 0,
          business_hours: DEFAULT_BUSINESS_HOURS,
          timezone: 'Asia/Kolkata',
          auto_reply_enabled: 0,
          assignment_mode: 'manual',
          email_notifications: 1,
          language: 'en',
        },
      });
    }

    const row = rows[0];
    const businessHours = parseJson(row.business_hours, DEFAULT_BUSINESS_HOURS);

    res.json({
      success: true,
      data: {
        ...row,
        business_hours: businessHours,
      },
    });
  } catch (err) {
    console.error('GET settings error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PATCH /api/settings
router.patch('/', verifyClient, validate(schemas.updateSettings), async (req, res) => {
  try {
    const {
      business_hours_enabled,
      business_hours,
      timezone,
      auto_reply_enabled,
      auto_reply_message,
      away_message_enabled,
      away_message,
      assignment_mode,
      email_notifications,
      language,
    } = req.body;

    const [existing] = await pool.execute(
      'SELECT id FROM client_settings WHERE client_id = ?',
      [req.client.id]
    );
    if (!existing.length) {
      await pool.execute('INSERT INTO client_settings (client_id) VALUES (?)', [req.client.id]);
    }

    await pool.execute(
      `UPDATE client_settings SET
         business_hours_enabled = COALESCE(?, business_hours_enabled),
         business_hours         = COALESCE(?, business_hours),
         timezone               = COALESCE(?, timezone),
         auto_reply_enabled     = COALESCE(?, auto_reply_enabled),
         auto_reply_message     = COALESCE(?, auto_reply_message),
         away_message_enabled   = COALESCE(?, away_message_enabled),
         away_message           = COALESCE(?, away_message),
         assignment_mode        = COALESCE(?, assignment_mode),
         email_notifications    = COALESCE(?, email_notifications),
         language               = COALESCE(?, language)
       WHERE client_id = ?`,
      [
        business_hours_enabled ?? null,
        business_hours ? JSON.stringify(business_hours) : null,
        timezone ?? null,
        auto_reply_enabled ?? null,
        auto_reply_message ?? null,
        away_message_enabled ?? null,
        away_message ?? null,
        assignment_mode ?? null,
        email_notifications ?? null,
        language ?? null,
        req.client.id,
      ]
    );

    res.json({ success: true, message: 'Settings updated' });
  } catch (err) {
    console.error('PATCH settings error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
