const { pool } = require('../config/database');

// ─── AUDIT LOG MIDDLEWARE ─────────────────────────────────────────────────────
// Logs every admin/reseller action: who, what, when, IP → audit_logs table
//
// Usage in routes:
//   router.patch('/clients/:id/plan', verifyAdmin, auditLog('update_client_plan'), ...)
//
// Table expected:
//   CREATE TABLE audit_logs (
//     id         INT AUTO_INCREMENT PRIMARY KEY,
//     actor_id   INT NOT NULL,
//     actor_type ENUM('admin','reseller') NOT NULL,
//     action     VARCHAR(100) NOT NULL,
//     target     VARCHAR(255),
//     payload    JSON,
//     ip         VARCHAR(45),
//     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//   );

const auditLog = (action) => async (req, res, next) => {
  // Capture original res.json so we can log after response
  const originalJson = res.json.bind(res);

  res.json = async (body) => {
    // Only log successful actions (2xx)
    if (res.statusCode >= 200 && res.statusCode < 300) {
      try {
        const actorId   = req.admin?.id || req.reseller?.id || null;
        const actorType = req.admin ? 'admin' : req.reseller ? 'reseller' : null;

        if (actorId && actorType) {
          const target = req.params?.id
            ? `${req.baseUrl}/${req.params.id}`
            : req.baseUrl + req.path;

          // Strip sensitive fields from logged payload
          const safeBody = { ...req.body };
          delete safeBody.password;
          delete safeBody.access_token;
          delete safeBody.secret;

          await pool.execute(
            `INSERT INTO audit_logs (actor_id, actor_type, action, target, payload, ip)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              actorId,
              actorType,
              action,
              target,
              JSON.stringify(safeBody),
              req.ip || req.headers['x-forwarded-for'] || null,
            ]
          );
        }
      } catch (err) {
        // Never block the response due to audit failure
        console.error('⚠️ Audit log failed:', err.message);
      }
    }

    return originalJson(body);
  };

  next();
};

// ─── QUERY HELPER — get audit logs ───────────────────────────────────────────
// Used by admin routes to display audit history

const getAuditLogs = async ({ actorId, actorType, action, limit = 50, offset = 0 }) => {
  let where  = 'WHERE 1=1';
  let params = [];

  if (actorId)   { where += ' AND actor_id = ?';   params.push(actorId); }
  if (actorType) { where += ' AND actor_type = ?';  params.push(actorType); }
  if (action)    { where += ' AND action LIKE ?';   params.push(`%${action}%`); }

  const [rows] = await pool.execute(
    `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, parseInt(limit), parseInt(offset)]
  );
  return rows;
};

module.exports = { auditLog, getAuditLogs };