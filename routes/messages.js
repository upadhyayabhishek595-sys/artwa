const express  = require('express');
const router   = express.Router();
const axios    = require('axios');
const { pool } = require('../config/database');
const { decrypt } = require('../config/encryption');
const { verifyClient, verifyClientOrAgent } = require('../middleware/auth');
const { checkMessageLimit } = require('../middleware/messageLimit');
const { validate, schemas }  = require('../middleware/validate');
const { checkAndAlertLowCredits } = require('../src/creditAlert');

const META_API = process.env.META_API_VERSION || 'v25.0';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

// FIX: Deduct credits — check balance BEFORE Meta call, deduct AFTER success
const deductCredits = async (clientId, conversationType = 'service', io = null) => {
  const rates = { MARKETING: 0.016, UTILITY: 0.006, AUTHENTICATION: 0.005, service: 0.0 };
  const cost  = rates[conversationType?.toUpperCase()] ?? rates.service;
  if (cost <= 0) return;

  const [rows] = await pool.execute(
    'SELECT balance FROM client_credits WHERE client_id = ?', [clientId]
  );
  if (!rows.length || rows[0].balance < cost)
    throw Object.assign(new Error('Insufficient credits'), { code: 'INSUFFICIENT_CREDITS', cost });

  await pool.execute(
    'UPDATE client_credits SET balance = balance - ? WHERE client_id = ?', [cost, clientId]
  );
  await pool.execute(
    `INSERT INTO credit_transactions (client_id, type, amount, description)
     VALUES (?, 'deduction', ?, ?)`,
    [clientId, cost, `Message send (${conversationType})`]
  );

  // Alert client if balance is low
  await checkAndAlertLowCredits(clientId, io);
};

// FIX: 24-hour session window — WhatsApp rule
// Free-form text can only be sent if customer messaged within last 24 hours.
// Outside the window, only approved templates are allowed.
const check24hWindow = async (conversationId, messageType) => {
  // Templates are always allowed
  if (messageType === 'template') return { allowed: true };

  const [rows] = await pool.execute(
    `SELECT MAX(timestamp) as last_inbound
     FROM messages
     WHERE conversation_id = ? AND direction = 'inbound'`,
    [conversationId]
  );

  const lastInbound = rows[0]?.last_inbound;

  // No inbound message ever — session has never started, block free-form
  if (!lastInbound) {
    return {
      allowed: false,
      reason:  'No inbound message found. You can only initiate conversations with approved templates.',
    };
  }

  const hoursSince = (Date.now() - new Date(lastInbound).getTime()) / (1000 * 60 * 60);

  if (hoursSince > 24) {
    return {
      allowed: false,
      reason:  `Customer's last message was ${Math.floor(hoursSince)} hours ago. The 24-hour session window has expired. Use an approved template to restart the conversation.`,
    };
  }

  return { allowed: true };
};

// ─── POST /api/messages/send ──────────────────────────────────────────────────

