const { pool } = require('../config/database');

/**
 * Checks if the client has exceeded their plan's monthly message limit.
 * Apply to /api/messages/send and /api/broadcast
 */
const checkMessageLimit = async (req, res, next) => {
  try {
    const client = req.client;

    // No limit set on plan — unlimited
    if (!client.message_limit) return next();

    const [rows] = await pool.execute(
      `SELECT COUNT(*) as sent
       FROM messages
       WHERE client_id = ?
         AND direction = 'outbound'
         AND MONTH(created_at) = MONTH(NOW())
         AND YEAR(created_at)  = YEAR(NOW())`,
      [client.id]
    );

    if (rows[0].sent >= client.message_limit) {
      return res.status(429).json({
        success: false,
        message: `Monthly message limit of ${client.message_limit} reached. Please upgrade your plan.`,
      });
    }

    next();
  } catch (err) {
    console.error('checkMessageLimit error:', err);
    next(); // fail open — don't block on counting errors
  }
};

module.exports = { checkMessageLimit };
