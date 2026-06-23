const express  = require('express');
const router   = express.Router();
const crypto   = require('crypto');
const axios    = require('axios');
const { pool } = require('../config/database');
const { decrypt } = require('../config/encryption');

const META_API = process.env.META_API_VERSION || 'v25.0';

// ─── WEBHOOK VERIFICATION (GET) ───────────────────────────────────────────────

router.get('/', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    console.log('✅ Webhook verified');
    return res.status(200).send(challenge);
  }
  console.log('❌ Webhook verification failed');
  res.status(403).send('Forbidden');
});

// ─── RECEIVE MESSAGES (POST) ──────────────────────────────────────────────────

router.post('/', (req, res) => {
  const sig = req.headers['x-hub-signature-256'];
  if (!sig) {
    console.warn('⚠️ Webhook received with no signature — rejected');
    return res.status(403).send('Forbidden');
  }

  const rawBody = req.rawBody;
  const expected = 'sha256=' + crypto
    .createHmac('sha256', process.env.WHATSAPP_APP_SECRET)
    .update(rawBody)
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    console.warn('⚠️ Invalid webhook signature — rejected');
    return res.status(403).send('Forbidden');
  }

  res.status(200).send('OK');

  const io   = req.app.get('io');
  const body = req.body;

  if (body.object !== 'whatsapp_business_account') return;

  (async () => {
    try {
      for (const entry of body.entry) {
        const wabaId = entry.id;

        for (const change of entry.changes) {
          const field = change.field;
          const value = change.value;

          // Meta quality / throughput updates (no messages in payload)
          if (field === 'phone_number_quality_update') {
            await handlePhoneQualityUpdate(value, wabaId, io);
            continue;
          }

          const phoneNumberId = value.metadata?.phone_number_id;

          if (value.messages?.length) {
            for (const msg of value.messages)
              await handleIncomingMessage(msg, value, phoneNumberId, io);
          }

          if (value.statuses?.length) {
            for (const s of value.statuses)
              await handleStatusUpdate(s, io);
          }
        }
      }
    } catch (err) {
      console.error('❌ Webhook processing error:', err);
    }
  })();
});

// ─── HANDLE INCOMING MESSAGE ──────────────────────────────────────────────────

const OPT_OUT_KEYWORDS = ['stop', 'unsubscribe', 'optout', 'opt out', 'opt-out', 'cancel', 'end'];
const OPT_IN_KEYWORDS  = ['start', 'subscribe', 'optin', 'opt in', 'opt-in', 'yes'];

