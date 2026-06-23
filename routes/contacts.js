const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const Papa     = require('papaparse');
const fs       = require('fs');
const { pool } = require('../config/database');
const { verifyClient } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');

const upload = multer({ dest: '/tmp/csv_uploads/', limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB max

// ─── GET /api/contacts ────────────────────────────────────────────────────────
// Supports: ?search=, ?tag=vip, ?opted_in=1, ?page=, ?limit=

router.get('/', verifyClient, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, tag, opted_in } = req.query;
    const offset = (page - 1) * limit;

    let where  = 'WHERE client_id = ?';
    let params = [req.client.id];

    if (search) {
      where += ' AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    // FIX: Tag filter — JSON_CONTAINS on tags column
    if (tag) {
      where += ' AND JSON_CONTAINS(tags, ?)';
      params.push(JSON.stringify(tag));
    }

    if (opted_in !== undefined) {
      where += ' AND opted_in = ?';
      params.push(parseInt(opted_in));
    }

    const [contacts] = await pool.execute(
      `SELECT id, name, phone, email, notes, tags, opted_in, is_blocked, created_at
       FROM contacts ${where}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    const [countRows] = await pool.execute(
      `SELECT COUNT(*) as total FROM contacts ${where}`, params
    );

    res.json({
      success: true,
      data: contacts,
      pagination: {
        total: countRows[0].total,
        page:  parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(countRows[0].total / limit),
      },
    });
  } catch (err) {
    console.error('GET contacts error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── GET /api/contacts/tags/list — must be before /:id ────────────────────────

router.get('/tags/list', verifyClient, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT tags FROM contacts WHERE client_id = ? AND tags IS NOT NULL',
      [req.client.id]
    );

    const tagSet = new Set();
    for (const row of rows) {
      try {
        const tags = typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags;
        if (Array.isArray(tags)) tags.forEach(t => tagSet.add(t));
      } catch {}
    }

    res.json({ success: true, data: [...tagSet].sort() });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── GET /api/contacts/:id ────────────────────────────────────────────────────

router.get('/:id', verifyClient, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM contacts WHERE id = ? AND client_id = ?',
      [req.params.id, req.client.id]
    );
    if (!rows.length)
      return res.status(404).json({ success: false, message: 'Contact not found' });

    res.json({ success: true, data: rows[0] });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── POST /api/contacts ───────────────────────────────────────────────────────

router.post('/', verifyClient, validate(schemas.createContact), async (req, res) => {
  try {
    const { name, phone, email, notes, tags } = req.body;

    const [existing] = await pool.execute(
      'SELECT id FROM contacts WHERE client_id = ? AND phone = ?',
      [req.client.id, phone]
    );
    if (existing.length)
      return res.status(400).json({ success: false, message: 'Contact already exists' });

    const [result] = await pool.execute(
      'INSERT INTO contacts (client_id, name, phone, email, notes, tags, opted_in) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [req.client.id, name || null, phone, email || null, notes || null, tags ? JSON.stringify(tags) : null]
    );

    res.status(201).json({ success: true, message: 'Contact created', data: { id: result.insertId } });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── PATCH /api/contacts/:id ──────────────────────────────────────────────────

router.patch('/:id', verifyClient, validate(schemas.updateContact), async (req, res) => {
  try {
    const { name, email, notes, tags } = req.body;

    await pool.execute(
      `UPDATE contacts
       SET name  = COALESCE(?, name),
           email = COALESCE(?, email),
           notes = COALESCE(?, notes),
           tags  = COALESCE(?, tags)
       WHERE id = ? AND client_id = ?`,
      [name || null, email || null, notes || null, tags ? JSON.stringify(tags) : null, req.params.id, req.client.id]
    );

    res.json({ success: true, message: 'Contact updated' });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── DELETE /api/contacts/:id ─────────────────────────────────────────────────

router.delete('/:id', verifyClient, async (req, res) => {
  try {
    await pool.execute(
      'DELETE FROM contacts WHERE id = ? AND client_id = ?',
      [req.params.id, req.client.id]
    );
    res.json({ success: true, message: 'Contact deleted' });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── POST /api/contacts/import — CSV bulk import ──────────────────────────────
// CSV columns: name, phone (required), email, notes, tags (comma-separated)
// Returns: { inserted, updated, skipped, errors }

router.post('/import', verifyClient, upload.single('file'), async (req, res) => {
  if (!req.file)
    return res.status(400).json({ success: false, message: 'CSV file required. Use multipart/form-data with field name "file".' });

  const filePath = req.file.path;

  try {
    const csvText = fs.readFileSync(filePath, 'utf8');
    const { data, errors: parseErrors } = Papa.parse(csvText, {
      header:           true,
      skipEmptyLines:   true,
      transformHeader:  h => h.trim().toLowerCase(),
    });

    if (parseErrors.length)
      return res.status(400).json({ success: false, message: 'CSV parse error', detail: parseErrors[0].message });

    if (!data.length)
      return res.status(400).json({ success: false, message: 'CSV file is empty' });

    let inserted = 0, updated = 0, skipped = 0;
    const rowErrors = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const phone = row.phone?.toString().trim().replace(/\s+/g, '');
      const name  = row.name?.trim() || null;
      const email = row.email?.trim() || null;
      const notes = row.notes?.trim() || null;

      // Parse tags: "vip,lead" → ["vip","lead"]
      const tags = row.tags
        ? row.tags.split(',').map(t => t.trim()).filter(Boolean)
        : null;

      // Validate phone
      if (!phone || !/^[0-9]{7,15}$/.test(phone)) {
        rowErrors.push({ row: i + 2, phone, reason: 'Invalid or missing phone number' });
        skipped++;
        continue;
      }

      try {
        const [existing] = await pool.execute(
          'SELECT id FROM contacts WHERE client_id = ? AND phone = ?',
          [req.client.id, phone]
        );

        if (existing.length) {
          // Upsert — update name/email/notes if provided, keep opted_in as-is
          await pool.execute(
            `UPDATE contacts
             SET name  = COALESCE(?, name),
                 email = COALESCE(?, email),
                 notes = COALESCE(?, notes),
                 tags  = COALESCE(?, tags)
             WHERE id = ? AND client_id = ?`,
            [name, email, notes, tags ? JSON.stringify(tags) : null, existing[0].id, req.client.id]
          );
          updated++;
        } else {
          await pool.execute(
            'INSERT INTO contacts (client_id, name, phone, email, notes, tags, opted_in) VALUES (?, ?, ?, ?, ?, ?, 1)',
            [req.client.id, name, phone, email, notes, tags ? JSON.stringify(tags) : null]
          );
          inserted++;
        }
      } catch (rowErr) {
        rowErrors.push({ row: i + 2, phone, reason: rowErr.message });
        skipped++;
      }
    }

    res.json({
      success: true,
      message: `Import complete: ${inserted} inserted, ${updated} updated, ${skipped} skipped`,
      data: { inserted, updated, skipped, errors: rowErrors },
    });

  } catch (err) {
    console.error('CSV import error:', err);
    res.status(500).json({ success: false, message: 'Import failed', detail: err.message });
  } finally {
    // Always clean up temp file
    fs.unlink(filePath, () => {});
  }
});

// ─── PATCH /api/contacts/:id/opt-in ───────────────────────────────────────────

router.patch('/:id/opt-in', verifyClient, async (req, res) => {
  try {
    const { opted_in } = req.body;
    if (![0, 1].includes(opted_in))
      return res.status(400).json({ success: false, message: 'opted_in must be 0 or 1' });

    await pool.execute(
      'UPDATE contacts SET opted_in = ?, opted_out_at = ? WHERE id = ? AND client_id = ?',
      [opted_in, opted_in ? null : new Date(), req.params.id, req.client.id]
    );
    res.json({ success: true, message: opted_in ? 'Contact opted in' : 'Contact opted out' });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;