// Gateway/controllers/authController.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const fetch = require('node-fetch');
const jwt   = require('jsonwebtoken');
const db    = require('../../shared/db');
const { OPERATORS, changePin } = require('../services/gatewayService');

const JWT_SECRET = process.env.JWT_SECRET || 'interpay_jwt_secret_2024';

// Prefix → specific operator code (NETWORK_COUNTRY)
const PREFIX_TO_OP_CODE = {
  '01': 'MOOV_CI', '05': 'MTN_CI', '07': 'ORANGE_CI',
  '77': 'WAVE_SN', '76': 'ORANGE_SN',
  '55': 'ORANGE_BF', '60': 'MOOV_BF',
};

// detectForAuth — returns the operator object for a given phone
const detectForAuth = async (phone) => {
  const phoneStr = String(phone);
  const prefix   = phoneStr.substring(0, 2);

  // International numbers — direct prefix mapping
  if (['77','76','55','60'].includes(prefix)) {
    return OPERATORS[PREFIX_TO_OP_CODE[prefix]];
  }

  // CI numbers — check wave_clients first (shares 01/05/07)
  try {
    const [[row]] = await db.execute('SELECT id FROM wave_clients WHERE phone = ? LIMIT 1', [phoneStr]);
    if (row) return OPERATORS['WAVE_CI'];
  } catch (_) {}

  const code = PREFIX_TO_OP_CODE[prefix];
  return code ? OPERATORS[code] : null;
};

// POST /api/auth/login
exports.login = async (req, res) => {
  const { phone_number, pin } = req.body;
  if (!phone_number || !pin)
    return res.status(400).json({ success: false, error: 'phone_number and pin are required.' });

  const op = await detectForAuth(phone_number);
  if (!op) return res.status(400).json({
    success: false,
    error: 'Numéro inconnu. CI: 01/05/07 — Sénégal: 77/76 — Burkina: 55/60'
  });

  try {
    const opRes = await fetch(`${op.url}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phone_number, pin }),
    });
    const data = await opRes.json();
    if (!data.success) return res.status(401).json(data);

    // Gateway issues its own JWT with specific operator code
    const token = jwt.sign(
      { phone: phone_number, operator: op.code, userId: data.data.user.id },
      JWT_SECRET, { expiresIn: '24h' }
    );
    return res.json({
      success: true,
      data: { token, user: { ...data.data.user, operator: op.code } }
    });
  } catch (err) {
    console.error('[gateway login]', err.message);
    return res.status(503).json({ success: false, error: `${op.name} server unreachable.` });
  }
};

// POST /api/auth/register
exports.register = async (req, res) => {
  const { full_name, phone_number, pin } = req.body;
  if (!full_name || !phone_number || !pin)
    return res.status(400).json({ success: false, error: 'All fields are required.' });

  const op = await detectForAuth(phone_number);
  if (!op) return res.status(400).json({
    success: false,
    error: 'Numéro inconnu. CI: 01/05/07 — Sénégal: 77/76 — Burkina: 55/60'
  });

  try {
    const opRes = await fetch(`${op.url}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phone_number, full_name, pin }),
    });
    const data = await opRes.json();
    if (!data.success) return res.status(opRes.status).json(data);

    const token = jwt.sign(
      { phone: phone_number, operator: op.code, userId: data.data.user.id },
      JWT_SECRET, { expiresIn: '24h' }
    );
    return res.status(201).json({
      success: true,
      data: { token, user: { ...data.data.user, operator: op.code } }
    });
  } catch (err) {
    console.error('[gateway register]', err.message);
    return res.status(503).json({ success: false, error: `${op.name} server unreachable.` });
  }
};

exports.logout = (req, res) => res.json({ success: true, data: { message: 'Logged out.' } });

// POST /api/auth/change-pin — Body: { old_pin, new_pin }
exports.changePin = async (req, res) => {
  const { old_pin, new_pin } = req.body;
  if (!old_pin || !new_pin)
    return res.status(400).json({ success: false, error: 'old_pin and new_pin are required.' });
  if (String(new_pin).length !== 4 || isNaN(new_pin))
    return res.status(400).json({ success: false, error: 'Le nouveau code doit faire exactement 4 chiffres.' });
  try {
    await changePin(req.phone, old_pin, new_pin);
    return res.json({ success: true, data: { message: 'Code secret mis à jour.' } });
  } catch (err) {
    const status = err.message.includes('Incorrect') ? 401 : 400;
    return res.status(status).json({ success: false, error: err.message });
  }
};
