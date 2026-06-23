const { pool } = require('../config/database');

// ✅ Verify API Key
const verifyApiKey = async (req, res, next) => {
    try {
        const apiKey = req.headers['x-api-key'];

        if (!apiKey) {
            return res.status(401).json({
                success: false,
                message: 'API key is required. Pass it in X-API-Key header'
            });
        }

        // Find API key in database
        const [rows] = await pool.execute(
            `SELECT ak.*, c.id as client_id, c.name as client_name, 
             c.status as client_status, c.plan_id
             FROM api_keys ak
             JOIN clients c ON ak.client_id = c.id
             WHERE ak.api_key = ? AND ak.status = 'active'`,
            [apiKey]
        );

        if (!rows.length) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or inactive API key'
            });
        }

        const keyData = rows[0];

        // Check if client is active
        if (keyData.client_status === 'suspended') {
            return res.status(403).json({
                success: false,
                message: 'Your account is suspended'
            });
        }

        // Check if key is expired
        if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
            return res.status(401).json({
                success: false,
                message: 'API key has expired'
            });
        }

        // Check IP whitelist if set
        if (keyData.ip_whitelist && keyData.ip_whitelist.length > 0) {
            const clientIp = req.ip || req.connection.remoteAddress;
            const allowedIps = JSON.parse(keyData.ip_whitelist);
            if (!allowedIps.includes(clientIp)) {
                return res.status(403).json({
                    success: false,
                    message: 'IP address not whitelisted'
                });
            }
        }

        // Update last used
        await pool.execute(
            'UPDATE api_keys SET last_used_at = NOW() WHERE id = ?',
            [keyData.id]
        );

        // Attach to request
        req.apiKey = keyData;
        req.client = {
            id: keyData.client_id,
            name: keyData.client_name,
            plan_id: keyData.plan_id
        };

        // Log API call
        const startTime = Date.now();
        res.on('finish', async () => {
            try {
                await pool.execute(
                    `INSERT INTO api_logs 
                     (client_id, api_key_id, method, endpoint, response_code, ip_address, duration_ms)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        keyData.client_id,
                        keyData.id,
                        req.method,
                        req.path,
                        res.statusCode,
                        req.ip,
                        Date.now() - startTime
                    ]
                );
            } catch (err) {
                console.error('Failed to log API call:', err.message);
            }
        });

        next();
    } catch (error) {
        console.error('API key verification error:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

module.exports = { verifyApiKey };