const handleIncomingMessage = async (message, value, phoneNumberId, io) => {
  try {
    const from      = message.from;
    const messageId = message.id;
    const timestamp = new Date(parseInt(message.timestamp) * 1000);
    const type      = message.type;

    const [phoneRows] = await pool.execute(
      'SELECT * FROM phone_numbers WHERE phone_number_id = ?', [phoneNumberId]
    );
    if (!phoneRows.length) {
      console.log(`⚠️ Phone number ID ${phoneNumberId} not found`);
      return;
    }

    const phoneRecord = phoneRows[0];
    const clientId    = phoneRecord.client_id;

    const contact      = await findOrCreateContact(clientId, from, value.contacts);
    const conversation = await findOrCreateConversation(clientId, contact.id, phoneRecord.id);

    // Idempotency — Meta retries webhooks
    const [existingMsg] = await pool.execute(
      'SELECT id FROM messages WHERE wamid = ? LIMIT 1',
      [messageId]
    );
    if (existingMsg.length) {
      console.log(`↩️ Duplicate webhook ignored: ${messageId}`);
      return;
    }

    try {
      await pool.execute(
        'INSERT INTO webhook_events (event_id, event_type) VALUES (?, ?)',
        [messageId, 'message']
      );
    } catch {
      console.log(`↩️ Duplicate webhook event ignored: ${messageId}`);
      return;
    }

    let body = null, mediaId = null, caption = null;
    let locationLat = null, locationLng = null, locationName = null;

    switch (type) {
      case 'text':     body = message.text?.body; break;
      case 'image':    mediaId = message.image?.id;    caption = message.image?.caption;    body = caption || '[Image]';    break;
      case 'video':    mediaId = message.video?.id;    caption = message.video?.caption;    body = caption || '[Video]';    break;
      case 'audio':    mediaId = message.audio?.id;    body = '[Audio]'; break;
      case 'document': mediaId = message.document?.id; caption = message.document?.caption; body = caption || message.document?.filename || '[Document]'; break;
      case 'location':
        locationLat  = message.location?.latitude;
        locationLng  = message.location?.longitude;
        locationName = message.location?.name;
        body = `[Location: ${locationName || `${locationLat}, ${locationLng}`}]`;
        break;
      case 'button':      body = message.button?.text; break;
      case 'interactive': body = message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || '[Interactive]'; break;
      default: body = `[${type}]`;
    }

    // Opt-out / opt-in handling
    if (type === 'text' && body) {
      const lower = body.trim().toLowerCase();
      if (OPT_OUT_KEYWORDS.includes(lower)) {
        await pool.execute('UPDATE contacts SET opted_in = 0, opted_out_at = NOW() WHERE id = ?', [contact.id]);
        await pool.execute(
          'INSERT INTO opt_out_log (client_id, contact_id, phone, keyword, created_at) VALUES (?, ?, ?, ?, NOW())',
          [clientId, contact.id, from, body.trim()]
        );

        // Log inbound STOP keyword
        await pool.execute(
          `INSERT INTO messages
             (conversation_id, client_id, wamid, direction, type, body, status, timestamp)
           VALUES (?, ?, ?, 'inbound', 'text', ?, 'delivered', ?)`,
          [conversation.id, clientId, messageId, body.trim(), timestamp]
        );

        await sendOptOutConfirmation(phoneRecord, from, conversation.id, clientId, io);
        return;
      }
      if (OPT_IN_KEYWORDS.includes(lower)) {
        await pool.execute('UPDATE contacts SET opted_in = 1, opted_out_at = NULL WHERE id = ?', [contact.id]);
      }
    }

    const [result] = await pool.execute(
      `INSERT INTO messages
         (conversation_id, client_id, wamid, direction, type, body,
          media_id, caption, location_lat, location_lng, location_name,
          status, timestamp)
       VALUES (?, ?, ?, 'inbound', ?, ?, ?, ?, ?, ?, ?, 'delivered', ?)`,
      [
        conversation.id, clientId, messageId, type,
        body || null, mediaId || null, caption || null,
        locationLat || null, locationLng || null, locationName || null,
        timestamp,
      ]
    );

    await pool.execute(
      `UPDATE conversations
       SET last_message = ?, last_message_at = ?, unread_count = unread_count + 1, status = 'open'
       WHERE id = ?`,
      [body, timestamp, conversation.id]
    );

    if (io) {
      io.to(`client_${clientId}`).emit('new_message', {
        conversation_id: conversation.id,
        message: { id: result.insertId, wamid: messageId, direction: 'inbound', type, body, timestamp, status: 'delivered' },
        contact: { phone: from, name: contact.name },
      });
      io.to(`client_${clientId}`).emit('conversation_updated', {
        conversation_id: conversation.id, last_message: body, last_message_at: timestamp, unread_count: 1,
      });
    }

    await triggerClientWebhooks(clientId, 'message.received', {
      conversation_id: conversation.id,
      contact: { phone: from },
      message: { type, body, timestamp },
    });

    // ── Flow builder — keyword triggers ──────────────────────────────────────
    const flowHandled = await handleFlows(
      clientId, contact, conversation, body, type, phoneRecord, io
    );

    // ── Business hours auto-reply (only if no flow matched) ───────────────────
    if (!flowHandled) {
      await handleBusinessHours(clientId, contact, conversation, phoneRecord);
    }

  } catch (err) {
    console.error('❌ handleIncomingMessage error:', err);
  }
};

// ─── FLOW ENGINE — keyword triggers + auto-reply ──────────────────────────────

const handleFlows = async (clientId, contact, conversation, messageBody, messageType, phoneRecord, io) => {
  if (messageType !== 'text' || !messageBody) return false;

  try {
    const [flows] = await pool.execute(
      'SELECT * FROM flows WHERE client_id = ? AND active = 1 ORDER BY priority ASC',
      [clientId]
    );

    for (const flow of flows) {
      const trigger = typeof flow.trigger === 'string' ? JSON.parse(flow.trigger) : flow.trigger;
      const steps   = typeof flow.steps   === 'string' ? JSON.parse(flow.steps)   : flow.steps;

      if (trigger.type !== 'keyword') continue;

      const keywords = trigger.keywords || [];
      const lower    = messageBody.trim().toLowerCase();
      const matched  = keywords.some(k =>
        trigger.match_type === 'exact'
          ? lower === k.toLowerCase()
          : lower.includes(k.toLowerCase())
      );
      if (!matched) continue;

      // Execute all steps in this flow
      for (const step of steps) {
        await executeFlowStep(step, clientId, contact, conversation, phoneRecord, io);
      }

      return true; // Flow matched — stop checking further
    }
  } catch (err) {
    console.error('❌ handleFlows error:', err.message);
  }
  return false;
};

