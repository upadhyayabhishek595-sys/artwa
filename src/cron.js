const cron   = require('node-cron');
const axios  = require('axios');
const { pool }    = require('../config/database');
const { decrypt } = require('../config/encryption');

// ─── HELPER: same processBroadcast logic (inline, no circular import) ─────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const buildTemplatePayload = (contact, template, phoneNumberId) => {
  const components = [];

  if (template.header_type && template.header_content) {
    if (template.header_type === 'text') {
      components.push({ type: 'header', parameters: [{ type: 'text', text: template.header_content }] });
    } else if (['image', 'video', 'document'].includes(template.header_type)) {
      components.push({
        type: 'header',
        parameters: [{ type: template.header_type, [template.header_type]: { link: template.header_content } }],
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
        text: v === '{{name}}' ? (contact.name || contact.phone) : v,
      })),
    });
  }

  return {
    messaging_product: 'whatsapp',
    recipient_type:    'individual',
    to:                contact.phone.replace('+', ''),
    type:              'template',
    template: {
      name:       template.name,
      language:   { code: template.language || 'en_US' },
      components: components.length ? components : undefined,
    },
  };
};

const processBroadcast = async (broadcast, template, phoneRecord) => {
  const clientId    = broadcast.client_id;
  const broadcastId = broadcast.id;

  try {
    console.log(`🕐 Cron: starting scheduled broadcast #${broadcastId}`);

    await pool.execute(
      'UPDATE broadcasts SET status = "running", started_at = NOW() WHERE id = ?',
      [broadcastId]
    );

    const [contactRows] = await pool.execute(
      `SELECT bc.contact_id as id, c.phone, c.name
       FROM broadcast_contacts bc
       JOIN contacts c ON bc.contact_id = c.id
       WHERE bc.broadcast_id = ? AND bc.status = 'pending'`,
      [broadcastId]
    );

    if (!contactRows.length) {
      await pool.execute(
        'UPDATE broadcasts SET status = "completed", completed_at = NOW() WHERE id = ?',
        [broadcastId]
      );
      return;
    }

    const accessToken = decrypt(phoneRecord.access_token);
    let sentCount = 0, failedCount = 0;

    for (const contact of contactRows) {
      // Respect pause
      const [check] = await pool.execute(
        'SELECT status FROM broadcasts WHERE id = ?', [broadcastId]
      );
      if (check[0]?.status === 'paused') {
        console.log(`⏸ Cron: broadcast #${broadcastId} paused at ${sentCount}`);
        return;
      }

      await sleep(100);

      try {
        const payload  = buildTemplatePayload(contact, template, phoneRecord.phone_number_id);
        const metaRes  = await axios.post(
          `https://graph.facebook.com/v20.0/${phoneRecord.phone_number_id}/messages`,
          payload,
          { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, timeout: 10000 }
        );

        const wamid = metaRes.data?.messages?.[0]?.id;
        await pool.execute(
          `UPDATE broadcast_contacts SET status = 'sent', wamid = ?, sent_at = NOW()
           WHERE broadcast_id = ? AND contact_id = ?`,
          [wamid, broadcastId, contact.id]
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
             VALUES (?, 'deduction', ?, 'Scheduled broadcast (MARKETING)')`,
            [clientId, cost]
          );
        }

        sentCount++;
        if (sentCount % 10 === 0)
          await pool.execute('UPDATE broadcasts SET sent_count = ? WHERE id = ?', [sentCount, broadcastId]);

      } catch (err) {
        failedCount++;
        const errMsg = err.response?.data?.error?.message || err.message;
        await pool.execute(
          `UPDATE broadcast_contacts SET status = 'failed', error_message = ?
           WHERE broadcast_id = ? AND contact_id = ?`,
          [errMsg, broadcastId, contact.id]
        );
        console.error(`❌ Cron broadcast #${broadcastId} failed for ${contact.phone}:`, errMsg);
      }
    }

    await pool.execute(
      `UPDATE broadcasts SET status = 'completed', sent_count = ?, failed_count = ?, completed_at = NOW()
       WHERE id = ?`,
      [sentCount, failedCount, broadcastId]
    );
    console.log(`✅ Cron: broadcast #${broadcastId} done — ${sentCount} sent, ${failedCount} failed`);

  } catch (err) {
    console.error(`❌ Cron processBroadcast error for #${broadcastId}:`, err.message);
    await pool.execute('UPDATE broadcasts SET status = "failed" WHERE id = ?', [broadcastId]);
  }
};

// ─── CRON: every minute — pick up due scheduled broadcasts ───────────────────

const startCron = () => {
  cron.schedule('* * * * *', async () => {
    try {
      // Find all broadcasts scheduled for now or past, still in draft
      const [dueBroadcasts] = await pool.execute(
        `SELECT b.*, t.*, pn.access_token, pn.phone_number_id as pn_id
         FROM broadcasts b
         JOIN templates t ON b.template_id = t.id
         JOIN phone_numbers pn ON b.phone_number_id = pn.id
         WHERE b.status = 'draft'
           AND b.scheduled_at IS NOT NULL
           AND b.scheduled_at <= NOW()`
      );

      if (!dueBroadcasts.length) return;

      console.log(`🕐 Cron: ${dueBroadcasts.length} scheduled broadcast(s) due`);

      for (const row of dueBroadcasts) {
        const broadcast   = { id: row.id, client_id: row.client_id, template_id: row.template_id };
        const template    = {
          name: row.name, language: row.language, category: row.category,
          header_type: row.header_type, header_content: row.header_content,
          variables: row.variables, buttons: row.buttons,
        };
        const phoneRecord = { access_token: row.access_token, phone_number_id: row.pn_id };

        // Fire and forget — don't await so cron tick stays fast
        processBroadcast(broadcast, template, phoneRecord)
          .catch(err => console.error(`❌ Cron broadcast #${row.id} unhandled:`, err.message));
      }

    } catch (err) {
      console.error('❌ Cron tick error:', err.message);
    }
  });

  console.log('⏰ Broadcast cron scheduler started (every minute)');
};

module.exports = { startCron };