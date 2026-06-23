const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { verifyClient, verifyClientOrAgent } = require('../middleware/auth');

const getClientId = (req) => req.client?.id || req.agent?.client_id;

// GET /api/conversations
router.get('/', verifyClientOrAgent, async (req, res) => {
    try {
        const clientId = getClientId(req);
        const { status, page = 1, limit = 20, search, assigned_to_me } = req.query;
        const offset = (page - 1) * limit;

        let where = 'WHERE c.client_id = ?';
        let params = [clientId];

        if (req.agent && assigned_to_me === '1') {
            where += ' AND c.agent_id = ?';
            params.push(req.agent.id);
        }

        if (status) { where += ' AND c.status = ?'; params.push(status); }
        if (search) {
            where += ' AND (ct.name LIKE ? OR ct.phone LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }

        const [conversations] = await pool.execute(
            `SELECT c.*,
                    ct.name as contact_name, ct.phone as contact_phone,
                    p.phone_number as business_phone,
                    a.name as assigned_agent_name
             FROM conversations c
             LEFT JOIN contacts ct ON c.contact_id = ct.id
             LEFT JOIN phone_numbers p ON c.phone_number_id = p.id
             LEFT JOIN agents a ON c.agent_id = a.id
             ${where}
             ORDER BY c.last_message_at DESC
             LIMIT ? OFFSET ?`,
            [...params, parseInt(limit), parseInt(offset)]
        );

        const [countRows] = await pool.execute(
            `SELECT COUNT(*) as total FROM conversations c
             LEFT JOIN contacts ct ON c.contact_id = ct.id
             ${where}`,
            params
        );

        res.json({
            success: true,
            data: conversations,
            pagination: {
                total: countRows[0].total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(countRows[0].total / limit)
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/conversations/:id
router.get('/:id', verifyClientOrAgent, async (req, res) => {
    try {
        const clientId = getClientId(req);
        const [rows] = await pool.execute(
            `SELECT c.*,
                    ct.name as contact_name, ct.phone as contact_phone, ct.email as contact_email,
                    p.phone_number as business_phone,
                    a.name as assigned_agent_name
             FROM conversations c
             LEFT JOIN contacts ct ON c.contact_id = ct.id
             LEFT JOIN phone_numbers p ON c.phone_number_id = p.id
             LEFT JOIN agents a ON c.agent_id = a.id
             WHERE c.id = ? AND c.client_id = ?`,
            [req.params.id, clientId]
        );

        if (!rows.length)
            return res.status(404).json({ success: false, message: 'Conversation not found' });

        res.json({ success: true, data: rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// PATCH /api/conversations/:id/read — reset unread count
router.patch('/:id/read', verifyClientOrAgent, async (req, res) => {
    try {
        const clientId = getClientId(req);
        await pool.execute(
            'UPDATE conversations SET unread_count = 0 WHERE id = ? AND client_id = ?',
            [req.params.id, clientId]
        );
        res.json({ success: true, message: 'Conversation marked as read' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// PATCH /api/conversations/:id/status
router.patch('/:id/status', verifyClient, async (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['open', 'resolved', 'pending', 'bot'];

        if (!validStatuses.includes(status))
            return res.status(400).json({ success: false, message: 'Invalid status' });

        await pool.execute(
            'UPDATE conversations SET status = ?, resolved_at = IF(? = "resolved", NOW(), resolved_at) WHERE id = ? AND client_id = ?',
            [status, status, req.params.id, req.client.id]
        );

        res.json({ success: true, message: `Conversation marked as ${status}` });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// PATCH /api/conversations/:id/assign
router.patch('/:id/assign', verifyClient, async (req, res) => {
    try {
        const { agent_id } = req.body;

        await pool.execute(
            'UPDATE conversations SET agent_id = ?, assigned_at = NOW(), status = "open" WHERE id = ? AND client_id = ?',
            [agent_id || null, req.params.id, req.client.id]
        );

        const io = req.app.get('io');
        if (io && agent_id) {
            io.to(`agent_${agent_id}`).emit('conversation_assigned', {
                conversation_id: parseInt(req.params.id),
                agent_id,
            });
        }

        res.json({ success: true, message: 'Conversation assigned successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// DELETE /api/conversations/:id
router.delete('/:id', verifyClient, async (req, res) => {
    try {
        await pool.execute(
            'DELETE FROM conversations WHERE id = ? AND client_id = ?',
            [req.params.id, req.client.id]
        );
        res.json({ success: true, message: 'Conversation deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
