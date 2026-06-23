const express  = require('express');
const router   = express.Router();
const { pool } = require('../config/database');
const { verifyClient } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');

// GET /api/groups
router.get('/', verifyClient, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT g.*, COUNT(cgm.contact_id) as member_count
       FROM contact_groups g
       LEFT JOIN contact_group_members cgm ON cgm.group_id = g.id
       WHERE g.client_id = ?
       GROUP BY g.id
       ORDER BY g.created_at DESC`,
      [req.client.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/groups
router.post('/', verifyClient, validate(schemas.createGroup), async (req, res) => {
  try {
    const { name, description, color } = req.body;
    const [result] = await pool.execute(
      'INSERT INTO contact_groups (client_id, name, description, color) VALUES (?, ?, ?, ?)',
      [req.client.id, name, description || null, color || null]
    );
    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PATCH /api/groups/:id
router.patch('/:id', verifyClient, validate(schemas.updateGroup), async (req, res) => {
  try {
    const { name, description, color } = req.body;
    const [existing] = await pool.execute(
      'SELECT id FROM contact_groups WHERE id = ? AND client_id = ?',
      [req.params.id, req.client.id]
    );
    if (!existing.length)
      return res.status(404).json({ success: false, message: 'Group not found' });

    await pool.execute(
      `UPDATE contact_groups SET
         name = COALESCE(?, name),
         description = COALESCE(?, description),
         color = COALESCE(?, color)
       WHERE id = ? AND client_id = ?`,
      [name ?? null, description ?? null, color ?? null, req.params.id, req.client.id]
    );
    res.json({ success: true, message: 'Group updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// DELETE /api/groups/:id
router.delete('/:id', verifyClient, async (req, res) => {
  try {
    await pool.execute(
      'DELETE FROM contact_group_members WHERE group_id = ?',
      [req.params.id]
    );
    const [result] = await pool.execute(
      'DELETE FROM contact_groups WHERE id = ? AND client_id = ?',
      [req.params.id, req.client.id]
    );
    if (!result.affectedRows)
      return res.status(404).json({ success: false, message: 'Group not found' });

    res.json({ success: true, message: 'Group deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/groups/:id/members
router.get('/:id/members', verifyClient, async (req, res) => {
  try {
    const [group] = await pool.execute(
      'SELECT id FROM contact_groups WHERE id = ? AND client_id = ?',
      [req.params.id, req.client.id]
    );
    if (!group.length)
      return res.status(404).json({ success: false, message: 'Group not found' });

    const [members] = await pool.execute(
      `SELECT c.id, c.name, c.phone, c.email, c.opted_in, cgm.added_at
       FROM contact_group_members cgm
       JOIN contacts c ON c.id = cgm.contact_id
       WHERE cgm.group_id = ?`,
      [req.params.id]
    );
    res.json({ success: true, data: members });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/groups/:id/members — add contacts
router.post('/:id/members', verifyClient, validate(schemas.groupMembers), async (req, res) => {
  try {
    const { contact_ids } = req.body;
    const [group] = await pool.execute(
      'SELECT id FROM contact_groups WHERE id = ? AND client_id = ?',
      [req.params.id, req.client.id]
    );
    if (!group.length)
      return res.status(404).json({ success: false, message: 'Group not found' });

    let added = 0;
    for (const contactId of contact_ids) {
      const [contact] = await pool.execute(
        'SELECT id FROM contacts WHERE id = ? AND client_id = ?',
        [contactId, req.client.id]
      );
      if (!contact.length) continue;

      try {
        await pool.execute(
          'INSERT INTO contact_group_members (group_id, contact_id) VALUES (?, ?)',
          [req.params.id, contactId]
        );
        added++;
      } catch {
        // duplicate member — skip
      }
    }

    res.json({ success: true, message: `${added} contact(s) added to group`, data: { added } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// DELETE /api/groups/:id/members/:contactId
router.delete('/:id/members/:contactId', verifyClient, async (req, res) => {
  try {
    await pool.execute(
      `DELETE cgm FROM contact_group_members cgm
       JOIN contact_groups g ON g.id = cgm.group_id
       WHERE cgm.group_id = ? AND cgm.contact_id = ? AND g.client_id = ?`,
      [req.params.id, req.params.contactId, req.client.id]
    );
    res.json({ success: true, message: 'Member removed' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
