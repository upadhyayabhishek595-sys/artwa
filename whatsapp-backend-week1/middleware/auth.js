const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

// ✅ Verify Admin Token
const verifyAdmin = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ success: false, message: 'No token provided' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.role !== 'admin' && decoded.role !== 'superadmin') {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }

        const [rows] = await pool.execute(
            'SELECT id, name, email, role, status FROM admins WHERE id = ? AND status = "active"',
            [decoded.id]
        );

        if (!rows.length) {
            return res.status(401).json({ success: false, message: 'Admin not found or inactive' });
        }

        req.admin = rows[0];
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
};

// ✅ Verify Client Token
const verifyClient = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ success: false, message: 'No token provided' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.type !== 'client') {
            return res.status(403).json({ success: false, message: 'Client access required' });
        }

        const [rows] = await pool.execute(
            'SELECT id, name, email, business_name, plan_id, status FROM clients WHERE id = ? AND status != "suspended"',
            [decoded.id]
        );

        if (!rows.length) {
            return res.status(401).json({ success: false, message: 'Client not found or suspended' });
        }

        req.client = rows[0];
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
};

// ✅ Verify Agent Token
const verifyAgent = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ success: false, message: 'No token provided' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.type !== 'agent') {
            return res.status(403).json({ success: false, message: 'Agent access required' });
        }

        const [rows] = await pool.execute(
            'SELECT id, client_id, name, email, role, status FROM agents WHERE id = ? AND status != "inactive"',
            [decoded.id]
        );

        if (!rows.length) {
            return res.status(401).json({ success: false, message: 'Agent not found or inactive' });
        }

        req.agent = rows[0];
        req.client = { id: rows[0].client_id };
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
};

// ✅ Verify Client OR Agent Token
const verifyClientOrAgent = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ success: false, message: 'No token provided' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (decoded.type === 'client') {
            const [rows] = await pool.execute(
                'SELECT id, name, email, plan_id FROM clients WHERE id = ? AND status != "suspended"',
                [decoded.id]
            );
            if (!rows.length) return res.status(401).json({ success: false, message: 'Unauthorized' });
            req.client = rows[0];
            req.userType = 'client';
        } else if (decoded.type === 'agent') {
            const [rows] = await pool.execute(
                'SELECT id, client_id, name, email, role FROM agents WHERE id = ? AND status != "inactive"',
                [decoded.id]
            );
            if (!rows.length) return res.status(401).json({ success: false, message: 'Unauthorized' });
            req.agent = rows[0];
            req.client = { id: rows[0].client_id };
            req.userType = 'agent';
        } else {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
};

module.exports = { verifyAdmin, verifyClient, verifyAgent, verifyClientOrAgent };
