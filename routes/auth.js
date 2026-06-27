const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { pool } = require('../config/database');
const { verifyAdmin, verifyClient, verifyAgent, verifyReseller } = require('../middleware/auth');
const { loginLimiter, passwordLimiter }          = require('../middleware/rateLimit');
const { validate, schemas }                      = require('../middleware/validate');
const { sendAuthResponse }                       = require('../utils/tokens');

// =============================================
// ADMIN AUTH
// =============================================

router.post('/admin/login', loginLimiter, validate(schemas.adminLogin), async (req, res) => {
    try {
        const { email, password } = req.body;
console.log('DB_NAME:', process.env.DB_NAME);
console.log('DB_HOST:', process.env.DB_HOST);
        const [rows] = await pool.execute(
            'SELECT * FROM admins WHERE email = ? AND status = "active"',
            [email]
        );

        if (!rows.length)
            return res.status(401).json({ success: false, message: 'Invalid credentials' });

        const admin   = rows[0];
        const isMatch = await bcrypt.compare(password, admin.password);

        if (!isMatch)
            return res.status(401).json({ success: false, message: 'Invalid credentials' });

        await pool.execute('UPDATE admins SET last_login = NOW() WHERE id = ?', [admin.id]);

        await sendAuthResponse(res, {
            accessPayload: { id: admin.id, email: admin.email, role: admin.role, type: 'admin' },
            user: { id: admin.id, name: admin.name, email: admin.email, role: admin.role },
            userType: 'admin',
        });
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.post('/admin/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password)
            return res.status(400).json({ success: false, message: 'Name, email and password required' });

        const [existing] = await pool.execute('SELECT id FROM admins LIMIT 1');
        if (existing.length > 0)
            return res.status(403).json({ success: false, message: 'Admin already exists. Use invite system.' });

        const hashedPassword = await bcrypt.hash(password, 10);

        const [result] = await pool.execute(
            'INSERT INTO admins (name, email, password, role) VALUES (?, ?, ?, "superadmin")',
            [name, email, hashedPassword]
        );

        res.json({ success: true, message: 'Super admin created successfully', id: result.insertId });
    } catch (error) {
        console.error('Admin register error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.get('/admin/me', verifyAdmin, async (req, res) => {
    res.json({ success: true, user: req.admin });
});

// =============================================
// CLIENT AUTH
// =============================================

router.post('/client/register', (req, res) => {
    return res.status(403).json({
        success: false,
        message:  'Self-registration is disabled. Please contact your administrator to create an account.',
    });
});

router.post('/client/login', loginLimiter, validate(schemas.clientLogin), async (req, res) => {
    try {
        const { email, password } = req.body;

        const [rows] = await pool.execute(
            `SELECT c.*, p.name as plan_name, p.api_access, p.message_limit
             FROM clients c
             LEFT JOIN plans p ON c.plan_id = p.id
             WHERE c.email = ?`,
            [email]
        );

        if (!rows.length)
            return res.status(401).json({ success: false, message: 'Invalid credentials' });

        const client = rows[0];

        if (client.status === 'suspended')
            return res.status(403).json({ success: false, message: 'Account suspended. Contact support.' });

        if (client.status === 'invited')
            return res.status(403).json({ success: false, message: 'Please accept your invite and set a password first.' });

        const isMatch = await bcrypt.compare(password, client.password);
        if (!isMatch)
            return res.status(401).json({ success: false, message: 'Invalid credentials' });

        await pool.execute('UPDATE clients SET last_login = NOW() WHERE id = ?', [client.id]);

        await sendAuthResponse(res, {
            accessPayload: { id: client.id, email: client.email, type: 'client' },
            user: {
                id:            client.id,
                name:          client.name,
                email:         client.email,
                business_name: client.business_name,
                plan:          client.plan_name,
                api_access:    client.api_access,
                status:        client.status,
                trial_ends_at: client.trial_ends_at,
            },
            userType: 'client',
        });
    } catch (error) {
        console.error('Client login error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.get('/client/me', verifyClient, async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT c.id, c.name, c.email, c.business_name, c.phone,
             c.status, c.trial_ends_at, c.last_login,
             p.name as plan_name, p.api_access, p.message_limit,
             p.agent_limit, p.chatbot_access, p.broadcast_access
             FROM clients c
             LEFT JOIN plans p ON c.plan_id = p.id
             WHERE c.id = ?`,
            [req.client.id]
        );
        res.json({ success: true, user: rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/auth/client/accept-invite
router.post('/client/accept-invite', passwordLimiter, validate(schemas.acceptInvite), async (req, res) => {
    try {
        const { token, password, name } = req.body;

        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch {
            return res.status(400).json({ success: false, message: 'Invalid or expired invite token' });
        }

        if (decoded.type !== 'invite' || !decoded.client_id)
            return res.status(400).json({ success: false, message: 'Invalid invite token' });

        const [rows] = await pool.execute(
            'SELECT id, email, status FROM clients WHERE id = ? AND email = ?',
            [decoded.client_id, decoded.email]
        );
        if (!rows.length)
            return res.status(404).json({ success: false, message: 'Client not found' });

        if (rows[0].status !== 'invited')
            return res.status(400).json({ success: false, message: 'Invite already accepted' });

        const hashedPassword = await bcrypt.hash(password, 10);

        await pool.execute(
            `UPDATE clients SET password = ?, status = 'active',
             name = COALESCE(?, name), email_verified = 1
             WHERE id = ?`,
            [hashedPassword, name || null, decoded.client_id]
        );

        res.json({ success: true, message: 'Account activated. You can now log in.' });
    } catch (error) {
        console.error('Accept invite error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// =============================================
// RESELLER AUTH
// =============================================

router.post('/reseller/login', loginLimiter, validate(schemas.resellerLogin), async (req, res) => {
    try {
        const { email, password } = req.body;

        const [rows] = await pool.execute(
            'SELECT * FROM resellers WHERE email = ? AND status = "active"',
            [email]
        );

        if (!rows.length)
            return res.status(401).json({ success: false, message: 'Invalid credentials' });

        const reseller = rows[0];
        const isMatch    = await bcrypt.compare(password, reseller.password);

        if (!isMatch)
            return res.status(401).json({ success: false, message: 'Invalid credentials' });

        await pool.execute('UPDATE resellers SET last_login = NOW() WHERE id = ?', [reseller.id]);

        await sendAuthResponse(res, {
            accessPayload: { id: reseller.id, email: reseller.email, type: 'reseller' },
            user: {
                id:             reseller.id,
                name:           reseller.name,
                email:          reseller.email,
                credit_balance: reseller.credit_balance,
                markup_percent: reseller.markup_percent,
            },
            userType: 'reseller',
        });
    } catch (error) {
        console.error('Reseller login error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.get('/reseller/me', verifyReseller, async (req, res) => {
    res.json({
        success: true,
        user: {
            id:             req.reseller.id,
            name:           req.reseller.name,
            email:          req.reseller.email,
            credit_balance: req.reseller.credit_balance,
            markup_percent: req.reseller.markup_percent,
            status:         req.reseller.status,
        },
    });
});

// =============================================
// AGENT AUTH
// =============================================

router.post('/agent/login', loginLimiter, validate(schemas.agentLogin), async (req, res) => {
    try {
        const { email, password } = req.body;

        const [rows] = await pool.execute(
            `SELECT a.*, c.name as client_name, c.business_name, c.id as client_id
             FROM agents a
             JOIN clients c ON a.client_id = c.id
             WHERE a.email = ? AND a.status != 'inactive'`,
            [email]
        );

        if (!rows.length)
            return res.status(401).json({ success: false, message: 'Invalid credentials' });

        const agent   = rows[0];
        const isMatch = await bcrypt.compare(password, agent.password);

        if (!isMatch)
            return res.status(401).json({ success: false, message: 'Invalid credentials' });

        await pool.execute(
            'UPDATE agents SET status = "online", last_login = NOW() WHERE id = ?',
            [agent.id]
        );

        await sendAuthResponse(res, {
            accessPayload: {
                id:        agent.id,
                client_id: agent.client_id,
                type:      'agent',
                role:      agent.role,
            },
            user: {
                id:          agent.id,
                name:        agent.name,
                email:       agent.email,
                role:        agent.role,
                client_id:   agent.client_id,
                client_name: agent.client_name,
            },
            userType: 'agent',
        });
    } catch (error) {
        console.error('Agent login error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.get('/agent/me', verifyAgent, async (req, res) => {
    res.json({
        success: true,
        user: {
            id:        req.agent.id,
            name:      req.agent.name,
            email:     req.agent.email,
            role:      req.agent.role,
            client_id: req.agent.client_id,
            status:    req.agent.status,
        },
    });
});

router.post('/agent/logout', verifyAgent, async (req, res) => {
    try {
        await pool.execute(
            'UPDATE agents SET status = "offline" WHERE id = ?',
            [req.agent.id]
        );
        res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.post('/change-password', passwordLimiter, verifyClient, validate(schemas.changePassword), async (req, res) => {
    try {
        const { current_password, new_password } = req.body;

        const [rows] = await pool.execute(
            'SELECT password FROM clients WHERE id = ?',
            [req.client.id]
        );

        const isMatch = await bcrypt.compare(current_password, rows[0].password);
        if (!isMatch)
            return res.status(400).json({ success: false, message: 'Current password is incorrect' });

        const hashedPassword = await bcrypt.hash(new_password, 10);
        await pool.execute(
            'UPDATE clients SET password = ? WHERE id = ?',
            [hashedPassword, req.client.id]
        );

        res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
