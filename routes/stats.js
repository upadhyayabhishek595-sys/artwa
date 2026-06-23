const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { verifyClient, verifyAdmin } = require('../middleware/auth');

// GET /api/stats/overview
router.get('/overview', verifyClient, async (req, res) => {
    try {
        const clientId = req.client.id;
        const { period = '7' } = req.query;

        const [messages] = await pool.execute(
            `SELECT 
                COUNT(*) as total,
                SUM(direction = 'inbound') as inbound,
                SUM(direction = 'outbound') as outbound
             FROM messages 
             WHERE client_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
            [clientId, parseInt(period)]
        );

        const [conversations] = await pool.execute(
            `SELECT 
                COUNT(*) as total,
                SUM(status = 'open') as open,
                SUM(status = 'resolved') as resolved,
                SUM(status = 'pending') as pending,
                SUM(unread_count > 0) as unread
             FROM conversations 
             WHERE client_id = ?`,
            [clientId]
        );

        // FIX: correct param order — clientId first, then period
        const [contacts] = await pool.execute(
            `SELECT 
                COUNT(*) as total,
                SUM(opted_in = 1) as opted_in,
                SUM(created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)) as new_contacts
             FROM contacts 
             WHERE client_id = ?`,
            [parseInt(period), clientId]
        );

        const [broadcasts] = await pool.execute(
            `SELECT 
                COUNT(*) as total,
                SUM(status = 'completed') as completed,
                SUM(sent_count) as total_sent,
                SUM(delivered_count) as total_delivered,
                SUM(read_count) as total_read
             FROM broadcasts 
             WHERE client_id = ?`,
            [clientId]
        );

        const [agents] = await pool.execute(
            `SELECT 
                COUNT(*) as total,
                SUM(status = 'online') as online,
                SUM(status = 'busy') as busy,
                SUM(status = 'offline') as offline
             FROM agents 
             WHERE client_id = ?`,
            [clientId]
        );

        res.json({
            success: true,
            period_days: parseInt(period),
            data: {
                messages: messages[0],
                conversations: conversations[0],
                contacts: contacts[0],
                broadcasts: broadcasts[0],
                agents: agents[0]
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/stats/messages
router.get('/messages', verifyClient, async (req, res) => {
    try {
        const { period = '7' } = req.query;

        const [rows] = await pool.execute(
            `SELECT 
                DATE(created_at) as date,
                COUNT(*) as total,
                SUM(direction = 'inbound') as inbound,
                SUM(direction = 'outbound') as outbound
             FROM messages
             WHERE client_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
             GROUP BY DATE(created_at)
             ORDER BY date ASC`,
            [req.client.id, parseInt(period)]
        );

        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/stats/conversations
router.get('/conversations', verifyClient, async (req, res) => {
    try {
        const { period = '7' } = req.query;

        const [perDay] = await pool.execute(
            `SELECT 
                DATE(created_at) as date,
                COUNT(*) as total,
                SUM(status = 'resolved') as resolved
             FROM conversations
             WHERE client_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
             GROUP BY DATE(created_at)
             ORDER BY date ASC`,
            [req.client.id, parseInt(period)]
        );

        const [avgResponse] = await pool.execute(
            `SELECT 
                AVG(TIMESTAMPDIFF(MINUTE, created_at, first_response_at)) as avg_response_minutes
             FROM conversations
             WHERE client_id = ? 
             AND first_response_at IS NOT NULL
             AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
            [req.client.id, parseInt(period)]
        );

        const [resolution] = await pool.execute(
            `SELECT 
                COUNT(*) as total,
                SUM(status = 'resolved') as resolved,
                ROUND(SUM(status = 'resolved') / COUNT(*) * 100, 1) as resolution_rate
             FROM conversations
             WHERE client_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
            [req.client.id, parseInt(period)]
        );

        const [byStatus] = await pool.execute(
            `SELECT status, COUNT(*) as count
             FROM conversations
             WHERE client_id = ?
             GROUP BY status`,
            [req.client.id]
        );

        res.json({
            success: true,
            data: {
                per_day: perDay,
                avg_response_minutes: avgResponse[0].avg_response_minutes || 0,
                resolution: resolution[0],
                by_status: byStatus
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/stats/agents
router.get('/agents', verifyClient, async (req, res) => {
    try {
        const { period = '7' } = req.query;

        const [agentStats] = await pool.execute(
            `SELECT 
                a.id,
                a.name,
                a.email,
                a.status,
                a.role,
                COUNT(DISTINCT c.id) as total_conversations,
                SUM(c.status = 'resolved') as resolved_conversations,
                COUNT(DISTINCT m.id) as messages_sent,
                AVG(TIMESTAMPDIFF(MINUTE, c.created_at, c.first_response_at)) as avg_response_minutes
             FROM agents a
             LEFT JOIN conversations c ON c.agent_id = a.id 
                AND c.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
             LEFT JOIN messages m ON m.sent_by_agent_id = a.id
                AND m.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
             WHERE a.client_id = ?
             GROUP BY a.id
             ORDER BY resolved_conversations DESC`,
            [parseInt(period), parseInt(period), req.client.id]
        );

        res.json({ success: true, data: agentStats });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/stats/broadcasts
router.get('/broadcasts', verifyClient, async (req, res) => {
    try {
        const { period = '30' } = req.query;

        const [rows] = await pool.execute(
            `SELECT 
                b.id,
                b.name,
                b.status,
                b.total_contacts,
                b.sent_count,
                b.delivered_count,
                b.read_count,
                b.failed_count,
                ROUND(b.delivered_count / NULLIF(b.sent_count, 0) * 100, 1) as delivery_rate,
                ROUND(b.read_count / NULLIF(b.delivered_count, 0) * 100, 1) as read_rate,
                b.created_at
             FROM broadcasts b
             WHERE b.client_id = ? AND b.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
             ORDER BY b.created_at DESC`,
            [req.client.id, parseInt(period)]
        );

        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/stats/admin
router.get('/admin', verifyAdmin, async (req, res) => {
    try {
        const { period = '30' } = req.query;

        const [clients] = await pool.execute(
            `SELECT 
                COUNT(*) as total,
                SUM(status = 'active') as active,
                SUM(status = 'trial') as trial,
                SUM(status = 'suspended') as suspended,
                SUM(created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)) as new_clients
             FROM clients`,
            [parseInt(period)]
        );

        const [messages] = await pool.execute(
            `SELECT COUNT(*) as total
             FROM messages
             WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
            [parseInt(period)]
        );

        const [broadcasts] = await pool.execute(
            `SELECT COUNT(*) as total, SUM(sent_count) as total_sent
             FROM broadcasts
             WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
            [parseInt(period)]
        );

        const [topClients] = await pool.execute(
            `SELECT c.id, c.name, c.business_name, COUNT(m.id) as message_count
             FROM clients c
             LEFT JOIN messages m ON m.client_id = c.id
                AND m.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
             GROUP BY c.id
             ORDER BY message_count DESC
             LIMIT 10`,
            [parseInt(period)]
        );

        res.json({
            success: true,
            data: {
                clients: clients[0],
                messages: messages[0],
                broadcasts: broadcasts[0],
                top_clients: topClients
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
