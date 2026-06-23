const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const axios = require('axios');

// =============================================
// WEBHOOK VERIFICATION (GET)
// Meta calls this to verify your webhook
// =============================================
router.get('/', (req, res) => {
    console.log('📞 Meta is verifying webhook...');

    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
        console.log('✅ Webhook verified successfully!');
        res.status(200).send(challenge);
    } else {
        console.log('❌ Webhook verification failed!');
        res.status(403).send('Forbidden');
    }
});

// =============================================
// RECEIVE MESSAGES (POST)
// Meta sends all events here
// =============================================
router.post('/', async (req, res) => {
    // Always respond 200 immediately to Meta
    res.status(200).send('OK');

    try {
        const body = req.body;

        if (body.object !== 'whatsapp_business_account') return;

        for (const entry of body.entry) {
            for (const change of entry.changes) {
                const value = change.value;
                const phoneNumberId = value.metadata?.phone_number_id;

                // Handle incoming messages
                if (value.messages && value.messages.length > 0) {
                    for (const message of value.messages) {
                        await handleIncomingMessage(message, value, phoneNumberId);
                    }
                }

                // Handle message status updates
                if (value.statuses && value.statuses.length > 0) {
                    for (const status of value.statuses) {
                        await handleStatusUpdate(status);
                    }
                }
            }
        }
    } catch (error) {
        console.error('❌ Webhook processing error:', error);
    }
});

// =============================================
// HANDLE INCOMING MESSAGE
// =============================================
const handleIncomingMessage = async (message, value, phoneNumberId) => {
    try {
        const from      = message.from;        // Customer phone number
        const messageId = message.id;          // Meta message ID
        const timestamp = new Date(parseInt(message.timestamp) * 1000);
        const type      = message.type;

        console.log(`📩 New message from ${from} | Type: ${type}`);

        // Find phone number record in DB
        const [phoneRows] = await pool.execute(
            'SELECT * FROM phone_numbers WHERE phone_number_id = ?',
            [phoneNumberId]
        );

        if (!phoneRows.length) {
            console.log(`⚠️ Phone number ID ${phoneNumberId} not found in DB`);
            return;
        }

        const phoneRecord = phoneRows[0];
        const clientId    = phoneRecord.client_id;

        // Find or create contact
        const contact = await findOrCreateContact(clientId, from, value.contacts);

        // Find or create conversation
        const conversation = await findOrCreateConversation(clientId, contact.id, phoneRecord.id);

        // Extract message content
        let body        = null;
        let mediaUrl    = null;
        let mediaId     = null;
        let caption     = null;
        let locationLat = null;
        let locationLng = null;
        let locationName = null;

        switch (type) {
            case 'text':
                body = message.text?.body;
                break;
            case 'image':
                mediaId  = message.image?.id;
                caption  = message.image?.caption;
                body     = caption || '[Image]';
                break;
            case 'video':
                mediaId  = message.video?.id;
                caption  = message.video?.caption;
                body     = caption || '[Video]';
                break;
            case 'audio':
                mediaId  = message.audio?.id;
                body     = '[Audio]';
                break;
            case 'document':
                mediaId  = message.document?.id;
                caption  = message.document?.caption;
                body     = caption || message.document?.filename || '[Document]';
                break;
            case 'location':
                locationLat  = message.location?.latitude;
                locationLng  = message.location?.longitude;
                locationName = message.location?.name;
                body         = `[Location: ${locationName || `${locationLat}, ${locationLng}`}]`;
                break;
            case 'button':
                body = message.button?.text;
                break;
            case 'interactive':
                body = message.interactive?.button_reply?.title ||
                       message.interactive?.list_reply?.title ||
                       '[Interactive]';
                break;
            default:
                body = `[${type}]`;
        }

        // Save message to database
        await pool.execute(
            `INSERT INTO messages 
             (conversation_id, client_id, wamid, direction, type, body, 
              media_id, caption, location_lat, location_lng, location_name, 
              status, timestamp)
             VALUES (?, ?, ?, 'inbound', ?, ?, ?, ?, ?, ?, ?, 'delivered', ?)`,
            [
                conversation.id, clientId, messageId, type,
                body, mediaId, caption,
                locationLat, locationLng, locationName,
                timestamp
            ]
        );

        // Update conversation last message
        await pool.execute(
            `UPDATE conversations 
             SET last_message = ?, last_message_at = ?, 
                 unread_count = unread_count + 1, status = 'open'
             WHERE id = ?`,
            [body, timestamp, conversation.id]
        );

        console.log(`✅ Message saved | Contact: ${from} | Conv: ${conversation.id}`);

        // Trigger client webhooks
        await triggerClientWebhooks(clientId, 'message.received', {
            conversation_id: conversation.id,
            contact: { phone: from },
            message: { type, body, timestamp }
        });

    } catch (error) {
        console.error('❌ Error handling incoming message:', error);
    }
};

