const { Worker } = require('bullmq');
const axios      = require('axios');
const { pool }   = require('../config/database');
const { decrypt } = require('../config/encryption');
const { redisConnection } = require('../config/redis');
const { checkAndAlertLowCredits } = require('../src/creditAlert');
const { enqueueFailedContacts } = require('./retryWorker');
// ─── WORKER ──────────────────────────────────────────────────────────────────
// Picks up jobs from 'broadcast' queue and processes them one at a time
// concurrency: 2 means 2 broadcasts can run simultaneously max

const broadcastWorker = new Worker('broadcast', async (job) => {

    const { broadcastId, clientId } = job.data;

    console.log(`🚀 [Worker] Starting broadcast job ${job.id} → broadcastId: ${broadcastId}`);

    // Fetch broadcast record
    const [broadcastRows] = await pool.execute(
        'SELECT * FROM broadcasts WHERE id = ? AND client_id = ?',
        [broadcastId, clientId]
    );
    if (!broadcastRows.length) throw new Error(`Broadcast ${broadcastId} not found`);

    const broadcast = broadcastRows[0];

    // Fetch template
    const [tplRows] = await pool.execute(
        'SELECT * FROM templates WHERE id = ?', [broadcast.template_id]
    );
    if (!tplRows.length) throw new Error(`Template not found for broadcast ${broadcastId}`);

    // Fetch phone number
    const [phoneRows] = await pool.execute(
        'SELECT * FROM phone_numbers WHERE id = ?', [broadcast.phone_number_id]
    );
    if (!phoneRows.length) throw new Error(`Phone number not found for broadcast ${broadcastId}`);

    const template    = tplRows[0];
    const phoneRecord = phoneRows[0];

    // Fetch pending contacts only (supports resume from pause)
    const [contacts] = await pool.execute(
        `SELECT bc.contact_id as id, c.phone, c.name
         FROM broadcast_contacts bc
         JOIN contacts c ON bc.contact_id = c.id
         WHERE bc.broadcast_id = ? AND bc.status = 'pending'`,
        [broadcastId]
    );

    if (!contacts.length) {
        console.log(`ℹ️  Broadcast ${broadcastId} — no pending contacts, marking complete`);
        await pool.execute(
            'UPDATE broadcasts SET status = "completed", completed_at = NOW() WHERE id = ?',
            [broadcastId]
        );
        return { sent: 0, failed: 0 };
    }

    await pool.execute(
        'UPDATE broadcasts SET status = "running", started_at = NOW() WHERE id = ?',
        [broadcastId]
    );

    const accessToken = decrypt(phoneRecord.access_token);
    let sentCount = 0, failedCount = 0;

    for (let i = 0; i < contacts.length; i++) {
        const contact = contacts[i];

        // Check pause signal before each send
        const [statusCheck] = await pool.execute(
            'SELECT status FROM broadcasts WHERE id = ?', [broadcastId]
        );
        if (statusCheck[0]?.status === 'paused') {
            console.log(`⏸  Broadcast ${broadcastId} paused at ${sentCount}/${contacts.length}`);
            // Update progress before exiting
            await pool.execute(
                'UPDATE broadcasts SET sent_count = ?, failed_count = ? WHERE id = ?',
                [sentCount, failedCount, broadcastId]
            );
            return { sent: sentCount, failed: failedCount, paused: true };
        }

        await sleep(100); // ~10 msg/sec — Meta rate limit safety

        try {
            const payload = buildTemplatePayload(contact, template, phoneRecord.phone_number_id);

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

            await pool.execute(
                `UPDATE broadcast_contacts
                 SET status = 'sent', wamid = ?, sent_at = NOW()
                 WHERE broadcast_id = ? AND contact_id = ?`,
                [wamid, broadcastId, contact.id]
            );

            // Deduct credit per message
            const cost = 0.016;
            const [updated] = await pool.execute(
                'UPDATE client_credits SET balance = balance - ? WHERE client_id = ? AND balance >= ?',
                [cost, clientId, cost]
            );
            if (updated.affectedRows > 0) {
                await pool.execute(
                    `INSERT INTO credit_transactions (client_id, type, amount, description)
                     VALUES (?, 'deduction', ?, 'Broadcast send')`,
                    [clientId, cost]
                );
                await checkAndAlertLowCredits(clientId, null);
            }

            sentCount++;

        } catch (err) {
            failedCount++;
            const errMsg = err.response?.data?.error?.message || err.message;

            await pool.execute(
                `UPDATE broadcast_contacts
                 SET status = 'failed', error_message = ?
                 WHERE broadcast_id = ? AND contact_id = ?`,
                [errMsg, broadcastId, contact.id]
            );
            console.error(`❌ Failed → ${contact.phone}: ${errMsg}`);
        }

        // Update progress every 10 sends
        if ((sentCount + failedCount) % 10 === 0) {
            await pool.execute(
                'UPDATE broadcasts SET sent_count = ?, failed_count = ? WHERE id = ?',
                [sentCount, failedCount, broadcastId]
            );
            // Report progress to BullMQ dashboard
            await job.updateProgress(Math.round(((i + 1) / contacts.length) * 100));
        }
    }

    // Mark complete
    
    await pool.execute(
        `UPDATE broadcasts
         SET status = 'completed', sent_count = ?, failed_count = ?, completed_at = NOW()
         WHERE id = ?`,
        [sentCount, failedCount, broadcastId]
    );

    console.log(`✅ Broadcast ${broadcastId} done — ${sentCount} sent, ${failedCount} failed`);
    return { sent: sentCount, failed: failedCount };

}, {
    connection: redisConnection,
    concurrency: 2,  // max 2 broadcasts at a time
});

