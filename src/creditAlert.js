const nodemailer = require('nodemailer');
const { pool }   = require('../config/database');

// ─── LOW CREDIT ALERT ─────────────────────────────────────────────────────────
// Call after every credit deduction.
// If balance drops below threshold → emit socket event + send email.

const LOW_CREDIT_THRESHOLD = parseInt(process.env.LOW_CREDIT_THRESHOLD) || 50;

// Nodemailer transporter — configure SMTP in .env
const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sendLowCreditEmail = async (client, balance) => {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    console.warn('⚠️ SMTP not configured — skipping low credit email');
    return;
  }

  try {
    await transporter.sendMail({
      from:    `"${process.env.PLATFORM_NAME || 'Artwa'}" <${process.env.SMTP_USER}>`,
      to:      client.email,
      subject: '⚠️ Low Credit Balance Alert',
      html: `
        <h2>Low Credit Balance</h2>
        <p>Hi ${client.name},</p>
        <p>Your Artwa credit balance has dropped to <strong>${balance}</strong> credits.</p>
        <p>Please top up to continue sending messages without interruption.</p>
        <p>
          <a href="${process.env.FRONTEND_URL}/credits/topup"
             style="background:#1D9E75;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;">
            Top Up Credits
          </a>
        </p>
        <p style="color:#888;font-size:12px;">
          This alert was triggered because your balance fell below ${LOW_CREDIT_THRESHOLD} credits.
        </p>
      `,
    });
    console.log(`📧 Low credit email sent to ${client.email}`);
  } catch (err) {
    console.error('❌ Low credit email failed:', err.message);
  }
};

/**
 * checkAndAlertLowCredits — call after any deduction
 * @param {number} clientId
 * @param {object} io — Socket.IO instance (from app.get('io'))
 */
const checkAndAlertLowCredits = async (clientId, io) => {
  try {
    const [balanceRows] = await pool.execute(
      'SELECT balance FROM client_credits WHERE client_id = ?', [clientId]
    );
    if (!balanceRows.length) return;

    const balance = parseFloat(balanceRows[0].balance);
    if (balance >= LOW_CREDIT_THRESHOLD) return; // All good

    // Check if we already alerted in last 1 hour — avoid spam
    const [recentAlert] = await pool.execute(
      `SELECT id FROM credit_alert_log
       WHERE client_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
       LIMIT 1`,
      [clientId]
    );
    if (recentAlert.length) return; // Already alerted recently

    // Fetch client details for email
    const [clientRows] = await pool.execute(
      'SELECT id, name, email FROM clients WHERE id = ?', [clientId]
    );
    if (!clientRows.length) return;

    const client = clientRows[0];

    // 1. Socket event → frontend shows toast/banner
    if (io) {
      io.to(`client_${clientId}`).emit('low_credit_alert', {
        balance,
        threshold: LOW_CREDIT_THRESHOLD,
        message:   `Your credit balance is low (${balance} credits remaining). Please top up.`,
      });
    }

    // 2. Email
    await sendLowCreditEmail(client, balance);

    // 3. Log alert so we don't spam
    await pool.execute(
      `INSERT INTO credit_alert_log (client_id, balance_at_alert) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE created_at = NOW(), balance_at_alert = ?`,
      [clientId, balance, balance]
    );

    console.log(`🔔 Low credit alert triggered for client #${clientId} (balance: ${balance})`);

  } catch (err) {
    console.error('❌ checkAndAlertLowCredits error:', err.message);
  }
};

module.exports = { checkAndAlertLowCredits };