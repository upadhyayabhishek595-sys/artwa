const cron = require('node-cron');
const { pool } = require('../config/database');
const { broadcastQueue } = require('../queues/broadcastQueue');

// ─── SCHEDULER ───────────────────────────────────────────────────────────────
// Runs every minute — finds scheduled broadcasts due to fire and enqueues them

const startScheduler = () => {
    cron.schedule('* * * * *', async () => {
        try {
            // Find drafts where scheduled_at <= now
            const [dueBroadcasts] = await pool.execute(
                `SELECT id, client_id, name FROM broadcasts
                 WHERE status = 'draft'
                 AND scheduled_at IS NOT NULL
                 AND scheduled_at <= NOW()`
            );

            if (!dueBroadcasts.length) return;

            console.log(`⏰ [Scheduler] ${dueBroadcasts.length} broadcast(s) due`);

            for (const broadcast of dueBroadcasts) {
                // Mark as queued immediately so next cron tick doesn't re-enqueue
                await pool.execute(
                    'UPDATE broadcasts SET status = "queued" WHERE id = ?',
                    [broadcast.id]
                );

                // Add to BullMQ queue
                await broadcastQueue.add(
                    `scheduled-broadcast-${broadcast.id}`,
                    { broadcastId: broadcast.id, clientId: broadcast.client_id },
                    { jobId: `broadcast-${broadcast.id}` } // prevent duplicate jobs
                );

                console.log(`📤 [Scheduler] Enqueued broadcast ${broadcast.id} (${broadcast.name})`);
            }

        } catch (err) {
            console.error('❌ [Scheduler] Error:', err.message);
        }
    });

    console.log('⏰ [Scheduler] Broadcast scheduler started — checking every minute');
};

module.exports = { startScheduler };