const executeFlowStep = async (step, clientId, contact, conversation, phoneRecord, io) => {
  try {
    switch (step.action) {

      case 'send_text': {
        const text = (step.text || '').replace(/\{\{name\}\}/g, contact.name || contact.phone);
        await sendWhatsAppText(phoneRecord, contact.phone, text);
        await saveOutboundMessage(conversation.id, clientId, 'text', text);
        break;
      }

      case 'send_template': {
        if (!step.template_name) break;
        const accessToken = decrypt(phoneRecord.access_token);
        await axios.post(
          `https://graph.facebook.com/${META_API}/${phoneRecord.phone_number_id}/messages`,
          {
            messaging_product: 'whatsapp',
            recipient_type:    'individual',
            to:                contact.phone.replace('+', ''),
            type:              'template',
            template: {
              name:       step.template_name,
              language:   { code: step.language || 'en_US' },
              components: step.components || [],
            },
          },
          { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, timeout: 8000 }
        );
        await saveOutboundMessage(conversation.id, clientId, 'template', `[Template: ${step.template_name}]`);
        break;
      }

      case 'assign_to_agent': {
        // Bot to human handoff
        const agentId = step.agent_id || null;
        await pool.execute(
          'UPDATE conversations SET agent_id = ?, assigned_at = NOW(), status = "open" WHERE id = ?',
          [agentId, conversation.id]
        );

        if (io) {
          const room = agentId ? `agent_${agentId}` : `client_${clientId}`;
          io.to(room).emit('conversation_assigned', {
            conversation_id: conversation.id,
            contact:  { phone: contact.phone, name: contact.name },
            agent_id: agentId,
            message:  'New conversation assigned',
          });
          io.to(`client_${clientId}`).emit('conversation_updated', {
            conversation_id: conversation.id,
            agent_id: agentId,
            status: 'open',
          });
        }
        break;
      }

      case 'add_tag': {
        if (!step.tag) break;
        const [contactRow] = await pool.execute('SELECT tags FROM contacts WHERE id = ?', [contact.id]);
        const tags = contactRow.length && contactRow[0].tags
          ? (typeof contactRow[0].tags === 'string' ? JSON.parse(contactRow[0].tags) : contactRow[0].tags)
          : [];
        if (!tags.includes(step.tag)) {
          tags.push(step.tag);
          await pool.execute('UPDATE contacts SET tags = ? WHERE id = ?', [JSON.stringify(tags), contact.id]);
        }
        break;
      }

      default:
        console.warn(`⚠️ Unknown flow step action: ${step.action}`);
    }
  } catch (err) {
    console.error(`❌ executeFlowStep (${step.action}) error:`, err.message);
  }
};

// ─── BUSINESS HOURS — check + auto-reply ─────────────────────────────────────

const handleBusinessHours = async (clientId, contact, conversation, phoneRecord) => {
  try {
    const [settings] = await pool.execute(
      'SELECT business_hours_enabled, business_hours FROM client_settings WHERE client_id = ?',
      [clientId]
    );
    if (!settings.length) return false;

    const businessHours = settings[0].business_hours
      ? (typeof settings[0].business_hours === 'string'
          ? JSON.parse(settings[0].business_hours)
          : settings[0].business_hours)
      : null;

    const enabled = settings[0].business_hours_enabled === 1 || businessHours?.enabled;
    if (!enabled) return false;

    const now      = new Date();
    const day      = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const timeStr  = now.toTimeString().slice(0, 5);
    const todayHrs = businessHours.schedule?.[day];

    const isOpen = todayHrs?.open && timeStr >= todayHrs.start && timeStr <= todayHrs.end;
    if (isOpen) return false;

    const awayText = businessHours.away_message ||
      'We are currently outside business hours. We will get back to you soon!';

    await sendWhatsAppText(phoneRecord, contact.phone, awayText);
    await saveOutboundMessage(conversation.id, clientId, 'text', awayText);

    console.log(`⏰ Business hours auto-reply sent to ${contact.phone}`);
    return true;

  } catch (err) {
    console.error('❌ handleBusinessHours error:', err.message);
    return false;
  }
};