router.post('/send', verifyClientOrAgent, checkMessageLimit, validate(schemas.sendMessage), async (req, res) => {
  try {
    const {
      conversation_id, type = 'text', body, media_url, media_id, caption,
      template_name, template_data, location_lat, location_lng, location_name,
      interactive_data,
    } = req.body;

    if (!conversation_id)
      return res.status(400).json({ success: false, message: 'conversation_id required' });

    const clientId = req.client?.id || req.agent?.client_id;
    const agentId  = req.agent?.id || null;

    const [convRows] = await pool.execute(
      `SELECT c.*, p.phone_number_id, p.access_token, p.phone_number
       FROM conversations c
       JOIN phone_numbers p ON c.phone_number_id = p.id
       WHERE c.id = ? AND c.client_id = ?`,
      [conversation_id, clientId]
    );
    if (!convRows.length)
      return res.status(404).json({ success: false, message: 'Conversation not found' });

    const conv = convRows[0];

    const [contactRows] = await pool.execute(
      'SELECT phone, opted_in FROM contacts WHERE id = ?', [conv.contact_id]
    );
    if (!contactRows.length)
      return res.status(404).json({ success: false, message: 'Contact not found' });

    // Block send to opted-out contacts
    if (!contactRows[0].opted_in)
      return res.status(403).json({
        success: false,
        message: 'This contact has opted out and cannot receive messages.',
      });

    const toPhone = contactRows[0].phone;

    // 24-hour session window — free-form messages only inside customer session
    const sessionCheck = await check24hWindow(conversation_id, type);
    if (!sessionCheck.allowed)
      return res.status(403).json({ success: false, message: sessionCheck.reason });

    if (type === 'template' && template_name) {
      const [tplRows] = await pool.execute(
        'SELECT status FROM templates WHERE name = ? AND client_id = ?',
        [template_name, clientId]
      );
      if (tplRows.length && tplRows[0].status !== 'approved')
        return res.status(400).json({
          success: false,
          message: `Template "${template_name}" is not approved (status: ${tplRows[0].status}). Only approved templates can be sent.`,
        });
    }

    // Build Meta payload
    let metaPayload = {
      messaging_product: 'whatsapp',
      recipient_type:    'individual',
      to:                toPhone,
    };

    switch (type) {
      case 'text':
        metaPayload.type = 'text';
        metaPayload.text = { body };
        break;
      case 'image':
        metaPayload.type  = 'image';
        metaPayload.image = media_id ? { id: media_id, caption } : { link: media_url, caption };
        break;
      case 'video':
        metaPayload.type  = 'video';
        metaPayload.video = media_id ? { id: media_id, caption } : { link: media_url, caption };
        break;
      case 'audio':
        metaPayload.type  = 'audio';
        metaPayload.audio = media_id ? { id: media_id } : { link: media_url };
        break;
      case 'document':
        metaPayload.type     = 'document';
        metaPayload.document = media_id ? { id: media_id, caption } : { link: media_url, caption };
        break;
      case 'location':
        metaPayload.type     = 'location';
        metaPayload.location = { latitude: location_lat, longitude: location_lng, name: location_name };
        break;
      case 'template':
        metaPayload.type     = 'template';
        metaPayload.template = {
          name:       template_name,
          language:   { code: template_data?.language || 'en_US' },
          components: template_data?.components || [],
        };
        break;
      case 'interactive':
        if (!interactive_data?.type || !interactive_data?.body || !interactive_data?.action)
          return res.status(400).json({
            success: false,
            message: 'interactive_data requires type, body, and action',
          });
        metaPayload.type        = 'interactive';
        metaPayload.interactive = interactive_data;
        break;
      default:
        return res.status(400).json({ success: false, message: `Unsupported type: ${type}` });
    }

    // FIX: Check credits BEFORE calling Meta API
    try {
      await deductCredits(clientId, conv.conversation_category || 'service', req.app.get('io'));
    } catch (err) {
      if (err.code === 'INSUFFICIENT_CREDITS')
        return res.status(402).json({ success: false, message: 'Insufficient credits. Please top up.' });
      throw err;
    }

    // Send via Meta API
    const accessToken = decrypt(conv.access_token);
    const metaRes = await axios.post(
      `https://graph.facebook.com/${META_API}/${conv.phone_number_id}/messages`,
      metaPayload,
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );

    const wamid = metaRes.data?.messages?.[0]?.id;

    const displayBody = body || caption || (type === 'interactive'
      ? `[Interactive: ${interactive_data?.type || 'message'}]`
      : `[${type}]`);

    const [result] = await pool.execute(
      `INSERT INTO messages
         (conversation_id, client_id, wamid, direction, type, body,
          media_url, media_id, caption, location_lat, location_lng, location_name,
          template_name, template_data, interactive_data, status, sent_by_api, sent_by_agent_id, timestamp)
       VALUES (?, ?, ?, 'outbound', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent', 1, ?, NOW())`,
      [
        conversation_id, clientId, wamid, type,
        displayBody, media_url || null, media_id || null, caption || null,
        location_lat || null, location_lng || null, location_name || null,
        template_name || null,
        template_data ? JSON.stringify(template_data) : null,
        interactive_data ? JSON.stringify(interactive_data) : null,
        agentId,
      ]
    );

    await pool.execute(
      'UPDATE conversations SET last_message = ?, last_message_at = NOW() WHERE id = ?',
      [displayBody, conversation_id]
    );

    res.json({ success: true, message: 'Message sent', data: { id: result.insertId, wamid } });

  } catch (err) {
    console.error('❌ Send message error:', err.response?.data || err.message);
    res.status(500).json({ success: false, message: 'Failed to send message' });
  }
});

// ─── GET /api/messages/:conversation_id ───────────────────────────────────────

router.get('/:conversation_id', verifyClientOrAgent, async (req, res) => {
  try {
    const clientId = req.client?.id || req.agent?.client_id;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    const [convCheck] = await pool.execute(
      'SELECT id FROM conversations WHERE id = ? AND client_id = ?',
      [req.params.conversation_id, clientId]
    );
    if (!convCheck.length)
      return res.status(404).json({ success: false, message: 'Conversation not found' });

    const [messages] = await pool.execute(
      `SELECT m.*, a.name as agent_name
       FROM messages m
       LEFT JOIN agents a ON m.sent_by_agent_id = a.id
       WHERE m.conversation_id = ?
       ORDER BY m.timestamp DESC
       LIMIT ? OFFSET ?`,
      [req.params.conversation_id, parseInt(limit), parseInt(offset)]
    );

    const [countRows] = await pool.execute(
      'SELECT COUNT(*) as total FROM messages WHERE conversation_id = ?',
      [req.params.conversation_id]
    );

    res.json({
      success: true,
      data: messages.reverse(),
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

module.exports = router;