const express  = require('express');
const router   = express.Router();
const { pool } = require('../config/database');
const { verifyAdmin, verifyClient } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');
const { auditLog } = require('../middleware/auditLog');

const generateInvoiceNumber = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const rand = Math.floor(Math.random() * 90000) + 10000;
  return `INV-${y}${m}-${rand}`;
};

// GET /api/billing/invoices — admin: all, client: own
router.get('/invoices', verifyClient, async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const offset = (page - 1) * limit;
    let where  = 'WHERE client_id = ?';
    let params = [req.client.id];
    if (status) { where += ' AND status = ?'; params.push(status); }

    const [rows] = await pool.execute(
      `SELECT * FROM invoices ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET client invoices error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/admin/invoices', verifyAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, client_id } = req.query;
    const offset = (page - 1) * limit;
    let where  = 'WHERE 1=1';
    let params = [];
    if (status)    { where += ' AND i.status = ?';     params.push(status); }
    if (client_id) { where += ' AND i.client_id = ?';  params.push(client_id); }

    const [rows] = await pool.execute(
      `SELECT i.*, c.name as client_name, c.email as client_email
       FROM invoices i
       JOIN clients c ON i.client_id = c.id
       ${where}
       ORDER BY i.created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/billing/invoices/:id
router.get('/invoices/:id', verifyClient, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM invoices WHERE id = ? AND client_id = ?',
      [req.params.id, req.client.id]
    );
    if (!rows.length)
      return res.status(404).json({ success: false, message: 'Invoice not found' });

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/billing/invoices — admin creates invoice (e.g. credit purchase)
router.post('/invoices', verifyAdmin, auditLog('create_invoice'), validate(schemas.createInvoice), async (req, res) => {
  try {
    const { client_id, amount, tax = 0, notes, due_date, subscription_id } = req.body;
    const taxAmt  = parseFloat(tax) || 0;
    const amt     = parseFloat(amount);
    const total   = amt + taxAmt;
    const invNum  = generateInvoiceNumber();

    const [result] = await pool.execute(
      `INSERT INTO invoices
         (client_id, subscription_id, invoice_number, amount, tax, total, due_date, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'sent', ?)`,
      [
        client_id,
        subscription_id || null,
        invNum,
        amt,
        taxAmt,
        total,
        due_date || null,
        notes || null,
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Invoice created',
      data: { id: result.insertId, invoice_number: invNum, total },
    });
  } catch (err) {
    console.error('Create invoice error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PATCH /api/billing/invoices/:id/mark-paid — admin
router.patch('/invoices/:id/mark-paid', verifyAdmin, auditLog('mark_invoice_paid'), async (req, res) => {
  try {
    const { payment_method, transaction_id } = req.body;

    const [rows] = await pool.execute('SELECT * FROM invoices WHERE id = ?', [req.params.id]);
    if (!rows.length)
      return res.status(404).json({ success: false, message: 'Invoice not found' });

    await pool.execute(
      `UPDATE invoices SET status = 'paid', paid_at = NOW(),
         payment_method = ?, transaction_id = ?
       WHERE id = ?`,
      [payment_method || null, transaction_id || null, req.params.id]
    );

    res.json({ success: true, message: 'Invoice marked as paid' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/billing/invoices/:id/cancel — admin
router.patch('/invoices/:id/cancel', verifyAdmin, auditLog('cancel_invoice'), async (req, res) => {
  try {
    await pool.execute(
      `UPDATE invoices SET status = 'cancelled' WHERE id = ? AND status IN ('draft', 'sent', 'overdue')`,
      [req.params.id]
    );
    res.json({ success: true, message: 'Invoice cancelled' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
