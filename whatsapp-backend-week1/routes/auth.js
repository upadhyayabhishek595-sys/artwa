const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { verifyAdmin, verifyClient, verifyAgent } = require('../middleware/auth');

// =============================================
// ADMIN AUTH
// =============================================

// POST /api/auth/admin/login
router.post('/admin/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password required' });
        }

        const [rows] = await pool.execute(
            'SELECT * FROM admins WHERE email = ? AND status = "active"',
            [email]
        );

        if (!rows.length) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const admin = rows[0];
        const isMatch = await bcrypt.compare(password, admin.password);

        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        // Update last login
        await pool.execute('UPDATE admins SET last_login = NOW() WHERE id = ?', [admin.id]);

        const token = jwt.sign(
            { id: admin.id, email: admin.email, role: admin.role, type: 'admin' },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN }
        );

        res.json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                id: admin.id,
                name: admin.name,
                email: admin.email,
                role: admin.role
            }
        });
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/auth/admin/register (First time setup only)
router.post('/admin/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Check if any admin exists
        const [existing] = await pool.execute('SELECT id FROM admins LIMIT 1');
        if (existing.length > 0) {
            return res.status(403).json({ success: false, message: 'Admin already exists. Use invite system.' });
        }

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

// GET /api/auth/admin/me
router.get('/admin/me', verifyAdmin, async (req, res) => {
    res.json({ success: true, user: req.admin });
});

// =============================================
// CLIENT AUTH
// =============================================

// POST /api/auth/client/register
router.post('/client/register', async (req, res) => {
    try {
        const { name, business_name, email, password, phone } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ success: false, message: 'Name, email and password required' });
        }

        // Check if email exists
        const [existing] = await pool.execute(
            'SELECT id FROM clients WHERE email = ?', [email]
        );
        if (existing.length) {
            return res.status(400).json({ success: false, message: 'Email already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Get starter plan
        const [plans] = await pool.execute(
            'SELECT id FROM plans WHERE name = "Starter" LIMIT 1'
        );
        const planId = plans.length ? plans[0].id : null;

        // Set trial end date (14 days)
        const trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + 14);

        const [result] = await pool.execute(
            `INSERT INTO clients 
             (name, business_name, email, password, phone, plan_id, status, trial_ends_at) 
             VALUES (?, ?, ?, ?, ?, ?, 'trial', ?)`,
            [name, business_name, email, hashedPassword, phone, planId, trialEndsAt]
        );

        // Create default settings for client
        await pool.execute(
            'INSERT INTO client_settings (client_id) VALUES (?)',
            [result.insertId]
        );

        const token = jwt.sign(
            { id: result.insertId, email, type: 'client' },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN }
        );

        res.status(201).json({
            success: true,
            message: 'Account created successfully. 14-day trial started!',
            token,
            user: { id: result.insertId, name, email, business_name }
        });
    } catch (error) {
        console.error('Client register error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/auth/client/login
router.post('/client/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password required' });
        }

        const [rows] = await pool.execute(
            `SELECT c.*, p.name as plan_name, p.api_access, p.message_limit 
             FROM clients c
             LEFT JOIN plans p ON c.plan_id = p.id
             WHERE c.email = ?`,
            [email]
        );

        if (!rows.length) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const client = rows[0];

        if (client.status === 'suspended') {
            return res.status(403).json({ success: false, message: 'Account suspended. Contact support.' });
        }

        const isMatch = await bcrypt.compare(password, client.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        await pool.execute('UPDATE clients SET last_login = NOW() WHERE id = ?', [client.id]);

        const token = jwt.sign(
            { id: client.id, email: client.email, type: 'client' },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN }
        );

        res.json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                id: client.id,
                name: client.name,
                email: client.email,
                business_name: client.business_name,
                plan: client.plan_name,
                api_access: client.api_access,
                status: client.status,
                trial_ends_at: client.trial_ends_at
            }
        });
    } catch (error) {
        console.error('Client login error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/auth/client/me
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

// =============================================
// AGENT AUTH
// =============================================

// POST /api/auth/agent/login
router.post('/agent/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password required' });
        }

        const [rows] = await pool.execute(
            `SELECT a.*, c.name as client_name, c.business_name 
             FROM agents a
             JOIN clients c ON a.client_id = c.id
             WHERE a.email = ? AND a.status != 'inactive'`,
            [email]
        );

        if (!rows.length) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const agent = rows[0];
        const isMatch = await bcrypt.compare(password, agent.password);

        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        // Set agent online
        await pool.execute(
            'UPDATE agents SET status = "online", last_login = NOW() WHERE id = ?',
            [agent.id]
        );

        const token = jwt.sign(
            { id: agent.id, client_id: agent.client_id, type: 'agent', role: agent.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN }
        );

        res.json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                id: agent.id,
                name: agent.name,
                email: agent.email,
                role: agent.role,
                client_name: agent.client_name
            }
        });
    } catch (error) {
        console.error('Agent login error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/auth/agent/logout
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

// POST /api/auth/change-password
router.post('/change-password', verifyClient, async (req, res) => {
    try {
        const { current_password, new_password } = req.body;

        const [rows] = await pool.execute(
            'SELECT password FROM clients WHERE id = ?', [req.client.id]
        );

        const isMatch = await bcrypt.compare(current_password, rows[0].password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Current password is incorrect' });
        }

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