// ─── SEND HELPERS ─────────────────────────────────────────────────────────────

const sendWhatsAppText = async (phoneRecord, to, text) => {
  const accessToken = decrypt(phoneRecord.access_token);
  await axios.post(
    `https://graph.facebook.com/${META_API}/${phoneRecord.phone_number_id}/messages`,
    {
      messaging_product: 'whatsapp',
      recipient_type:    'individual',
      to:                to.replace('+', ''),
      type:              'text',
      text:              { body: text },
    },
    { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, timeout: 8000 }
  );
};

const saveOutboundMessage = async (conversationId, clientId, type, body) => {
  await pool.execute(
    `INSERT INTO messages
       (conversation_id, client_id, direction, type, body, status, timestamp)
     VALUES (?, ?, 'outbound', ?, ?, 'sent', NOW())`,
    [conversationId, clientId, type, body]
  );
  await pool.execute(
    'UPDATE conversations SET last_message = ?, last_message_at = NOW() WHERE id = ?',
    [body, conversationId]
  );
};

// ─── STANDARD HELPERS ─────────────────────────────────────────────────────────

const findOrCreateContact = async (clientId, phone, contactsData) => {
  const [existing] = await pool.execute(
    'SELECT * FROM contacts WHERE client_id = ? AND phone = ?', [clientId, phone]
  );
  if (existing.length) return existing[0];

  const name = contactsData?.[0]?.profile?.name || null;
  const [result] = await pool.execute(
    'INSERT INTO contacts (client_id, phone, name, opted_in) VALUES (?, ?, ?, 1)',
    [clientId, phone, name]
  );
  return { id: result.insertId, client_id: clientId, phone, name, opted_in: 1 };
};

const findOrCreateConversation = async (clientId, contactId, phoneNumberId) => {
  const [existing] = await pool.execute(
    `SELECT * FROM conversations
     WHERE client_id = ? AND contact_id = ? AND phone_number_id = ? AND status != 'resolved'
     ORDER BY created_at DESC LIMIT 1`,
    [clientId, contactId, phoneNumberId]
  );
  if (existing.length) return existing[0];

  const [result] = await pool.execute(
    'INSERT INTO conversations (client_id, contact_id, phone_number_id, status) VALUES (?, ?, ?, "open")',
    [clientId, contactId, phoneNumberId]
  );
  return { id: result.insertId };
};

const handlePhoneQualityUpdate = async (value, wabaId, io) => {
  try {
    const ratingRaw = value.quality_rating || value.event || 'GREEN';
    const ratingMap = { GREEN: 'green', YELLOW: 'yellow', RED: 'red' };
    const rating = ratingMap[ratingRaw?.toUpperCase?.()] || String(ratingRaw).toLowerCase();
    const tier = value.current_limit || value.messaging_limit_tier || null;
    const displayPhone = (value.display_phone_number || '').replace(/\D/g, '');

    let phoneRows = [];
    if (displayPhone) {
      [phoneRows] = await pool.execute(
        'SELECT id, client_id, phone_number FROM phone_numbers WHERE phone_number LIKE ? OR phone_number LIKE ?',
        [`%${displayPhone}`, `%${displayPhone.slice(-10)}`]
      );
    }
    if (!phoneRows.length && wabaId) {
      [phoneRows] = await pool.execute(
        'SELECT id, client_id, phone_number FROM phone_numbers WHERE waba_id = ?',
        [wabaId]
      );
    }
    if (!phoneRows.length) {
      console.warn(`⚠️ Quality update: phone not found (waba=${wabaId}, display=${value.display_phone_number})`);
      return;
    }

    for (const phone of phoneRows) {
      await pool.execute(
        `UPDATE phone_numbers
         SET quality_rating = ?, messaging_limit_tier = COALESCE(?, messaging_limit_tier), updated_at = NOW()
         WHERE id = ?`,
        [rating, tier, phone.id]
      );

      if (io) {
        io.to(`client_${phone.client_id}`).emit('phone_quality_update', {
          phone_number_id: phone.id,
          phone_number: phone.phone_number,
          quality_rating: rating,
          messaging_limit_tier: tier,
          event: value.event,
        });
      }

      console.log(`📊 Quality update: ${phone.phone_number} → ${rating} (tier: ${tier || '—'})`);
    }
  } catch (err) {
    console.error('❌ handlePhoneQualityUpdate error:', err.message);
  }
};

