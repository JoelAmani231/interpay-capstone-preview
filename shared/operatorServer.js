// shared/operatorServer.js — Factory creating an Express server for any operator
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const express   = require('express');
const bcrypt    = require('bcrypt');
const jwt       = require('jsonwebtoken');
const helmet    = require('helmet');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');
const db        = require('./db');

function createOperatorServer(config) {
  const { name, code, prefix, table, port } = config;
  const INTERNAL_SECRET = process.env.INTERNAL_SECRET || 'interpay_internal_key_2024';
  const JWT_SECRET      = process.env.JWT_SECRET      || 'interpay_jwt_secret_2024';
  const WELCOME_BALANCE = 10000; // XOF offerts à chaque nouveau compte

  const app = express();
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(cors({ origin: '*' }));
  app.use(express.json({ limit: '10kb' }));
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: parseInt(process.env.OPERATOR_RATE_LIMIT_MAX) || 200,
    message: { success: false, error: 'Too many requests.' } }));

  // ── Internal auth middleware ──────────────────────────────
  const internalOnly = (req, res, next) => {
    if (req.headers['x-internal-secret'] !== INTERNAL_SECRET)
      return res.status(403).json({ success: false, error: 'Forbidden.' });
    next();
  };

  // ═══════════════════════════════════════════════════════
  // PUBLIC ROUTES
  // ═══════════════════════════════════════════════════════

  app.get('/health', (req, res) =>
    res.json({ success: true, operator: name, code, prefix, port }));

  // POST /auth/register — 10 000 XOF offerts à l'inscription
  app.post('/auth/register', async (req, res) => {
    const { phone, full_name, pin } = req.body;
    if (!phone || !full_name || !pin)
      return res.status(400).json({ success: false, error: 'phone, full_name and pin are required.' });
    const prefixes = prefix.split('|');
    const phoneStr = String(phone);
    const validPrefix = prefixes.some(p => phoneStr.startsWith(p));
    if (!validPrefix)
      return res.status(400).json({ success: false, error: `${name} numbers must start with ${prefixes.join(', ')}.` });
    if (String(pin).length !== 4 || isNaN(pin))
      return res.status(400).json({ success: false, error: 'PIN must be exactly 4 digits.' });

    try {
      const [[existing]] = await db.execute(`SELECT id FROM ${table} WHERE phone = ?`, [phone]);
      if (existing)
        return res.status(409).json({ success: false, error: 'This phone is already registered.' });

      const pin_hash = await bcrypt.hash(String(pin), 10);
      const [result] = await db.execute(
        `INSERT INTO ${table} (phone, full_name, pin_hash, balance) VALUES (?, ?, ?, ?)`,
        [phone, full_name.trim(), pin_hash, WELCOME_BALANCE]
      );
      const token = jwt.sign({ userId: result.insertId, operator: code, phone: phone }, JWT_SECRET, { expiresIn: '24h' });
      return res.status(201).json({
        success: true,
        data: {
          token,
          user: { id: result.insertId, name: full_name.trim(), phone, balance: WELCOME_BALANCE, operator: code }
        }
      });
    } catch (err) {
      console.error(`[${code} register]`, err.message);
      return res.status(500).json({ success: false, error: 'Server error.' });
    }
  });

  // POST /auth/login
  app.post('/auth/login', async (req, res) => {
    const { phone, pin } = req.body;
    if (!phone || !pin)
      return res.status(400).json({ success: false, error: 'phone and pin are required.' });
    try {
      const [[user]] = await db.execute(`SELECT * FROM ${table} WHERE phone = ?`, [phone]);
      if (!user) return res.status(401).json({ success: false, error: 'Phone number not found.' });
      const valid = await bcrypt.compare(String(pin), user.pin_hash);
      if (!valid) return res.status(401).json({ success: false, error: 'Incorrect PIN.' });

      // Update login stats
      await db.execute(
        `UPDATE ${table} SET last_login = NOW(), login_count = login_count + 1 WHERE id = ?`,
        [user.id]
      );

      const token = jwt.sign({ userId: user.id, operator: code, phone: user.phone }, JWT_SECRET, { expiresIn: '24h' });
      return res.json({
        success: true,
        data: {
          token,
          user: {
            id: user.id, name: user.full_name, phone: user.phone,
            balance: parseFloat(user.balance), operator: code,
            login_count: (user.login_count || 0) + 1,
            last_login: new Date().toISOString(),
          }
        }
      });
    } catch (err) {
      console.error(`[${code} login]`, err.message);
      return res.status(500).json({ success: false, error: 'Server error.' });
    }
  });

  // ═══════════════════════════════════════════════════════
  // INTERNAL ROUTES (Gateway → Operator only)
  // ═══════════════════════════════════════════════════════

  // GET /internal/account/:phone
  app.get('/internal/account/:phone', internalOnly, async (req, res) => {
    try {
      const [[user]] = await db.execute(
        `SELECT id, phone, full_name, balance FROM ${table} WHERE phone = ?`, [req.params.phone]);
      if (!user) return res.status(404).json({ success: false, error: 'Account not found.' });
      return res.json({ success: true, data: { ...user, balance: parseFloat(user.balance), operator: code } });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /internal/debit — Body: { phone, amount, pin? }
  app.post('/internal/debit', internalOnly, async (req, res) => {
    const { phone, amount, pin } = req.body;
    if (!phone || !amount)
      return res.status(400).json({ success: false, error: 'phone and amount required.' });
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0)
      return res.status(400).json({ success: false, error: 'Invalid amount.' });

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [[user]] = await conn.execute(`SELECT * FROM ${table} WHERE phone = ? FOR UPDATE`, [phone]);
      if (!user) { await conn.rollback(); return res.status(404).json({ success: false, error: 'Account not found.' }); }

      // Verify PIN if provided
      if (pin) {
        const valid = await bcrypt.compare(String(pin), user.pin_hash);
        if (!valid) { await conn.rollback(); return res.status(401).json({ success: false, error: 'Incorrect PIN.' }); }
      }

      if (parseFloat(user.balance) < numAmount) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          error: `Insufficient balance. Required: ${numAmount.toLocaleString()} XOF.`
        });
      }

      await conn.execute(`UPDATE ${table} SET balance = balance - ? WHERE phone = ?`, [numAmount, phone]);
      await conn.commit();
      const [[updated]] = await db.execute(`SELECT balance FROM ${table} WHERE phone = ?`, [phone]);
      return res.json({ success: true, data: { phone, debited: numAmount, newBalance: parseFloat(updated.balance), operator: code } });
    } catch (err) {
      await conn.rollback();
      return res.status(500).json({ success: false, error: err.message });
    } finally {
      conn.release();
    }
  });

  // POST /internal/credit — Body: { phone, amount }
  app.post('/internal/credit', internalOnly, async (req, res) => {
    const { phone, amount } = req.body;
    if (!phone || !amount)
      return res.status(400).json({ success: false, error: 'phone and amount required.' });
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0)
      return res.status(400).json({ success: false, error: 'Invalid amount.' });
    try {
      const [[user]] = await db.execute(`SELECT id FROM ${table} WHERE phone = ?`, [phone]);
      if (!user) return res.status(404).json({ success: false, error: `Account not found on ${name} network.` });
      await db.execute(`UPDATE ${table} SET balance = balance + ? WHERE phone = ?`, [numAmount, phone]);
      const [[updated]] = await db.execute(`SELECT balance FROM ${table} WHERE phone = ?`, [phone]);
      return res.json({ success: true, data: { phone, credited: numAmount, newBalance: parseFloat(updated.balance), operator: code } });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /internal/change-pin — Body: { phone, old_pin, new_pin }
  app.post('/internal/change-pin', internalOnly, async (req, res) => {
    const { phone, old_pin, new_pin } = req.body;
    if (!phone || !old_pin || !new_pin)
      return res.status(400).json({ success: false, error: 'phone, old_pin and new_pin are required.' });
    if (String(new_pin).length !== 4 || isNaN(new_pin))
      return res.status(400).json({ success: false, error: 'New PIN must be exactly 4 digits.' });
    try {
      const [[user]] = await db.execute(`SELECT id, pin_hash FROM ${table} WHERE phone = ?`, [phone]);
      if (!user) return res.status(404).json({ success: false, error: 'Account not found.' });
      const valid = await bcrypt.compare(String(old_pin), user.pin_hash);
      if (!valid) return res.status(401).json({ success: false, error: 'Incorrect current PIN.' });
      const newHash = await bcrypt.hash(String(new_pin), 10);
      await db.execute(`UPDATE ${table} SET pin_hash = ? WHERE id = ?`, [newHash, user.id]);
      return res.json({ success: true, data: { message: 'PIN updated.' } });
    } catch (err) {
      console.error(`[${code} change-pin]`, err.message);
      return res.status(500).json({ success: false, error: 'Server error.' });
    }
  });

  // GET /internal/balance/:phone
  app.get('/internal/balance/:phone', internalOnly, async (req, res) => {
    try {
      const [[user]] = await db.execute(`SELECT balance FROM ${table} WHERE phone = ?`, [req.params.phone]);
      if (!user) return res.status(404).json({ success: false, error: 'Account not found.' });
      return res.json({ success: true, data: { balance: parseFloat(user.balance), operator: code } });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.listen(port, () => console.log(`📡 ${name} API running on http://localhost:${port}`));
  return app;
}

module.exports = createOperatorServer;