// =============================================
// FIND OR CREATE CONTACT
// =============================================
const findOrCreateContact = async (clientId, phone, contactsData) => {
    const [existing] = await pool.execute(
        'SELECT * FROM contacts WHERE client_id = ? AND phone = ?',
        [clientId, phone]
    );

    if (existing.length) return existing[0];

    // Get name from Meta contact data if available
    const name = contactsData?.[0]?.profile?.name || null;

    const [result] = await pool.execute(
        'INSERT INTO contacts (client_id, phone, name) VALUES (?, ?, ?)',
        [clientId, phone, name]
    );

    console.log(`👤 New contact created: ${phone}`);
    return { id: result.insertId, client_id: clientId, phone, name };
};

// =============================================
// FIND OR CREATE CONVERSATION
// =============================================
const findOrCreateConversation = async (clientId, contactId, phoneNumberId) => {
    // Find open conversation
    const [existing] = await pool.execute(
        `SELECT * FROM conversations 
         WHERE client_id = ? AND contact_id = ? AND phone_number_id = ? 
         AND status != 'resolved'
         ORDER BY created_at DESC LIMIT 1`,
        [clientId, contactId, phoneNumberId]
    );

    if (existing.length) return existing[0];

    // Create new conversation
    const [result] = await pool.execute(
        `INSERT INTO conversations 
         (client_id, contact_id, phone_number_id, status) 
         VALUES (?, ?, ?, 'open')`,
        [clientId, contactId, phoneNumberId]
    );

    console.log(`💬 New conversation created: ${result.insertId}`);
    return { id: result.insertId };
};

// =============================================
// HANDLE MESSAGE STATUS UPDATES
// =============================================
const handleStatusUpdate = async (status) => {
    try {
        const { id: wamid, status: messageStatus, timestamp } = status;

        console.log(`📊 Status update: ${wamid} → ${messageStatus}`);

        // Save status update
        await pool.execute(
            `INSERT INTO message_status_updates (wamid, status, timestamp) 
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE status = ?, timestamp = ?`,
            [wamid, messageStatus, new Date(parseInt(timestamp) * 1000),
             messageStatus, new Date(parseInt(timestamp) * 1000)]
        );

        // Update message status in messages table
        await pool.execute(
            'UPDATE messages SET status = ? WHERE wamid = ?',
            [messageStatus, wamid]
        );

    } catch (error) {
        console.error('❌ Error handling status update:', error);
    }
};

// =============================================
// TRIGGER CLIENT WEBHOOKS
// =============================================
const triggerClientWebhooks = async (clientId, event, payload) => {
    try {
        const [webhooks] = await pool.execute(
            `SELECT * FROM client_webhooks 
             WHERE client_id = ? AND status = 'active'`,
            [clientId]
        );

        for (const webhook of webhooks) {
            const events = JSON.parse(webhook.events || '[]');
            if (!events.includes(event) && !events.includes('*')) continue;

            try {
                await axios.post(webhook.url, {
                    event,
                    timestamp: new Date().toISOString(),
                    data: payload
                }, {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Webhook-Secret': webhook.secret
                    },
                    timeout: 5000
                });

                await pool.execute(
                    'UPDATE client_webhooks SET last_triggered = NOW(), failure_count = 0 WHERE id = ?',
                    [webhook.id]
                );
            } catch (err) {
                await pool.execute(
                    'UPDATE client_webhooks SET failure_count = failure_count + 1 WHERE id = ?',
                    [webhook.id]
                );
            }
        }
    } catch (error) {
        console.error('❌ Error triggering webhooks:', error);
    }
};

module.exports = router;
