const express  = require('express');
const router   = express.Router();
const { pool } = require('../config/database');
const { verifyClient } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');

const parseJson = (val) => {
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return val; }
};

// GET /api/flows
router.get('/', verifyClient, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, name, description, \`trigger\`, steps, priority, active, created_at, updated_at
       FROM flows WHERE client_id = ?
       ORDER BY priority ASC, created_at DESC`,
      [req.client.id]
    );

    res.json({
      success: true,
      data: rows.map(r => ({
        ...r,
        trigger: parseJson(r.trigger),
        steps:   parseJson(r.steps),
      })),
    });
  } catch (err) {
    console.error('GET flows error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/flows/:id
router.get('/:id', verifyClient, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM flows WHERE id = ? AND client_id = ?',
      [req.params.id, req.client.id]
    );
    if (!rows.length)
      return res.status(404).json({ success: false, message: 'Flow not found' });

    const flow = rows[0];
    flow.trigger = parseJson(flow.trigger);
    flow.steps   = parseJson(flow.steps);

    res.json({ success: true, data: flow });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/flows
router.post('/', verifyClient, validate(schemas.createFlow), async (req, res) => {
  try {
    const { name, description, trigger, steps, priority = 0, active = 1 } = req.body;

    const [result] = await pool.execute(
      `INSERT INTO flows (client_id, name, description, \`trigger\`, steps, priority, active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.client.id,
        name,
        description || null,
        JSON.stringify(trigger),
        JSON.stringify(steps),
        priority,
        active ? 1 : 0,
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Flow created',
      data: { id: result.insertId },
    });
  } catch (err) {
    console.error('POST flow error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PATCH /api/flows/:id
router.patch('/:id', verifyClient, validate(schemas.updateFlow), async (req, res) => {
  try {
    const { name, description, trigger, steps, priority, active } = req.body;

    const [existing] = await pool.execute(
      'SELECT id FROM flows WHERE id = ? AND client_id = ?',
      [req.params.id, req.client.id]
    );
    if (!existing.length)
      return res.status(404).json({ success: false, message: 'Flow not found' });

    await pool.execute(
      `UPDATE flows SET
         name        = COALESCE(?, name),
         description = COALESCE(?, description),
         \`trigger\` = COALESCE(?, \`trigger\`),
         steps       = COALESCE(?, steps),
         priority    = COALESCE(?, priority),
         active      = COALESCE(?, active)
       WHERE id = ? AND client_id = ?`,
      [
        name ?? null,
        description ?? null,
        trigger ? JSON.stringify(trigger) : null,
        steps ? JSON.stringify(steps) : null,
        priority ?? null,
        active !== undefined ? (active ? 1 : 0) : null,
        req.params.id,
        req.client.id,
      ]
    );

    res.json({ success: true, message: 'Flow updated' });
  } catch (err) {
    console.error('PATCH flow error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// DELETE /api/flows/:id
router.delete('/:id', verifyClient, async (req, res) => {
  try {
    const [result] = await pool.execute(
      'DELETE FROM flows WHERE id = ? AND client_id = ?',
      [req.params.id, req.client.id]
    );
    if (!result.affectedRows)
      return res.status(404).json({ success: false, message: 'Flow not found' });

    res.json({ success: true, message: 'Flow deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