const handleStatusUpdate = async (status, io) => {
  try {
    const { id: wamid, status: messageStatus, timestamp } = status;
    const ts = new Date(parseInt(timestamp) * 1000);

    await pool.execute(
      `INSERT INTO message_status_updates (wamid, status, timestamp)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE status = ?, timestamp = ?`,
      [wamid, messageStatus, ts, messageStatus, ts]
    );
    await pool.execute('UPDATE messages SET status = ? WHERE wamid = ?', [messageStatus, wamid]);

    const [msgRows] = await pool.execute(
      'SELECT client_id FROM messages WHERE wamid = ? LIMIT 1',
      [wamid]
    );
    const clientId = msgRows[0]?.client_id;

    if (['delivered', 'read', 'failed'].includes(messageStatus)) {
      const colMap = { delivered: 'delivered_count', read: 'read_count', failed: 'failed_count' };
      await pool.execute('UPDATE broadcast_contacts SET status = ? WHERE wamid = ?', [messageStatus, wamid]);
      const [bcRows] = await pool.execute(
        'SELECT broadcast_id FROM broadcast_contacts WHERE wamid = ?', [wamid]
      );
      if (bcRows.length && colMap[messageStatus]) {
        await pool.execute(
          `UPDATE broadcasts SET ${colMap[messageStatus]} = ${colMap[messageStatus]} + 1 WHERE id = ?`,
          [bcRows[0].broadcast_id]
        );
      }
    }

    if (io) {
      const payload = { wamid, status: messageStatus };
      if (clientId) io.to(`client_${clientId}`).emit('message_status', payload);
      else io.emit('message_status', payload);
    }
  } catch (err) {
    console.error('❌ handleStatusUpdate error:', err);
  }
};

const triggerClientWebhooks = async (clientId, event, payload) => {
  try {
    const [webhooks] = await pool.execute(
      "SELECT * FROM client_webhooks WHERE client_id = ? AND status = 'active'",
      [clientId]
    );
    for (const wh of webhooks) {
      const events = JSON.parse(wh.events || '[]');
      if (!events.includes(event) && !events.includes('*')) continue;

      const deliveryPayload = { event, timestamp: new Date().toISOString(), data: payload };
      let responseCode = null;
      let responseBody = null;
      let deliveryStatus = 'failed';

      try {
        const hmac = crypto.createHmac('sha256', wh.secret)
          .update(JSON.stringify(deliveryPayload)).digest('hex');
        const resp = await axios.post(wh.url, deliveryPayload, {
          headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': hmac },
          timeout: 5000,
        });
        responseCode = resp.status;
        responseBody = JSON.stringify(resp.data)?.slice(0, 2000);
        deliveryStatus = 'success';
        await pool.execute(
          'UPDATE client_webhooks SET last_triggered = NOW(), failure_count = 0 WHERE id = ?', [wh.id]
        );
      } catch (err) {
        responseCode = err.response?.status || 0;
        responseBody = err.message?.slice(0, 2000);
        await pool.execute(
          'UPDATE client_webhooks SET failure_count = failure_count + 1 WHERE id = ?', [wh.id]
        );
      }

      try {
        await pool.execute(
          `INSERT INTO webhook_logs (webhook_id, event, payload, response_code, response_body, status)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [wh.id, event, JSON.stringify(deliveryPayload), responseCode, responseBody, deliveryStatus]
        );
      } catch (logErr) {
        console.warn('⚠️ webhook_logs write failed:', logErr.message);
      }
    }
  } catch (err) {
    console.error('❌ triggerClientWebhooks error:', err);
  }
};

const sendOptOutConfirmation = async (phoneRecord, to, conversationId, clientId, io) => {
  const confirmText = 'You have been unsubscribed and will no longer receive marketing messages from us. Reply START to re-subscribe.';
  try {
    await sendWhatsAppText(phoneRecord, to, confirmText);
    await saveOutboundMessage(conversationId, clientId, 'text', confirmText);

    if (io) {
      io.to(`client_${clientId}`).emit('new_message', {
        conversation_id: conversationId,
        message: {
          direction: 'outbound',
          type: 'text',
          body: confirmText,
          timestamp: new Date(),
          status: 'sent',
        },
      });
    }
  } catch (err) {
    console.error('❌ sendOptOutConfirmation error:', err.message);
  }
};

module.exports = router;