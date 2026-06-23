

const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

// =============================================
// GENERIC TOKEN AUTH
// =============================================

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access token required'
    });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(403).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
};

// =============================================
// ADMIN
// =============================================

const verifyAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token)
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.type !== 'admin')
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });

    const [rows] = await pool.execute(
      `SELECT id,name,email,role,status
       FROM admins
       WHERE id=? AND status='active'`,
      [decoded.id]
    );

    if (!rows.length)
      return res.status(403).json({
        success: false,
        message: 'Admin not found'
      });

    req.user = decoded;
    req.admin = rows[0];

    next();

  } catch (err) {
    return res.status(403).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
};

// =============================================
// CLIENT
// =============================================

const verifyClient = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token)
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.type !== 'client')
      return res.status(403).json({
        success: false,
        message: 'Client access required'
      });

    const [rows] = await pool.execute(
      `SELECT
        c.*,
        p.name AS plan_name,
        p.api_access,
        p.agent_limit,
        p.message_limit,
        p.chatbot_access,
        p.broadcast_access
      FROM clients c
      LEFT JOIN plans p
      ON c.plan_id=p.id
      WHERE c.id=?`,
      [decoded.id]
    );

    if (!rows.length)
      return res.status(403).json({
        success: false,
        message: 'Client not found'
      });

    if (rows[0].status === 'suspended')
      return res.status(403).json({
        success: false,
        message: 'Account suspended'
      });

    req.user = decoded;
    req.client = rows[0];

    next();

  } catch (err) {
    return res.status(403).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
};

// =============================================
// RESELLER
// =============================================

const verifyReseller = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token)
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.type !== 'reseller')
      return res.status(403).json({
        success: false,
        message: 'Reseller access required'
      });

    const [rows] = await pool.execute(
      `SELECT *
       FROM resellers
       WHERE id=?
       AND status='active'`,
      [decoded.id]
    );

    if (!rows.length)
      return res.status(403).json({
        success: false,
        message: 'Reseller not found'
      });

    req.user = decoded;
    req.reseller = rows[0];

    next();

  } catch (err) {
    return res.status(403).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
};

// =============================================
// AGENT
// =============================================

const verifyAgent = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token)
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.type !== 'agent')
      return res.status(403).json({
        success: false,
        message: 'Agent access required'
      });

    const [rows] = await pool.execute(
      `SELECT *
       FROM agents
       WHERE id=?
       AND status!='inactive'`,
      [decoded.id]
    );

    if (!rows.length)
      return res.status(403).json({
        success: false,
        message: 'Agent not found'
      });

    req.user = decoded;
    req.agent = rows[0];

    next();

  } catch (err) {
    return res.status(403).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
};

// =============================================
// CLIENT OR ADMIN
// =============================================

const verifyClientOrAdmin = async (req, res, next) => {

  const token = req.headers.authorization?.split(' ')[1];

  if (!token)
    return res.status(401).json({
      success: false,
      message: 'Access token required'
    });

  try {

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.type === 'admin') {
      return verifyAdmin(req, res, next);
    }

    if (decoded.type === 'client') {
      return verifyClient(req, res, next);
    }

    return res.status(403).json({
      success: false,
      message: 'Access denied'
    });

  } catch (err) {
    return res.status(403).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
};

const verifyClientOrAgent = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token)
    return res.status(401).json({ success: false, message: 'Access token required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type === 'client') return verifyClient(req, res, next);
    if (decoded.type === 'agent')  return verifyAgent(req, res, next);
    return res.status(403).json({ success: false, message: 'Access denied' });
  } catch {
    return res.status(403).json({ success: false, message: 'Invalid or expired token' });
  }
};

module.exports = {
  authenticateToken,
  verifyAdmin,
  verifyClient,
  verifyReseller,
  verifyAgent,
  verifyClientOrAdmin,
  verifyClientOrAgent,

  // aliases
  isAdmin: verifyAdmin,
  isClient: verifyClient,
  isReseller: verifyReseller,
  isAgent: verifyAgent
};