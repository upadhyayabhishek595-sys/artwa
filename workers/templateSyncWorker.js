const cron  = require('node-cron');
const axios = require('axios');
const { pool }   = require('../config/database');
const { decrypt } = require('../config/encryption');

// ─── TEMPLATE SYNC ───────────────────────────────────────────────────────────
// Runs every 30 minutes — pulls template approval status from Meta Graph API
// for all active clients and updates DB

const startTemplateSyncScheduler = () => {
    // Every 30 minutes
    cron.schedule('*/30 * * * *', async () => {
        console.log('🔄 [TemplateSync] Starting sync...');
        try {
            await syncAllClientTemplates();
        } catch (err) {
            console.error('❌ [TemplateSync] Scheduler error:', err.message);
        }
    });

    console.log('✅ [TemplateSync] Scheduler started — syncing every 30 minutes');
};

// ─── SYNC ALL CLIENTS ────────────────────────────────────────────────────────
const syncAllClientTemplates = async () => {
    // Get all active clients that have a connected WhatsApp number
    const [clients] = await pool.execute(
        `SELECT DISTINCT c.id as client_id, pn.access_token, pn.phone_number_id,
                w.waba_id
         FROM clients c
         JOIN phone_numbers pn ON pn.client_id = c.id AND pn.status = 'active'
         JOIN whatsapp_accounts w ON w.client_id = c.id AND w.status = 'active'
         WHERE c.status IN ('active', 'trial')`
    );

    if (!clients.length) {
        console.log('ℹ️  [TemplateSync] No active clients found');
        return;
    }

    console.log(`🔄 [TemplateSync] Syncing ${clients.length} client(s)`);

    for (const client of clients) {
        try {
            await syncClientTemplates(client);
        } catch (err) {
            console.error(`❌ [TemplateSync] Failed for client ${client.client_id}:`, err.message);
        }
    }
};

// ─── SYNC ONE CLIENT ─────────────────────────────────────────────────────────
const syncClientTemplates = async (client) => {
    const accessToken = decrypt(client.access_token);

    let nextPage = null;
    let totalSynced = 0;
    let page = 1;

    do {
        // Build Meta Graph API URL
        // GET /{waba-id}/message_templates
        const url = nextPage || 
            `https://graph.facebook.com/v20.0/${client.waba_id}/message_templates` +
            `?fields=name,status,category,language,components,quality_score,rejected_reason` +
            `&limit=20`;

        const response = await axios.get(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 15000
        });

        const { data: templates, paging } = response.data;
        nextPage = paging?.next || null;

        if (!templates?.length) break;

        for (const metaTemplate of templates) {
            await upsertTemplate(client.client_id, metaTemplate);
            totalSynced++;
        }

        page++;
        await sleep(200); // avoid Meta rate limit between pages

    } while (nextPage && page <= 10); // max 10 pages = 200 templates

    console.log(`✅ [TemplateSync] Client ${client.client_id} — ${totalSynced} templates synced`);
};

// ─── UPSERT TEMPLATE ─────────────────────────────────────────────────────────
const upsertTemplate = async (clientId, metaTemplate) => {
    const {
        name,
        status,           // APPROVED | REJECTED | PENDING | PAUSED | DISABLED
        category,
        language,
        components,
        quality_score,
        rejected_reason
    } = metaTemplate;

    // Map Meta status to our DB status
    const dbStatus = mapMetaStatus(status);

    // Check if template exists in our DB
    const [existing] = await pool.execute(
        'SELECT id, status FROM templates WHERE client_id = ? AND name = ? AND language = ?',
        [clientId, name, language]
    );

    if (existing.length) {
        // Update existing template
        const prev = existing[0];

        await pool.execute(
            `UPDATE templates
             SET status = ?, meta_status = ?, category = ?,
                 components = ?, quality_score = ?, rejected_reason = ?,
                 last_synced_at = NOW()
             WHERE id = ?`,
            [
                dbStatus,
                status,
                category,
                JSON.stringify(components || []),
                quality_score?.score || null,
                rejected_reason || null,
                existing[0].id
            ]
        );

        // Log status change
        if (prev.status !== dbStatus) {
            console.log(
                `📋 [TemplateSync] Template "${name}" (client ${clientId}): ` +
                `${prev.status} → ${dbStatus}`
            );

            // Notify client via socket if status changed to APPROVED or REJECTED
            // (io not available here — store notification in DB instead)
            if (['approved', 'rejected'].includes(dbStatus)) {
                await pool.execute(
                    `INSERT INTO notifications (client_id, type, title, message, data)
                     VALUES (?, 'template_status', ?, ?, ?)
                     ON DUPLICATE KEY UPDATE created_at = NOW()`,
                    [
                        clientId,
                        dbStatus === 'approved' ? 'Template Approved ✅' : 'Template Rejected ❌',
                        dbStatus === 'approved'
                            ? `Your template "${name}" has been approved by Meta.`
                            : `Template "${name}" rejected. Reason: ${rejected_reason || 'Not specified'}`,
                        JSON.stringify({ template_name: name, language, status: dbStatus, rejected_reason })
                    ]
                ).catch(() => {}); // notifications table may not exist yet — ignore
            }
        }
    } else {
        // Insert new template discovered on Meta (not created via our platform)
        await pool.execute(
            `INSERT INTO templates
             (client_id, name, category, language, components, status, meta_status,
              quality_score, rejected_reason, last_synced_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                clientId, name, category, language,
                JSON.stringify(components || []),
                dbStatus, status,
                quality_score?.score || null,
                rejected_reason || null
            ]
        );
        console.log(`➕ [TemplateSync] New template discovered: "${name}" (client ${clientId})`);
    }
};

// ─── META STATUS → DB STATUS MAP ─────────────────────────────────────────────
const mapMetaStatus = (metaStatus) => {
    const map = {
        'APPROVED': 'approved',
        'PENDING':  'pending',
        'REJECTED': 'rejected',
        'PAUSED':   'paused',
        'DISABLED': 'disabled',
        'IN_APPEAL': 'pending',
        'PENDING_DELETION': 'pending',
    };
    return map[metaStatus] || 'pending';
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── MANUAL SYNC ROUTE HANDLER (called from routes/manage.js) ────────────────
// POST /api/manage/templates/sync  — client triggers manual sync
const manualSyncForClient = async (clientId) => {
    const [rows] = await pool.execute(
        `SELECT pn.access_token, pn.phone_number_id, w.waba_id
         FROM phone_numbers pn
         JOIN whatsapp_accounts w ON w.client_id = pn.client_id
         WHERE pn.client_id = ? AND pn.status = 'active' AND w.status = 'active'
         LIMIT 1`,
        [clientId]
    );

    if (!rows.length) throw new Error('No active phone number or WABA found');

    await syncClientTemplates({ client_id: clientId, ...rows[0] });
};

module.exports = { startTemplateSyncScheduler, manualSyncForClient };
