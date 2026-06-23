const express  = require('express');
const router   = express.Router();
const { verifyAdmin } = require('../middleware/auth');
const { getAuditLogs } = require('../middleware/auditLog');

// GET /api/audit — admin audit trail
router.get('/', verifyAdmin, async (req, res) => {
  try {
    const { actor_id, actor_type, action, limit = 50, offset = 0 } = req.query;

    const rows = await getAuditLogs({
      actorId:   actor_id ? parseInt(actor_id) : undefined,
      actorType: actor_type,
      action,
      limit:     parseInt(limit),
      offset:    parseInt(offset),
    });

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET audit logs error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