// ─── WORKER EVENTS ───────────────────────────────────────────────────────────

broadcastWorker.on('completed', (job, result) => {
    console.log(`✅ [Worker] Job ${job.id} completed:`, result);
});

broadcastWorker.on('failed', (job, err) => {
    console.error(`❌ [Worker] Job ${job.id} failed after ${job.attemptsMade} attempts:`, err.message);
    // Mark broadcast as failed in DB
    pool.execute(
        'UPDATE broadcasts SET status = "failed" WHERE id = ?',
        [job.data.broadcastId]
    ).catch(() => {});
});

broadcastWorker.on('progress', (job, progress) => {
    console.log(`📊 [Worker] Job ${job.id} progress: ${progress}%`);
});

broadcastWorker.on('error', err => {
    console.error('❌ [Worker] broadcastWorker error:', err.message);
});

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const buildTemplatePayload = (contact, template, phoneNumberId) => {
    const components = [];

    if (template.header_type && template.header_content) {
        if (template.header_type === 'text') {
            components.push({
                type: 'header',
                parameters: [{ type: 'text', text: template.header_content }]
            });
        } else if (['image', 'video', 'document'].includes(template.header_type)) {
            components.push({
                type: 'header',
                parameters: [{
                    type: template.header_type,
                    [template.header_type]: { link: template.header_content }
                }]
            });
        }
    }

    const variables = template.variables
        ? (typeof template.variables === 'string'
            ? JSON.parse(template.variables)
            : template.variables)
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
        ? (typeof template.buttons === 'string'
            ? JSON.parse(template.buttons)
            : template.buttons)
        : [];

    buttons.forEach((btn, index) => {
        if (btn.type === 'url' && btn.url_suffix) {
            components.push({
                type: 'button', sub_type: 'url',
                index: String(index),
                parameters: [{ type: 'text', text: btn.url_suffix }]
            });
        }
    });

    return {
        messaging_product: 'whatsapp',
        recipient_type:    'individual',
        to:                contact.phone.replace('+', ''),
        type:              'template',
        template: {
            name:       template.name,
            language:   { code: template.language || 'en_US' },
            components: components.length ? components : undefined
        }
    };
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = { broadcastWorker };
