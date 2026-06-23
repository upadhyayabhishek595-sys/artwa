const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const fs       = require('fs');
const path     = require('path');
const axios    = require('axios');
const { pool } = require('../config/database');
const { decrypt } = require('../config/encryption');
const { verifyClient } = require('../middleware/auth');

const META_API = process.env.META_API_VERSION || 'v20.0';
const UPLOAD_DIR = process.env.MEDIA_UPLOAD_DIR || path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 16 * 1024 * 1024 },
});

const ALLOWED_MIME = {
  'image/jpeg': 'image',
  'image/png':  'image',
  'image/webp': 'image',
  'video/mp4':  'video',
  'audio/mpeg': 'audio',
  'audio/ogg':  'audio',
  'application/pdf': 'document',
};

// GET /api/media
router.get('/', verifyClient, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const [rows] = await pool.execute(
      `SELECT id, meta_media_id, filename, mime_type, file_size, phone_number_id, created_at
       FROM media_files WHERE client_id = ?
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [req.client.id, parseInt(limit), parseInt(offset)]
    );

    const [countRows] = await pool.execute(
      'SELECT COUNT(*) as total FROM media_files WHERE client_id = ?',
      [req.client.id]
    );

    res.json({
      success: true,
      data: rows,
      pagination: {
        total: countRows[0].total,
        page:  parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(countRows[0].total / limit),
      },
    });
  } catch (err) {
    console.error('GET media error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/media/upload — upload to Meta + store record
router.post('/upload', verifyClient, upload.single('file'), async (req, res) => {
  if (!req.file)
    return res.status(400).json({ success: false, message: 'File required (field name: file)' });

  const { phone_number_id } = req.body;
  if (!phone_number_id)
    return res.status(400).json({ success: false, message: 'phone_number_id required' });

  const filePath = req.file.path;

  try {
    const [phoneRows] = await pool.execute(
      'SELECT * FROM phone_numbers WHERE id = ? AND client_id = ? AND status = "active"',
      [phone_number_id, req.client.id]
    );
    if (!phoneRows.length)
      return res.status(404).json({ success: false, message: 'Phone number not found' });

    const phone = phoneRows[0];
    const mime  = req.file.mimetype;
    const mediaType = ALLOWED_MIME[mime];
    if (!mediaType)
      return res.status(400).json({ success: false, message: `Unsupported file type: ${mime}` });

    const accessToken = decrypt(phone.access_token);
    const fileBuffer  = fs.readFileSync(filePath);
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', mime);
    form.append('file', new Blob([fileBuffer], { type: mime }), req.file.originalname);

    const metaRes = await fetch(
      `https://graph.facebook.com/${META_API}/${phone.phone_number_id}/media`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      }
    );
    if (!metaRes.ok) {
      const errBody = await metaRes.json().catch(() => ({}));
      throw new Error(errBody?.error?.message || `Meta upload failed (${metaRes.status})`);
    }
    const metaData = await metaRes.json();

    const metaMediaId = metaData?.id;

    const [result] = await pool.execute(
      `INSERT INTO media_files
         (client_id, phone_number_id, meta_media_id, filename, mime_type, file_size, storage_path)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.client.id,
        phone_number_id,
        metaMediaId,
        req.file.originalname,
        mime,
        req.file.size,
        filePath,
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Media uploaded',
      data: {
        id: result.insertId,
        meta_media_id: metaMediaId,
        media_type: mediaType,
        filename: req.file.originalname,
        mime_type: mime,
      },
    });
  } catch (err) {
    console.error('Media upload error:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      message: 'Media upload failed',
      detail: err.response?.data?.error?.message || err.message,
    });
  } finally {
    fs.unlink(filePath, () => {});
  }
});

// GET /api/media/:id/url — fetch temporary URL from Meta
router.get('/:id/url', verifyClient, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT mf.*, pn.access_token, pn.phone_number_id
       FROM media_files mf
       JOIN phone_numbers pn ON mf.phone_number_id = pn.id
       WHERE mf.id = ? AND mf.client_id = ?`,
      [req.params.id, req.client.id]
    );
    if (!rows.length)
      return res.status(404).json({ success: false, message: 'Media not found' });

    const media = rows[0];
    if (!media.meta_media_id)
      return res.status(400).json({ success: false, message: 'No Meta media ID stored' });

    const accessToken = decrypt(media.access_token);
    const metaRes = await axios.get(
      `https://graph.facebook.com/${META_API}/${media.meta_media_id}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    res.json({
      success: true,
      data: {
        url: metaRes.data?.url,
        mime_type: metaRes.data?.mime_type,
        file_size: metaRes.data?.file_size,
      },
    });
  } catch (err) {
    console.error('Media URL error:', err.response?.data || err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch media URL' });
  }
});

// DELETE /api/media/:id
router.delete('/:id', verifyClient, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT storage_path FROM media_files WHERE id = ? AND client_id = ?',
      [req.params.id, req.client.id]
    );
    if (!rows.length)
      return res.status(404).json({ success: false, message: 'Media not found' });

    await pool.execute(
      'DELETE FROM media_files WHERE id = ? AND client_id = ?',
      [req.params.id, req.client.id]
    );

    if (rows[0].storage_path && fs.existsSync(rows[0].storage_path))
      fs.unlink(rows[0].storage_path, () => {});

    res.json({ success: true, message: 'Media deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
