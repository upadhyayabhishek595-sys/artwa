const { Worker, Queue } = require('bullmq');
const axios      = require('axios');
const { pool }   = require('../config/database');
const { decrypt } = require('../config/encryption');
const { redisConnection } = require('../config/redis');
const { checkAndAlertLowCredits } = require('../src/creditAlert');

// ─── RETRY QUEUE ─────────────────────────────────────────────────────────────
const retryQueue = new Queue('broadcast-retry', {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,                                    // max 3 retries per contact
        backoff: { type: 'exponential', delay: 60000 }, // 1min → 2min → 4min
        removeOnComplete: { count: 200 },
        removeOnFail:     { count: 500 },
    }
});

retryQueue.on('error', err => {
    console.error('❌ Retry queue error:', err.message);
});

// ─── RETRY WORKER ────────────────────────────────────────────────────────────
const retryWorker = new Worker('broadcast-retry', async (job) => {

    const { broadcastId, contactId, clientId } = job.data;

    console.log(`🔄 [RetryWorker] Job ${job.id} → broadcast ${broadcastId}, contact ${contactId}, attempt ${job.attemptsMade + 1}/3`);

    // Fetch broadcast_contact record
    const [bcRows] = await pool.execute(
        `SELECT bc.*, c.phone, c.name
         FROM broadcast_contacts bc
         JOIN contacts c ON bc.contact_id = c.id
         WHERE bc.broadcast_id = ? AND bc.contact_id = ?`,
        [broadcastId, contactId]
    );
    if (!bcRows.length) throw new Error(`broadcast_contact not found`);
    const bc = bcRows[0];

    // Skip if already sent (maybe manual fix happened)
    if (bc.status === 'sent' || bc.status === 'delivered') {
        console.log(`⏭  Contact ${contactId} already sent — skipping retry`);
        return { skipped: true };
    }

    // Fetch broadcast
    const [broadcastRows] = await pool.execute(
        'SELECT * FROM broadcasts WHERE id = ?', [broadcastId]
    );
    if (!broadcastRows.length) throw new Error(`Broadcast ${broadcastId} not found`);
    const broadcast = broadcastRows[0];

    // Fetch template
    const [tplRows] = await pool.execute(
        'SELECT * FROM templates WHERE id = ?', [broadcast.template_id]
    );
    if (!tplRows.length) throw new Error(`Template not found`);

    // Fetch phone number
    const [phoneRows] = await pool.execute(
        'SELECT * FROM phone_numbers WHERE id = ?', [broadcast.phone_number_id]
    );
    if (!phoneRows.length) throw new Error(`Phone number not found`);

    const template    = tplRows[0];
    const phoneRecord = phoneRows[0];
    const accessToken = decrypt(phoneRecord.access_token);
    const contact     = { id: bc.contact_id, phone: bc.phone, name: bc.name };

    // Build payload
    const payload = buildTemplatePayload(contact, template, phoneRecord.phone_number_id);

    // Send to Meta
    const metaRes = await axios.post(
        `https://graph.facebook.com/v20.0/${phoneRecord.phone_number_id}/messages`,
        payload,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        }
    );

    const wamid = metaRes.data?.messages?.[0]?.id;

    // Mark sent
    await pool.execute(
        `UPDATE broadcast_contacts
         SET status = 'sent', wamid = ?, sent_at = NOW(), error_message = NULL,
             retry_count = retry_count + 1
         WHERE broadcast_id = ? AND contact_id = ?`,
        [wamid, broadcastId, contactId]
    );

    // Deduct credit
    const cost = 0.016;
    const [updated] = await pool.execute(
        'UPDATE client_credits SET balance = balance - ? WHERE client_id = ? AND balance >= ?',
        [cost, clientId, cost]
    );
    if (updated.affectedRows > 0) {
        await pool.execute(
            `INSERT INTO credit_transactions (client_id, type, amount, description)
             VALUES (?, 'deduction', ?, 'Broadcast retry send')`,
            [clientId, cost]
        );
        await checkAndAlertLowCredits(clientId, null);
    }

    // Update broadcast sent_count
    await pool.execute(
        `UPDATE broadcasts
         SET sent_count = sent_count + 1,
             failed_count = GREATEST(failed_count - 1, 0)
         WHERE id = ?`,
        [broadcastId]
    );

    console.log(`✅ [RetryWorker] Contact ${contactId} sent on attempt ${job.attemptsMade + 1}`);
    return { sent: true, wamid };

}, {
    connection: redisConnection,
    concurrency: 5,  // 5 retries parallel
});

