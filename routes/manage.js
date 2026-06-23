const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const axios    = require('axios');
const { pool } = require('../config/database');
const { encrypt, decrypt } = require('../config/encryption');
const { verifyAdmin, verifyClient, verifyReseller } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');
const { auditLog } = require('../middleware/auditLog');

const META_API = process.env.META_API_VERSION || 'v25.0';

// Naya middleware — sirf is route ke liye
function allowInternalCronOrAdmin(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');

  if (process.env.INTERNAL_CRON_TOKEN && token === process.env.INTERNAL_CRON_TOKEN) {
    req.isInternalCron = true;
    return next();
  }

  return verifyAdmin(req, res, next);
}
// ─── ADMIN — CREATE CLIENT ────────────────────────────────────────────────────

router.post('/clients', verifyAdmin, auditLog('create_client'), validate(schemas.createClient), async (req, res) => {
  try {
    const { name, business_name, email, phone, plan_id, reseller_id, send_invite = true } = req.body;

    const [existing] = await pool.execute('SELECT id FROM clients WHERE email = ?', [email]);
    if (existing.length)
      return res.status(400).json({ success: false, message: 'Email already registered' });

    const [result] = await pool.execute(
      `INSERT INTO clients (name, business_name, email, phone, plan_id, reseller_id, status, password)
       VALUES (?, ?, ?, ?, ?, ?, 'invited', '')`,
      [name, business_name || null, email, phone || null, plan_id || null, reseller_id || null]
    );

    const clientId = result.insertId;

    await pool.execute('INSERT INTO client_credits (client_id, balance) VALUES (?, 0)', [clientId]);
    await pool.execute('INSERT INTO client_settings (client_id) VALUES (?)', [clientId]);

    let inviteUrl = null;
    if (send_invite) {
      const inviteToken = jwt.sign(
        { client_id: clientId, email, type: 'invite' },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      inviteUrl = `${process.env.FRONTEND_URL}/invite?token=${inviteToken}`;
    }

    res.status(201).json({
      success: true,
      message: send_invite ? 'Client created and invite link generated' : 'Client created',
      data: { id: clientId, invite_url: inviteUrl },
    });
  } catch (err) {
    console.error('Create client error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Resend invite link
router.post('/clients/:id/resend-invite', verifyAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, email FROM clients WHERE id = ? AND status = "invited"',
      [req.params.id]
    );
    if (!rows.length)
      return res.status(404).json({ success: false, message: 'Client not found or already activated' });

    const { id, email } = rows[0];
    const inviteToken = jwt.sign(
      { client_id: id, email, type: 'invite' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ success: true, data: { invite_url: `${process.env.FRONTEND_URL}/invite?token=${inviteToken}` } });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── ADMIN — LIST / UPDATE CLIENTS ───────────────────────────────────────────

router.get('/clients', verifyAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const offset = (page - 1) * limit;

    let where  = 'WHERE 1=1';
    let params = [];

    if (status) { where += ' AND c.status = ?'; params.push(status); }
    if (search) {
      where += ' AND (c.name LIKE ? OR c.email LIKE ? OR c.business_name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const [clients] = await pool.execute(
      `SELECT c.id, c.name, c.email, c.business_name, c.phone,
              c.status, c.trial_ends_at, c.last_login, c.created_at,
              p.name as plan_name, cc.balance as credit_balance,
              r.name as reseller_name
       FROM clients c
       LEFT JOIN plans p ON c.plan_id = p.id
       LEFT JOIN client_credits cc ON cc.client_id = c.id
       LEFT JOIN resellers r ON c.reseller_id = r.id
       ${where}
       ORDER BY c.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    const [countRows] = await pool.execute(
      `SELECT COUNT(*) as total FROM clients c ${where}`, params
    );

    res.json({
      success: true,
      data: clients,
      pagination: {
        total: countRows[0].total,
        page:  parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(countRows[0].total / limit),
      },
    });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.patch('/clients/:id/status', verifyAdmin, auditLog('update_client_status'), async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['active', 'suspended', 'trial', 'inactive'];
    if (!valid.includes(status))
      return res.status(400).json({ success: false, message: 'Invalid status' });

    await pool.execute('UPDATE clients SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ success: true, message: `Client ${status}` });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.patch('/clients/:id/plan', verifyAdmin, auditLog('update_client_plan'), validate(schemas.assignPlan), async (req, res) => {
  try {
    const { plan_id } = req.body;
    await pool.execute(
      'UPDATE clients SET plan_id = ?, status = "active" WHERE id = ?',
      [plan_id, req.params.id]
    );
    res.json({ success: true, message: 'Plan updated' });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── ADMIN — RESELLERS ────────────────────────────────────────────────────────

router.post('/resellers', verifyAdmin, auditLog('create_reseller'), validate(schemas.createReseller), async (req, res) => {
  try {
    const { name, email, password, markup_percent = 20 } = req.body;

    const [existing] = await pool.execute('SELECT id FROM resellers WHERE email = ?', [email]);
    if (existing.length)
      return res.status(400).json({ success: false, message: 'Email already registered' });

    const hashed  = await bcrypt.hash(password, 12);
    const [result] = await pool.execute(
      'INSERT INTO resellers (name, email, password, markup_percent, status) VALUES (?, ?, ?, ?, "active")',
      [name, email, hashed, markup_percent]
    );

    res.status(201).json({ success: true, message: 'Reseller created', data: { id: result.insertId } });
  } catch (err) {
    console.error('Create reseller error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/resellers', verifyAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT r.id, r.name, r.email, r.status, r.credit_balance, r.markup_percent,
              COUNT(c.id) as client_count
       FROM resellers r
       LEFT JOIN clients c ON c.reseller_id = r.id
       GROUP BY r.id
       ORDER BY r.created_at DESC`
    );
    res.json({ success: true, data: rows });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── ADMIN — PLANS ────────────────────────────────────────────────────────────

router.get('/plans', verifyAdmin, async (req, res) => {
  try {
    const [plans] = await pool.execute('SELECT * FROM plans ORDER BY price ASC');
    res.json({ success: true, data: plans });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/plans', verifyAdmin, async (req, res) => {
  try {
    const {
      name, price, message_limit, agent_limit,
      api_access = 0, chatbot_access = 0, broadcast_access = 0,
    } = req.body;

    if (!name || price === undefined)
      return res.status(400).json({ success: false, message: 'name and price required' });

    const [result] = await pool.execute(
      `INSERT INTO plans (name, price, message_limit, agent_limit, api_access, chatbot_access, broadcast_access)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, price, message_limit || null, agent_limit || null, api_access, chatbot_access, broadcast_access]
    );

    res.status(201).json({ success: true, message: 'Plan created', data: { id: result.insertId } });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.patch('/plans/:id', verifyAdmin, async (req, res) => {
  try {
    const { name, price, message_limit, agent_limit, api_access, chatbot_access, broadcast_access } = req.body;
    await pool.execute(
      `UPDATE plans SET name=?, price=?, message_limit=?, agent_limit=?,
       api_access=?, chatbot_access=?, broadcast_access=? WHERE id=?`,
      [name, price, message_limit, agent_limit, api_access, chatbot_access, broadcast_access, req.params.id]
    );
    res.json({ success: true, message: 'Plan updated' });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/plans/:id', verifyAdmin, async (req, res) => {
  try {
    await pool.execute('DELETE FROM plans WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Plan deleted' });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── ADMIN — CREDITS ──────────────────────────────────────────────────────────

router.post('/clients/:id/credits/topup', verifyAdmin, auditLog('add_credits'), validate(schemas.topupCredits), async (req, res) => {
  try {
    const { amount, note } = req.body;

    await pool.execute(
      'UPDATE client_credits SET balance = balance + ? WHERE client_id = ?',
      [amount, req.params.id]
    );
    await pool.execute(
      `INSERT INTO credit_transactions (client_id, type, amount, description)
       VALUES (?, 'topup', ?, ?)`,
      [req.params.id, amount, note || 'Admin top-up']
    );

    const [rows] = await pool.execute(
      'SELECT balance FROM client_credits WHERE client_id = ?', [req.params.id]
    );
    res.json({ success: true, message: 'Credits added', new_balance: rows[0]?.balance });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/clients/:id/credits', verifyAdmin, async (req, res) => {
  try {
    const [balance] = await pool.execute(
      'SELECT balance FROM client_credits WHERE client_id = ?', [req.params.id]
    );
    const [txns] = await pool.execute(
      'SELECT * FROM credit_transactions WHERE client_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.params.id]
    );
    res.json({ success: true, data: { balance: balance[0]?.balance || 0, transactions: txns } });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── RESELLER — CLIENTS ───────────────────────────────────────────────────────

router.post('/reseller/clients', verifyReseller, auditLog('reseller_create_client'), validate(schemas.createClient), async (req, res) => {
  try {
    const { name, business_name, email, phone, plan_id } = req.body;

    const [existing] = await pool.execute('SELECT id FROM clients WHERE email = ?', [email]);
    if (existing.length)
      return res.status(400).json({ success: false, message: 'Email already registered' });

    const [result] = await pool.execute(
      `INSERT INTO clients (name, business_name, email, phone, plan_id, reseller_id, status, password)
       VALUES (?, ?, ?, ?, ?, ?, 'invited', '')`,
      [name, business_name || null, email, phone || null, plan_id || null, req.reseller.id]
    );

    const clientId = result.insertId;
    await pool.execute('INSERT INTO client_credits (client_id, balance) VALUES (?, 0)', [clientId]);
    await pool.execute('INSERT INTO client_settings (client_id) VALUES (?)', [clientId]);

    const inviteToken = jwt.sign(
      { client_id: clientId, email, type: 'invite' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'Client created',
      data: { id: clientId, invite_url: `${process.env.FRONTEND_URL}/invite?token=${inviteToken}` },
    });
  } catch (err) {
    console.error('Reseller create client error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/reseller/clients', verifyReseller, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT c.id, c.name, c.email, c.business_name, c.status, c.created_at,
              p.name as plan_name, cc.balance as credit_balance
       FROM clients c
       LEFT JOIN plans p ON c.plan_id = p.id
       LEFT JOIN client_credits cc ON cc.client_id = c.id
       WHERE c.reseller_id = ?
       ORDER BY c.created_at DESC`,
      [req.reseller.id]
    );
    res.json({ success: true, data: rows });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/reseller/clients/:id/credits/topup', verifyReseller, auditLog('reseller_add_credits'), validate(schemas.topupCredits), async (req, res) => {
  try {
    const { amount } = req.body;

    const [clientRows] = await pool.execute(
      'SELECT id FROM clients WHERE id = ? AND reseller_id = ?',
      [req.params.id, req.reseller.id]
    );
    if (!clientRows.length)
      return res.status(404).json({ success: false, message: 'Client not found' });

    if (req.reseller.credit_balance < amount)
      return res.status(400).json({ success: false, message: 'Insufficient reseller credit balance' });

    await pool.execute(
      'UPDATE resellers SET credit_balance = credit_balance - ? WHERE id = ?',
      [amount, req.reseller.id]
    );
    await pool.execute(
      'UPDATE client_credits SET balance = balance + ? WHERE client_id = ?',
      [amount, req.params.id]
    );
    await pool.execute(
      `INSERT INTO credit_transactions (client_id, type, amount, description)
       VALUES (?, 'topup', ?, ?)`,
      [req.params.id, amount, `Reseller top-up from reseller #${req.reseller.id}`]
    );

    res.json({ success: true, message: 'Credits transferred to client' });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── CLIENT — WHATSAPP BUSINESS PROFILE ───────────────────────────────────────

router.get('/profile', verifyClient, async (req, res) => {
  try {
    const phoneId = parseInt(req.query.phone_number_id, 10);
    if (!phoneId)
      return res.status(400).json({ success: false, message: 'phone_number_id query param required' });

    const [rows] = await pool.execute(
      'SELECT * FROM phone_numbers WHERE id = ? AND client_id = ? AND status = "active"',
      [phoneId, req.client.id]
    );
    if (!rows.length)
      return res.status(404).json({ success: false, message: 'Phone number not found' });

    const phone = rows[0];
    const accessToken = decrypt(phone.access_token);
    const metaRes = await axios.get(
      `https://graph.facebook.com/${META_API}/${phone.phone_number_id}/whatsapp_business_profile`,
      {
        params: { fields: 'about,address,description,email,profile_picture_url,vertical,websites' },
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    const profile = metaRes.data?.data?.[0] || metaRes.data || {};
    res.json({
      success: true,
      data: {
        phone_number_id: phone.id,
        display_phone: phone.phone_number,
        quality_rating: phone.quality_rating,
        ...profile,
      },
    });
  } catch (err) {
    console.error('GET profile error:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      message: err.response?.data?.error?.message || 'Failed to fetch business profile',
    });
  }
});

router.patch('/profile', verifyClient, validate(schemas.updateBusinessProfile), async (req, res) => {
  try {
    const {
      phone_number_id, about, address, description, email, vertical, websites,
    } = req.body;

    const [rows] = await pool.execute(
      'SELECT * FROM phone_numbers WHERE id = ? AND client_id = ? AND status = "active"',
      [phone_number_id, req.client.id]
    );
    if (!rows.length)
      return res.status(404).json({ success: false, message: 'Phone number not found' });

    const phone = rows[0];
    const accessToken = decrypt(phone.access_token);

    const payload = { messaging_product: 'whatsapp' };
    if (about !== undefined) payload.about = about;
    if (address !== undefined) payload.address = address;
    if (description !== undefined) payload.description = description;
    if (email !== undefined) payload.email = email;
    if (vertical !== undefined) payload.vertical = vertical;
    if (websites !== undefined) payload.websites = websites;

    await axios.post(
      `https://graph.facebook.com/${META_API}/${phone.phone_number_id}/whatsapp_business_profile`,
      payload,
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );

    if (about || description) {
      await pool.execute(
        'UPDATE phone_numbers SET display_name = COALESCE(?, display_name), updated_at = NOW() WHERE id = ?',
        [about || null, phone.id]
      );
    }

    res.json({ success: true, message: 'Business profile updated on WhatsApp' });
  } catch (err) {
    console.error('PATCH profile error:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      message: err.response?.data?.error?.message || 'Failed to update business profile',
    });
  }
});

// ─── CLIENT — WABA EMBEDDED SIGNUP ────────────────────────────────────────────

router.get('/embedded-signup/config', verifyClient, (req, res) => {
  const appId = process.env.META_APP_ID;
  const configId = process.env.EMBEDDED_SIGNUP_CONFIG_ID;

  if (!appId || !configId) {
    return res.status(503).json({
      success: false,
      message: 'Embedded Signup is not configured. Set META_APP_ID and EMBEDDED_SIGNUP_CONFIG_ID in server .env',
    });
  }

  res.json({
    success: true,
    data: { app_id: appId, config_id: configId },
  });
});

router.post('/embedded-signup/complete', verifyClient, validate(schemas.embeddedSignupComplete), async (req, res) => {
  try {
    const { code, waba_id, phone_number_id, phone_number, display_name } = req.body;

    const [existing] = await pool.execute(
      'SELECT id FROM phone_numbers WHERE phone_number_id = ?',
      [phone_number_id]
    );
    if (existing.length)
      return res.status(400).json({ success: false, message: 'This WhatsApp number is already connected' });

    const appId = process.env.META_APP_ID;
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (!appId || !appSecret)
      return res.status(503).json({ success: false, message: 'Meta app credentials not configured' });

    const tokenRes = await axios.get(
      `https://graph.facebook.com/${META_API}/oauth/access_token`,
      {
        params: {
          client_id: appId,
          client_secret: appSecret,
          code,
        },
      }
    );

    const accessToken = tokenRes.data?.access_token;
    if (!accessToken)
      return res.status(400).json({ success: false, message: 'Failed to exchange signup code for access token' });

    const encryptedToken = encrypt(accessToken);
    const [result] = await pool.execute(
      `INSERT INTO phone_numbers
         (client_id, phone_number, phone_number_id, access_token, display_name, waba_id, status)
       VALUES (?, ?, ?, ?, ?, ?, 'active')`,
      [
        req.client.id,
        phone_number.replace(/\D/g, ''),
        phone_number_id,
        encryptedToken,
        display_name || null,
        waba_id,
      ]
    );

    res.status(201).json({
      success: true,
      message: 'WhatsApp Business Account connected via Embedded Signup',
      data: { id: result.insertId, phone_number_id, waba_id },
    });
  } catch (err) {
    console.error('Embedded signup error:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      message: err.response?.data?.error?.message || 'Embedded signup failed',
    });
  }
});

// ─── CLIENT — PHONE NUMBERS ───────────────────────────────────────────────────

router.get('/phone-numbers', verifyClient, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, phone_number, phone_number_id, display_name, status,
              quality_rating, messaging_limit_tier, waba_id, created_at
       FROM phone_numbers WHERE client_id = ?`,
      [req.client.id]
    );
    res.json({ success: true, data: rows });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/phone-numbers', verifyClient, validate(schemas.addPhoneNumber), async (req, res) => {
  try {
    const { phone_number, phone_number_id, access_token, display_name, waba_id } = req.body;

    const [existing] = await pool.execute(
      'SELECT id FROM phone_numbers WHERE phone_number_id = ?', [phone_number_id]
    );
    if (existing.length)
      return res.status(400).json({ success: false, message: 'Phone number already connected' });

    const encryptedToken = encrypt(access_token);

    const [result] = await pool.execute(
      `INSERT INTO phone_numbers
         (client_id, phone_number, phone_number_id, access_token, display_name, waba_id, status)
       VALUES (?, ?, ?, ?, ?, ?, 'active')`,
      [req.client.id, phone_number, phone_number_id, encryptedToken, display_name || null, waba_id || null]
    );

    res.status(201).json({ success: true, message: 'Phone number connected', data: { id: result.insertId } });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.patch('/phone-numbers/:id', verifyClient, async (req, res) => {
  try {
    const { access_token, display_name, status } = req.body;
    const encryptedToken = access_token ? encrypt(access_token) : null;

    await pool.execute(
      `UPDATE phone_numbers
       SET access_token  = COALESCE(?, access_token),
           display_name  = COALESCE(?, display_name),
           status        = COALESCE(?, status)
       WHERE id = ? AND client_id = ?`,
      [encryptedToken, display_name || null, status || null, req.params.id, req.client.id]
    );

    res.json({ success: true, message: 'Phone number updated' });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/phone-numbers/:id', verifyClient, async (req, res) => {
  try {
    await pool.execute(
      'UPDATE phone_numbers SET status = "inactive" WHERE id = ? AND client_id = ?',
      [req.params.id, req.client.id]
    );
    res.json({ success: true, message: 'Phone number disconnected' });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── CLIENT — WEBHOOKS ────────────────────────────────────────────────────────

router.get('/webhooks', verifyClient, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, url, events, status, last_triggered, failure_count, created_at FROM client_webhooks WHERE client_id = ?',
      [req.client.id]
    );
    res.json({ success: true, data: rows });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/webhooks', verifyClient, async (req, res) => {
  try {
    const { url, events = ['*'], secret } = req.body;
    if (!url) return res.status(400).json({ success: false, message: 'url required' });

    const webhookSecret = secret || crypto.randomBytes(16).toString('hex');
    const [result] = await pool.execute(
      `INSERT INTO client_webhooks (client_id, url, events, secret, status)
       VALUES (?, ?, ?, ?, 'active')`,
      [req.client.id, url, JSON.stringify(events), webhookSecret]
    );

    res.status(201).json({
      success: true,
      message: 'Webhook created',
      data: { id: result.insertId, secret: webhookSecret },
    });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.patch('/webhooks/:id/status', verifyClient, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'inactive'].includes(status))
      return res.status(400).json({ success: false, message: 'Invalid status' });

    await pool.execute(
      'UPDATE client_webhooks SET status = ? WHERE id = ? AND client_id = ?',
      [status, req.params.id, req.client.id]
    );
    res.json({ success: true, message: `Webhook ${status}` });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/webhooks/:id', verifyClient, async (req, res) => {
  try {
    await pool.execute(
      'DELETE FROM client_webhooks WHERE id = ? AND client_id = ?',
      [req.params.id, req.client.id]
    );
    res.json({ success: true, message: 'Webhook deleted' });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── CLIENT — AGENTS ──────────────────────────────────────────────────────────

router.get('/agents', verifyClient, async (req, res) => {
  try {
    const [agents] = await pool.execute(
      'SELECT id, name, email, role, status, last_login, created_at FROM agents WHERE client_id = ?',
      [req.client.id]
    );
    res.json({ success: true, data: agents });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/agents', verifyClient, async (req, res) => {
  try {
    const { name, email, password, role = 'agent' } = req.body;
    if (!name || !email || !password || password.length < 8)
      return res.status(400).json({ success: false, message: 'name, email and password (min 8 chars) required' });

    if (req.client.agent_limit) {
      const [countRows] = await pool.execute(
        'SELECT COUNT(*) as cnt FROM agents WHERE client_id = ? AND status != "inactive"',
        [req.client.id]
      );
      if (countRows[0].cnt >= req.client.agent_limit)
        return res.status(403).json({
          success: false,
          message: `Agent limit of ${req.client.agent_limit} reached. Upgrade your plan to add more agents.`,
        });
    }

    const [existing] = await pool.execute('SELECT id FROM agents WHERE email = ?', [email]);
    if (existing.length)
      return res.status(400).json({ success: false, message: 'Email already in use' });

    const hashed  = await bcrypt.hash(password, 12);
    const [result] = await pool.execute(
      'INSERT INTO agents (client_id, name, email, password, role) VALUES (?, ?, ?, ?, ?)',
      [req.client.id, name, email, hashed, role]
    );

    res.status(201).json({ success: true, message: 'Agent created', data: { id: result.insertId } });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/agents/:id', verifyClient, async (req, res) => {
  try {
    await pool.execute(
      'UPDATE agents SET status = "inactive" WHERE id = ? AND client_id = ?',
      [req.params.id, req.client.id]
    );
    res.json({ success: true, message: 'Agent deactivated' });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── CLIENT — TEMPLATES ───────────────────────────────────────────────────────

router.get('/templates', verifyClient, async (req, res) => {
  try {
    const [templates] = await pool.execute(
      'SELECT * FROM templates WHERE client_id = ? ORDER BY created_at DESC',
      [req.client.id]
    );
    res.json({ success: true, data: templates });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/templates', verifyClient, validate(schemas.createTemplate), async (req, res) => {
  try {
    const { name, category, language, components } = req.body;

    const [result] = await pool.execute(
      `INSERT INTO templates (client_id, name, category, language, components, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [req.client.id, name, category.toUpperCase(), language || 'en_US', JSON.stringify(components)]
    );

    res.status(201).json({
      success: true,
      message: 'Template saved. Submit to Meta for approval.',
      data: { id: result.insertId },
    });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/templates/:id/submit', verifyClient, async (req, res) => {
  try {
    const { waba_id } = req.body;
    const axios = require('axios');

    const [rows] = await pool.execute(
      'SELECT * FROM templates WHERE id = ? AND client_id = ?',
      [req.params.id, req.client.id]
    );
    if (!rows.length)
      return res.status(404).json({ success: false, message: 'Template not found' });

    const t      = rows[0];
    const wabaId = waba_id || req.client.waba_id;
    if (!wabaId)
      return res.status(400).json({ success: false, message: 'waba_id required' });

    const [phoneRows] = await pool.execute(
      'SELECT access_token FROM phone_numbers WHERE client_id = ? AND status = "active" LIMIT 1',
      [req.client.id]
    );
    if (!phoneRows.length)
      return res.status(400).json({ success: false, message: 'No active phone number found' });

    const accessToken = decrypt(phoneRows[0].access_token);
    const components  = typeof t.components === 'string' ? JSON.parse(t.components) : t.components;

    const metaRes = await axios.post(
      `https://graph.facebook.com/v20.0/${wabaId}/message_templates`,
      { name: t.name, category: t.category, language: t.language, components },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );

    await pool.execute(
      'UPDATE templates SET status = "pending_meta", meta_template_id = ? WHERE id = ?',
      [metaRes.data?.id || null, t.id]
    );

    res.json({ success: true, message: 'Template submitted to Meta for approval', meta_id: metaRes.data?.id });
  } catch (err) {
    const metaErr = err.response?.data?.error?.message || err.message;
    console.error('Template submit error:', metaErr);
    res.status(500).json({ success: false, message: 'Meta API error', detail: metaErr });
  }
});

router.post('/templates/meta-status', async (req, res) => {
  try {
    res.sendStatus(200);
    const { entry } = req.body;
    for (const e of (entry || [])) {
      for (const change of (e.changes || [])) {
        if (change.field !== 'message_template_status_update') continue;
        const { message_template_id, event } = change.value;
        const statusMap = { APPROVED: 'approved', REJECTED: 'rejected', DISABLED: 'disabled', PAUSED: 'paused' };
        const newStatus = statusMap[event];
        if (newStatus && message_template_id)
          await pool.execute('UPDATE templates SET status = ? WHERE meta_template_id = ?', [newStatus, String(message_template_id)]);
      }
    }
  } catch (err) {
    console.error('Template status callback error:', err);
  }
});

router.delete('/templates/:id', verifyClient, async (req, res) => {
  try {
    await pool.execute('DELETE FROM templates WHERE id = ? AND client_id = ?', [req.params.id, req.client.id]);
    res.json({ success: true, message: 'Template deleted' });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── CLIENT — API KEYS ────────────────────────────────────────────────────────

router.get('/api-keys', verifyClient, async (req, res) => {
  try {
    const [keys] = await pool.execute(
      `SELECT id, name, key_prefix, permissions, last_used_at, expires_at, created_at
       FROM api_keys WHERE client_id = ? AND status = 'active'`,
      [req.client.id]
    );
    res.json({ success: true, data: keys });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/api-keys', verifyClient, async (req, res) => {
  try {
    const { name, permissions = ['read', 'write'], expires_at } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name required' });

    const apiKey = 'ak_' + crypto.randomBytes(32).toString('hex');
    const prefix = apiKey.substring(0, 10) + '...';
    const hashed = crypto.createHash('sha256').update(apiKey).digest('hex');

    const [result] = await pool.execute(
      `INSERT INTO api_keys (client_id, name, api_key, key_prefix, permissions, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.client.id, name, hashed, prefix, JSON.stringify(permissions), expires_at || null]
    );

    res.status(201).json({
      success: true,
      message: 'API key created. Save it now — it will not be shown again.',
      data: { id: result.insertId, api_key: apiKey, key_prefix: prefix },
    });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/api-keys/:id', verifyClient, async (req, res) => {
  try {
    await pool.execute(
      'UPDATE api_keys SET status = "revoked" WHERE id = ? AND client_id = ?',
      [req.params.id, req.client.id]
    );
    res.json({ success: true, message: 'API key revoked' });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── CLIENT — CREDITS (read-only) ─────────────────────────────────────────────

router.get('/credits', verifyClient, async (req, res) => {
  try {
    const [balance] = await pool.execute(
      'SELECT balance FROM client_credits WHERE client_id = ?', [req.client.id]
    );
    const [txns] = await pool.execute(
      'SELECT type, amount, description, created_at FROM credit_transactions WHERE client_id = ? ORDER BY created_at DESC LIMIT 30',
      [req.client.id]
    );
    res.json({ success: true, data: { balance: balance[0]?.balance || 0, transactions: txns } });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


// ─── ADMIN — TEMPLATE SYNC FROM META ─────────────────────────────────────────
// POST /api/manage/templates/sync — manually trigger sync for a client
// GET  /api/manage/templates/sync-all — sync all clients (admin cron use)

router.post('/templates/sync', verifyClient, async (req, res) => {
  try {
    const axios = require('axios');

    // Get client's active phone number for access token
    const [phoneRows] = await pool.execute(
      'SELECT access_token, waba_id FROM phone_numbers WHERE client_id = ? AND status = "active" LIMIT 1',
      [req.client.id]
    );
    if (!phoneRows.length)
      return res.status(400).json({ success: false, message: 'No active phone number found' });

    const accessToken = decrypt(phoneRows[0].access_token);
    const wabaId      = phoneRows[0].waba_id || req.client.waba_id;
    if (!wabaId)
      return res.status(400).json({ success: false, message: 'waba_id not set on phone number' });

    // Fetch all templates from Meta
    const metaRes = await axios.get(
      `https://graph.facebook.com/v20.0/${wabaId}/message_templates?limit=100`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const metaTemplates = metaRes.data?.data || [];
    let synced = 0, updated = 0;

    const statusMap = {
      APPROVED:  'approved',
      REJECTED:  'rejected',
      PENDING:   'pending_meta',
      PAUSED:    'paused',
      DISABLED:  'disabled',
      IN_APPEAL: 'pending_meta',
    };

    for (const mt of metaTemplates) {
      const newStatus = statusMap[mt.status] || 'pending';

      // Try to match by meta_template_id or by name+language
      const [existing] = await pool.execute(
        `SELECT id, status FROM templates
         WHERE client_id = ? AND (meta_template_id = ? OR (name = ? AND language = ?))
         LIMIT 1`,
        [req.client.id, String(mt.id), mt.name, mt.language]
      );

      if (existing.length) {
        if (existing[0].status !== newStatus) {
          await pool.execute(
            `UPDATE templates
             SET status = ?, meta_template_id = ?, last_synced_at = NOW()
             WHERE id = ?`,
            [newStatus, String(mt.id), existing[0].id]
          );
          updated++;
        } else {
          await pool.execute(
            'UPDATE templates SET last_synced_at = NOW() WHERE id = ?',
            [existing[0].id]
          );
        }
        synced++;
      }
    }

    res.json({
      success: true,
      message: `Sync complete — ${synced} templates checked, ${updated} status updates`,
      data: { synced, updated, total_meta: metaTemplates.length },
    });

  } catch (err) {
    const metaErr = err.response?.data?.error?.message || err.message;
    console.error('Template sync error:', metaErr);
    res.status(500).json({ success: false, message: 'Meta API error', detail: metaErr });
  }
});

// Admin-triggered sync for ALL clients — used by cron
router.post('/templates/sync-all', allowInternalCronOrAdmin, async (req, res) => {
  try {
    const axios = require('axios');

    // Get all clients with active phone numbers
    const [clients] = await pool.execute(
      `SELECT DISTINCT c.id as client_id, pn.access_token, pn.waba_id
       FROM clients c
       JOIN phone_numbers pn ON pn.client_id = c.id
       WHERE pn.status = "active" AND c.status != "suspended"
       AND pn.waba_id IS NOT NULL`
    );

    let totalSynced = 0, totalUpdated = 0, errors = 0;

    for (const client of clients) {
      try {
        const accessToken = decrypt(client.access_token);

        const metaRes = await axios.get(
          `https://graph.facebook.com/v20.0/${client.waba_id}/message_templates?limit=100`,
          { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10000 }
        );

        const metaTemplates = metaRes.data?.data || [];
        const statusMap = {
          APPROVED: 'approved', REJECTED: 'rejected', PENDING: 'pending_meta',
          PAUSED: 'paused', DISABLED: 'disabled', IN_APPEAL: 'pending_meta',
        };

        for (const mt of metaTemplates) {
          const newStatus = statusMap[mt.status] || 'pending';
          const [existing] = await pool.execute(
            `SELECT id, status FROM templates
             WHERE client_id = ? AND (meta_template_id = ? OR (name = ? AND language = ?))
             LIMIT 1`,
            [client.client_id, String(mt.id), mt.name, mt.language]
          );

          if (existing.length) {
            await pool.execute(
              `UPDATE templates SET status = ?, meta_template_id = ?, last_synced_at = NOW()
               WHERE id = ?`,
              [newStatus, String(mt.id), existing[0].id]
            );
            if (existing[0].status !== newStatus) totalUpdated++;
            totalSynced++;
          }
        }
      } catch (clientErr) {
        console.error(`Template sync failed for client #${client.client_id}:`, clientErr.message);
        errors++;
      }
    }

    res.json({
      success: true,
      message: `Sync-all complete`,
      data: { clients_processed: clients.length, synced: totalSynced, updated: totalUpdated, errors },
    });

  } catch (err) {
    console.error('Sync-all error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


// ─── ADMIN — IMPERSONATE CLIENT ───────────────────────────────────────────────
// Returns a short-lived client JWT for support/debugging
// Token expires in 1 hour and is marked as impersonated

router.post('/clients/:id/impersonate', verifyAdmin, auditLog('impersonate_client'), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT c.id, c.email, c.name, c.status, p.name as plan_name
       FROM clients c
       LEFT JOIN plans p ON c.plan_id = p.id
       WHERE c.id = ?`,
      [req.params.id]
    );
    if (!rows.length)
      return res.status(404).json({ success: false, message: 'Client not found' });

    const client = rows[0];

    if (client.status === 'suspended')
      return res.status(403).json({ success: false, message: 'Cannot impersonate suspended client' });

    // Short-lived token — 1 hour, flagged as impersonated
    const token = jwt.sign(
      {
        id:            client.id,
        email:         client.email,
        type:          'client',
        impersonated:  true,
        impersonated_by: req.admin.id,
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.json({
      success: true,
      message: `Impersonation token for ${client.name} — expires in 1 hour`,
      data: {
        token,
        client: { id: client.id, name: client.name, email: client.email, plan: client.plan_name },
        expires_in: 3600,
        warning: 'This token grants full client access. Use only for support/debugging.',
      },
    });
  } catch (err) {
    console.error('Impersonate error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── RESELLER — DASHBOARD STATS ───────────────────────────────────────────────
// GET /api/manage/reseller/stats

router.get('/reseller/stats', verifyReseller, async (req, res) => {
  try {
    const resellerId = req.reseller.id;

    // Sub-client count + breakdown by status
    const [clientStats] = await pool.execute(
      `SELECT
         COUNT(*) as total_clients,
         SUM(CASE WHEN status = 'active'    THEN 1 ELSE 0 END) as active_clients,
         SUM(CASE WHEN status = 'invited'   THEN 1 ELSE 0 END) as pending_clients,
         SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) as suspended_clients
       FROM clients WHERE reseller_id = ?`,
      [resellerId]
    );

    // Total messages sent by all sub-clients (last 30 days)
    const [messageStats] = await pool.execute(
      `SELECT COUNT(*) as total_messages
       FROM messages m
       JOIN clients c ON m.client_id = c.id
       WHERE c.reseller_id = ?
         AND m.direction = 'outbound'
         AND m.timestamp >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
      [resellerId]
    );

    // Total messages this month
    const [monthlyMessages] = await pool.execute(
      `SELECT COUNT(*) as messages_this_month
       FROM messages m
       JOIN clients c ON m.client_id = c.id
       WHERE c.reseller_id = ?
         AND m.direction = 'outbound'
         AND MONTH(m.timestamp) = MONTH(NOW())
         AND YEAR(m.timestamp)  = YEAR(NOW())`,
      [resellerId]
    );

    // Credit usage — total debited to sub-clients this month
    const [creditStats] = await pool.execute(
      `SELECT
         COALESCE(SUM(CASE WHEN ct.type = 'deduction' THEN ct.amount ELSE 0 END), 0) as credits_used_month,
         COALESCE(SUM(CASE WHEN ct.type = 'topup'     THEN ct.amount ELSE 0 END), 0) as credits_added_month
       FROM credit_transactions ct
       JOIN clients c ON ct.client_id = c.id
       WHERE c.reseller_id = ?
         AND MONTH(ct.created_at) = MONTH(NOW())
         AND YEAR(ct.created_at)  = YEAR(NOW())`,
      [resellerId]
    );

    // Per-client breakdown
    const [clientBreakdown] = await pool.execute(
      `SELECT
         c.id, c.name, c.email, c.status,
         cc.balance as credit_balance,
         p.name as plan_name,
         COUNT(DISTINCT m.id) as messages_sent_30d
       FROM clients c
       LEFT JOIN client_credits cc ON cc.client_id = c.id
       LEFT JOIN plans p ON c.plan_id = p.id
       LEFT JOIN messages m ON m.client_id = c.id
         AND m.direction = 'outbound'
         AND m.timestamp >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       WHERE c.reseller_id = ?
       GROUP BY c.id
       ORDER BY messages_sent_30d DESC`,
      [resellerId]
    );

    res.json({
      success: true,
      data: {
        reseller: {
          id:             req.reseller.id,
          name:           req.reseller.name,
          credit_balance: req.reseller.credit_balance,
        },
        summary: {
          total_clients:      clientStats[0].total_clients,
          active_clients:     clientStats[0].active_clients,
          pending_clients:    clientStats[0].pending_clients,
          suspended_clients:  clientStats[0].suspended_clients,
          messages_last_30d:  messageStats[0].total_messages,
          messages_this_month: monthlyMessages[0].messages_this_month,
          credits_used_month: creditStats[0].credits_used_month,
          credits_added_month: creditStats[0].credits_added_month,
        },
        clients: clientBreakdown,
      },
    });
  } catch (err) {
    console.error('Reseller stats error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── ADMIN — RESELLER UPDATE / CREDIT TOPUP ───────────────────────────────────

router.patch('/resellers/:id', verifyAdmin, auditLog('update_reseller'), validate(schemas.updateReseller), async (req, res) => {
  try {
    const { name, markup_percent, status } = req.body;
    const [existing] = await pool.execute('SELECT id FROM resellers WHERE id = ?', [req.params.id]);
    if (!existing.length)
      return res.status(404).json({ success: false, message: 'Reseller not found' });

    await pool.execute(
      `UPDATE resellers SET
         name = COALESCE(?, name),
         markup_percent = COALESCE(?, markup_percent),
         status = COALESCE(?, status)
       WHERE id = ?`,
      [name ?? null, markup_percent ?? null, status ?? null, req.params.id]
    );
    res.json({ success: true, message: 'Reseller updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/resellers/:id/credits/topup', verifyAdmin, auditLog('reseller_credit_topup'), validate(schemas.topupCredits), async (req, res) => {
  try {
    const { amount, note } = req.body;
    const [rows] = await pool.execute('SELECT id, credit_balance FROM resellers WHERE id = ?', [req.params.id]);
    if (!rows.length)
      return res.status(404).json({ success: false, message: 'Reseller not found' });

    await pool.execute(
      'UPDATE resellers SET credit_balance = credit_balance + ? WHERE id = ?',
      [amount, req.params.id]
    );

    res.json({
      success: true,
      message: 'Reseller credits added',
      data: { new_balance: parseFloat(rows[0].credit_balance) + parseFloat(amount) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── ADMIN — PLATFORM SETTINGS ────────────────────────────────────────────────

router.get('/platform-settings', verifyAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT key_name, value, description, updated_at FROM platform_settings ORDER BY key_name');
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.patch('/platform-settings/:key', verifyAdmin, auditLog('update_platform_setting'), validate(schemas.platformSetting), async (req, res) => {
  try {
    const { value } = req.body;
    const [result] = await pool.execute(
      'UPDATE platform_settings SET value = ? WHERE key_name = ?',
      [value, req.params.key]
    );
    if (!result.affectedRows)
      return res.status(404).json({ success: false, message: 'Setting not found' });

    res.json({ success: true, message: 'Setting updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;