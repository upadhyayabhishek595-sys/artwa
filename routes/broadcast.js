const express   = require('express');
const router    = express.Router();
const { pool }  = require('../config/database');
const { verifyClient } = require('../middleware/auth');
const { checkMessageLimit } = require('../middleware/messageLimit');
const { validate, schemas } = require('../middleware/validate');
const { broadcastQueue } = require('../queues/broadcastQueue');

// ─── POST /api/broadcast ──────────────────────────────────────────────────────

router.post('/', verifyClient, checkMessageLimit, validate(schemas.createBroadcast), async (req, res) => {
  try {
    const { name, template_id, phone_number_id, contact_ids, tag, scheduled_at } = req.body;

    const [templateRows] = await pool.execute(
      'SELECT * FROM templates WHERE id = ? AND client_id = ?',
      [template_id, req.client.id]
    );
    if (!templateRows.length)
      return res.status(404).json({ success: false, message: 'Template not found' });

    const tpl = templateRows[0];
    if (tpl.status !== 'approved')
      return res.status(400).json({
        success: false,
        message: `Template "${tpl.name}" is not approved (status: ${tpl.status}). Only approved templates can be broadcast.`,
      });

    const [phoneRows] = await pool.execute(
      'SELECT * FROM phone_numbers WHERE id = ? AND client_id = ? AND status = "active"',
      [phone_number_id, req.client.id]
    );
    if (!phoneRows.length)
      return res.status(404).json({ success: false, message: 'Phone number not found' });

    const phoneRecord = phoneRows[0];

    if (phoneRecord.quality_rating === 'red' || phoneRecord.quality_rating === 'RED')
      return res.status(400).json({
        success: false,
        message: 'Phone number quality rating is RED. Broadcast paused to protect your number.',
      });

    // Resolve contacts — by IDs, by tag, or all opted-in
    let contacts = [];
    if (contact_ids?.length) {
      const placeholders = contact_ids.map(() => '?').join(',');
      const [rows] = await pool.execute(
        `SELECT id, phone, name FROM contacts
         WHERE client_id = ? AND id IN (${placeholders}) AND opted_in = 1 AND is_blocked = 0`,
        [req.client.id, ...contact_ids]
      );
      contacts = rows;
    } else if (tag) {
      const [rows] = await pool.execute(
        `SELECT id, phone, name FROM contacts
         WHERE client_id = ? AND opted_in = 1 AND is_blocked = 0 AND JSON_CONTAINS(tags, ?)`,
        [req.client.id, JSON.stringify(tag)]
      );
      contacts = rows;
    } else {
      const [rows] = await pool.execute(
        'SELECT id, phone, name FROM contacts WHERE client_id = ? AND opted_in = 1 AND is_blocked = 0',
        [req.client.id]
      );
      contacts = rows;
    }

    if (!contacts.length)
      return res.status(400).json({ success: false, message: 'No eligible opted-in contacts found' });

    const [result] = await pool.execute(
      `INSERT INTO broadcasts
         (client_id, phone_number_id, template_id, name, status, total_contacts, scheduled_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.client.id, phone_number_id, template_id, name,
        scheduled_at ? 'draft' : 'queued',  // 'queued' instead of 'running' — worker sets running
        contacts.length,
        scheduled_at || null,
      ]
    );

    const broadcastId = result.insertId;

    // Insert all contacts as pending
    for (const contact of contacts) {
      await pool.execute(
        'INSERT INTO broadcast_contacts (broadcast_id, contact_id) VALUES (?, ?)',
        [broadcastId, contact.id]
      );
    }

    // FIX: Queue add karo — NO setImmediate, NO processBroadcast
    if (!scheduled_at) {
      await broadcastQueue.add(
        `broadcast-${broadcastId}`,
        { broadcastId, clientId: req.client.id },
        { jobId: `broadcast-${broadcastId}` }  // duplicate prevent karta hai
      );
    }

    res.status(201).json({
      success: true,
      message: scheduled_at ? `Broadcast scheduled for ${scheduled_at}` : 'Broadcast queued and starting shortly',
      data: {
        id: broadcastId,
        total_contacts: contacts.length,
        status: scheduled_at ? 'draft' : 'queued'
      },
    });

  } catch (err) {
    console.error('❌ Create broadcast error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── GET /api/broadcast ───────────────────────────────────────────────────────

router.get('/', verifyClient, async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const offset = (page - 1) * limit;
    let where  = 'WHERE b.client_id = ?';
    let params = [req.client.id];
    if (status) { where += ' AND b.status = ?'; params.push(status); }

    const [broadcasts] = await pool.execute(
      `SELECT b.*, t.name as template_name, p.phone_number as from_number
       FROM broadcasts b
       LEFT JOIN templates t ON b.template_id = t.id
       LEFT JOIN phone_numbers p ON b.phone_number_id = p.id
       ${where}
       ORDER BY b.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    const [countRows] = await pool.execute(
      `SELECT COUNT(*) as total FROM broadcasts b ${where}`, params
    );

    res.json({
      success: true,
      data: broadcasts,
      pagination: {
        total: countRows[0].total,
        page:  parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(countRows[0].total / limit),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── GET /api/broadcast/:id ───────────────────────────────────────────────────

router.get('/:id', verifyClient, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT b.*, t.name as template_name, p.phone_number as from_number
       FROM broadcasts b
       LEFT JOIN templates t ON b.template_id = t.id
       LEFT JOIN phone_numbers p ON b.phone_number_id = p.id
       WHERE b.id = ? AND b.client_id = ?`,
      [req.params.id, req.client.id]
    );
    if (!rows.length)
      return res.status(404).json({ success: false, message: 'Broadcast not found' });

    const [stats] = await pool.execute(
      'SELECT status, COUNT(*) as count FROM broadcast_contacts WHERE broadcast_id = ? GROUP BY status',
      [req.params.id]
    );

    res.json({ success: true, data: { ...rows[0], stats } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── GET /api/broadcast/:id/contacts ─────────────────────────────────────────

router.get('/:id/contacts', verifyClient, async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    let where  = 'WHERE bc.broadcast_id = ?';
    let params = [req.params.id];
    if (status) { where += ' AND bc.status = ?'; params.push(status); }

    const [contacts] = await pool.execute(
      `SELECT bc.*, c.phone, c.name
       FROM broadcast_contacts bc
       JOIN contacts c ON bc.contact_id = c.id
       ${where}
       ORDER BY bc.id DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );
    res.json({ success: true, data: contacts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── PATCH /api/broadcast/:id/pause ──────────────────────────────────────────

router.patch('/:id/pause', verifyClient, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT status FROM broadcasts WHERE id = ? AND client_id = ?',
      [req.params.id, req.client.id]
    );
    if (!rows.length)
      return res.status(404).json({ success: false, message: 'Broadcast not found' });
    if (rows[0].status !== 'running')
      return res.status(400).json({ success: false, message: `Cannot pause — broadcast is ${rows[0].status}` });

    await pool.execute(
      'UPDATE broadcasts SET status = "paused" WHERE id = ? AND client_id = ?',
      [req.params.id, req.client.id]
    );
    res.json({ success: true, message: 'Broadcast paused' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── PATCH /api/broadcast/:id/resume ─────────────────────────────────────────

router.patch('/:id/resume', verifyClient, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT b.* FROM broadcasts b
       WHERE b.id = ? AND b.client_id = ?`,
      [req.params.id, req.client.id]
    );
    if (!rows.length)
      return res.status(404).json({ success: false, message: 'Broadcast not found' });

    const broadcast = rows[0];
    if (broadcast.status !== 'paused')
      return res.status(400).json({ success: false, message: `Cannot resume — broadcast is ${broadcast.status}` });

    // Check pending contacts exist
    const [remaining] = await pool.execute(
      `SELECT COUNT(*) as count FROM broadcast_contacts
       WHERE broadcast_id = ? AND status = 'pending'`,
      [req.params.id]
    );

    if (!remaining[0].count)
      return res.status(400).json({ success: false, message: 'No pending contacts left to resume' });

    // FIX: status queued karo, worker running karega
    await pool.execute(
      'UPDATE broadcasts SET status = "queued" WHERE id = ?',
      [broadcast.id]
    );

    // FIX: correct variable — broadcast.id, req.client.id
    await broadcastQueue.add(
      `broadcast-resume-${broadcast.id}`,
      { broadcastId: broadcast.id, clientId: req.client.id },
      { jobId: `broadcast-resume-${broadcast.id}` }
    );

    res.json({
      success: true,
      message: `Broadcast resumed — ${remaining[0].count} contacts remaining`,
      data: { pending_contacts: remaining[0].count },
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PATCH /api/broadcast/:id/cancel
router.patch('/:id/cancel', verifyClient, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT status FROM broadcasts WHERE id = ? AND client_id = ?',
      [req.params.id, req.client.id]
    );
    if (!rows.length)
      return res.status(404).json({ success: false, message: 'Broadcast not found' });

    if (['completed', 'cancelled', 'failed'].includes(rows[0].status))
      return res.status(400).json({ success: false, message: `Cannot cancel — broadcast is ${rows[0].status}` });

    await pool.execute(
      'UPDATE broadcasts SET status = "cancelled", completed_at = NOW() WHERE id = ? AND client_id = ?',
      [req.params.id, req.client.id]
    );

    res.json({ success: true, message: 'Broadcast cancelled' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;