// ─── WORKER EVENTS ───────────────────────────────────────────────────────────

retryWorker.on('failed', async (job, err) => {
    const { broadcastId, contactId } = job.data;
    const isLastAttempt = job.attemptsMade >= job.opts.attempts;

    console.error(`❌ [RetryWorker] Job ${job.id} failed (attempt ${job.attemptsMade}):`, err.message);

    if (isLastAttempt) {
        // All 3 retries exhausted — mark as permanently failed
        await pool.execute(
            `UPDATE broadcast_contacts
             SET status = 'failed', error_message = ?, retry_count = retry_count + 1
             WHERE broadcast_id = ? AND contact_id = ?`,
            [`Max retries exceeded: ${err.message}`, broadcastId, contactId]
        ).catch(() => {});
        console.error(`💀 [RetryWorker] Contact ${contactId} permanently failed after 3 retries`);
    }
});

retryWorker.on('completed', (job, result) => {
    if (!result?.skipped) {
        console.log(`✅ [RetryWorker] Job ${job.id} completed`);
    }
});

retryWorker.on('error', err => {
    console.error('❌ [RetryWorker] error:', err.message);
});

// ─── HELPER — enqueue all failed contacts after broadcast completes ───────────
const enqueueFailedContacts = async (broadcastId, clientId) => {
    const [failedContacts] = await pool.execute(
        `SELECT contact_id FROM broadcast_contacts
         WHERE broadcast_id = ? AND status = 'failed'
         AND (retry_count IS NULL OR retry_count < 3)`,
        [broadcastId]
    );

    if (!failedContacts.length) {
        console.log(`ℹ️  Broadcast ${broadcastId} — no failed contacts to retry`);
        return 0;
    }

    for (const fc of failedContacts) {
        await retryQueue.add(
            `retry-${broadcastId}-${fc.contact_id}`,
            { broadcastId, contactId: fc.contact_id, clientId },
            { jobId: `retry-${broadcastId}-${fc.contact_id}` } // no duplicate jobs
        );
    }

    console.log(`🔄 Enqueued ${failedContacts.length} failed contacts for retry — broadcast ${broadcastId}`);
    return failedContacts.length;
};

// ─── TEMPLATE PAYLOAD (same as broadcastWorker) ───────────────────────────────
const buildTemplatePayload = (contact, template, phoneNumberId) => {
    const components = [];

    if (template.header_type && template.header_content) {
        if (template.header_type === 'text') {
            components.push({ type: 'header', parameters: [{ type: 'text', text: template.header_content }] });
        } else if (['image', 'video', 'document'].includes(template.header_type)) {
            components.push({
                type: 'header',
                parameters: [{ type: template.header_type, [template.header_type]: { link: template.header_content } }]
            });
        }
    }

    const variables = template.variables
        ? (typeof template.variables === 'string' ? JSON.parse(template.variables) : template.variables)
        : [];

    if (variables.length) {
        components.push({
            type: 'body',
            parameters: variables.map(v => ({
                type: 'text',
                text: v === '{{name}}' ? (contact.name || contact.phone) : v
            }))
        });
    }

    const buttons = template.buttons
        ? (typeof template.buttons === 'string' ? JSON.parse(template.buttons) : template.buttons)
        : [];

    buttons.forEach((btn, index) => {
        if (btn.type === 'url' && btn.url_suffix) {
            components.push({
                type: 'button', sub_type: 'url', index: String(index),
                parameters: [{ type: 'text', text: btn.url_suffix }]
            });
        }
    });

    return {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: contact.phone.replace('+', ''),
        type: 'template',
        template: {
            name: template.name,
            language: { code: template.language || 'en_US' },
            components: components.length ? components : undefined
        }
    };
};

module.exports = { retryQueue, retryWorker, enqueueFailedContacts };
