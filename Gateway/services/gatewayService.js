// Gateway/services/gatewayService.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const fetch = require('node-fetch');
const db    = require('../../shared/db');

const INTERNAL_SECRET = process.env.INTERNAL_SECRET || 'interpay_internal_key_2024';

// ── Operator registry ─────────────────────────────────────────
// 1 serveur par operateur (Machine A: CI, Machine B: SN+BF)
const OPERATORS = {
  // Côte d'Ivoire (Machine A — locaux)
  'MOOV_CI':   { code: 'MOOV_CI',   name: 'Moov Money CI',  url: process.env.MOOV_URL      || 'http://localhost:5001' },
  'ORANGE_CI': { code: 'ORANGE_CI', name: 'Orange Money CI', url: process.env.ORANGE_URL    || 'http://localhost:5002' },
  'MTN_CI':    { code: 'MTN_CI',    name: 'MTN Money CI',   url: process.env.MTN_URL       || 'http://localhost:5003' },
  'WAVE_CI':   { code: 'WAVE_CI',   name: 'Wave CI',        url: process.env.WAVE_URL      || 'http://localhost:5004' },
  // Sénégal (Machine B — 1 serveur par operateur)
  'WAVE_SN':   { code: 'WAVE_SN',   name: 'Wave SN',        url: process.env.WAVE_SN_URL   || 'http://localhost:5005' },
  'ORANGE_SN': { code: 'ORANGE_SN', name: 'Orange SN',      url: process.env.ORANGE_SN_URL || 'http://localhost:5006' },
  // Burkina Faso (Machine B — 1 serveur par operateur)
  'ORANGE_BF': { code: 'ORANGE_BF', name: 'Orange BF',      url: process.env.ORANGE_BF_URL || 'http://localhost:5007' },
  'MOOV_BF':   { code: 'MOOV_BF',   name: 'Moov BF',        url: process.env.MOOV_BF_URL   || 'http://localhost:5008' },
};

// Prefix → specific operator code
const PREFIX_TO_OP = {
  '77': 'WAVE_SN',
  '76': 'ORANGE_SN',
  '55': 'ORANGE_BF',
  '60': 'MOOV_BF',
};

// CI prefix fallback (after wave_clients check)
const CI_PREFIX_TO_OP = {
  '01': 'MOOV_CI',
  '07': 'ORANGE_CI',
  '05': 'MTN_CI',
};

const internalHeaders = () => ({
  'Content-Type': 'application/json',
  'X-Internal-Secret': INTERNAL_SECRET,
});

// detectOperator — returns specific NETWORK_COUNTRY operator
const detectOperator = async (phone) => {
  const phoneStr = String(phone);
  const prefix2  = phoneStr.substring(0, 2);

  // International prefixes (immediate — no DB check needed)
  if (PREFIX_TO_OP[prefix2]) return OPERATORS[PREFIX_TO_OP[prefix2]];

  // CI: check wave_clients first (shares 01/05/07 with Moov/Orange/MTN)
  try {
    const [[waveRow]] = await db.execute(
      'SELECT id FROM wave_clients WHERE phone = ? LIMIT 1', [phoneStr]
    );
    if (waveRow) return OPERATORS['WAVE_CI'];
  } catch (_) {}

  // CI fallback by prefix
  const ciCode = CI_PREFIX_TO_OP[prefix2];
  return ciCode ? OPERATORS[ciCode] : null;
};

// Never throws: if an operator server is unreachable we return a failed result instead,
// so the callers' rollback logic (re-credit the sender after a failed credit) always runs.
const callOperator = async (url, method, path, body = null) => {
  const options = { method, headers: internalHeaders() };
  if (body) options.body = JSON.stringify(body);
  try {
    const res = await fetch(`${url}${path}`, options);
    return await res.json();
  } catch (err) {
    return { success: false, error: `Cannot reach the operator server (${url}): ${err.code || err.message}` };
  }
};

// Gift card code generator
const generateGiftCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) code += '-';
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

// ── TRANSFER ──────────────────────────────────────────────────
const transfer = async ({ senderPhone, receiverPhone, receiverName, amount, pin, accountPhone }) => {
  const numAmount  = parseFloat(amount);
  const senderOp   = await detectOperator(senderPhone);
  const receiverOp = await detectOperator(receiverPhone);
  if (!senderOp)   throw new Error(`Unknown operator for sender: ${senderPhone}`);
  if (!receiverOp) throw new Error(`Unknown operator for receiver: ${receiverPhone}`);

  const baseFee      = Math.ceil(numAmount * 0.01);
  const interOpFee   = senderOp.code !== receiverOp.code ? Math.ceil(numAmount * 0.005) : 0;
  const totalFee     = baseFee + interOpFee;

  const [log] = await db.execute(
    `INSERT INTO broker (sender_phone, sender_operator, receiver_phone, receiver_name, receiver_operator, account_phone, amount, fee, type, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'transfer', 'pending')`,
    [senderPhone, senderOp.code, receiverPhone, receiverName || receiverPhone, receiverOp.code, accountPhone || senderPhone, numAmount, totalFee]
  );
  const txnId = log.insertId;

  try {
    const debitRes = await callOperator(senderOp.url, 'POST', '/internal/debit', {
      phone: senderPhone, amount: numAmount + totalFee, pin,
    });
    if (!debitRes.success) {
      await db.execute(`UPDATE broker SET status='failed', error_message=? WHERE id=?`, [debitRes.error, txnId]);
      throw new Error(debitRes.error);
    }

    const creditRes = await callOperator(receiverOp.url, 'POST', '/internal/credit', {
      phone: receiverPhone, amount: numAmount,
    });
    if (!creditRes.success) {
      await callOperator(senderOp.url, 'POST', '/internal/credit', { phone: senderPhone, amount: numAmount + totalFee });
      await db.execute(`UPDATE broker SET status='failed', error_message=? WHERE id=?`, [`Credit failed: ${creditRes.error}`, txnId]);
      throw new Error(`Transfer failed: ${creditRes.error}`);
    }

    await db.execute(`UPDATE broker SET status='success' WHERE id=?`, [txnId]);
    return {
      id: txnId, senderPhone, senderOperator: senderOp.code,
      receiverPhone, receiverName: receiverName || receiverPhone, receiverOperator: receiverOp.code,
      amount: numAmount, fee: totalFee, newBalance: debitRes.data.newBalance,
      status: 'Success', type: 'transfer',
      date: new Date().toISOString().split('T')[0],
      time: new Date().toTimeString().substring(0, 5),
    };
  } catch (err) {
    await db.execute(`UPDATE broker SET status='failed', error_message=? WHERE id=?`, [err.message, txnId]);
    throw err;
  }
};

// ── DEPOSIT ───────────────────────────────────────────────────
const deposit = async ({ destPhone, sourcePhone, sourcePin, amount, accountPhone }) => {
  const numAmount  = parseFloat(amount);
  const sourceOp   = await detectOperator(sourcePhone);
  const destOp     = await detectOperator(destPhone);
  if (!sourceOp) throw new Error(`Unknown operator for source: ${sourcePhone}`);
  if (!destOp)   throw new Error(`Unknown operator for dest: ${destPhone}`);

  const depositFee = 0;

  const [log] = await db.execute(
    `INSERT INTO broker (sender_phone, sender_operator, receiver_phone, receiver_operator, account_phone, amount, fee, type, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'deposit', 'pending')`,
    [sourcePhone, sourceOp.code, destPhone, destOp.code, accountPhone || destPhone, numAmount, depositFee]
  );
  const txnId = log.insertId;

  try {
    const debitRes = await callOperator(sourceOp.url, 'POST', '/internal/debit', {
      phone: sourcePhone, amount: numAmount, pin: sourcePin,
    });
    if (!debitRes.success) {
      await db.execute(`UPDATE broker SET status='failed', error_message=? WHERE id=?`, [debitRes.error, txnId]);
      throw new Error(debitRes.error);
    }

    const creditRes = await callOperator(destOp.url, 'POST', '/internal/credit', {
      phone: destPhone, amount: numAmount,
    });
    if (!creditRes.success) {
      await callOperator(sourceOp.url, 'POST', '/internal/credit', { phone: sourcePhone, amount: numAmount });
      await db.execute(`UPDATE broker SET status='failed', error_message=? WHERE id=?`, [`Credit failed: ${creditRes.error}`, txnId]);
      throw new Error(`Deposit failed: ${creditRes.error}`);
    }

    await db.execute(`UPDATE broker SET status='success' WHERE id=?`, [txnId]);
    return {
      id: txnId, sourcePhone, destPhone, amount: numAmount, fee: depositFee,
      newBalance: creditRes.data.newBalance, status: 'Success', type: 'deposit',
      date: new Date().toISOString().split('T')[0],
      time: new Date().toTimeString().substring(0, 5),
    };
  } catch (err) {
    await db.execute(`UPDATE broker SET status='failed', error_message=? WHERE id=?`, [err.message, txnId]);
    throw err;
  }
};

// ── PURCHASE GIFT CARD ────────────────────────────────────────
const purchaseGiftCard = async ({ userPhone, debitPhone, cardType, amount, pin, accountPhone }) => {
  const numAmount  = parseFloat(amount);
  const phoneDebit = debitPhone || userPhone;
  const debitOp    = await detectOperator(phoneDebit);
  if (!debitOp) throw new Error(`Unknown operator for: ${phoneDebit}`);

  const merchantName = cardType.toUpperCase();
  const [[merchant]] = await db.execute(`SELECT name FROM merchants WHERE code = ?`, [cardType]);
  const companyName = merchant ? merchant.name : merchantName;

  const [log] = await db.execute(
    `INSERT INTO broker (sender_phone, sender_operator, receiver_phone, receiver_operator, account_phone, amount, fee, type, status)
     VALUES (?, ?, ?, NULL, ?, ?, 0, 'giftcard', 'pending')`,
    [phoneDebit, debitOp.code, merchantName, accountPhone || userPhone, numAmount]
  );
  const txnId = log.insertId;

  try {
    const debitRes = await callOperator(debitOp.url, 'POST', '/internal/debit', {
      phone: phoneDebit, amount: numAmount, pin,
    });
    if (!debitRes.success) {
      await db.execute(`UPDATE broker SET status='failed', error_message=? WHERE id=?`, [debitRes.error, txnId]);
      throw new Error(debitRes.error);
    }

    const card_code = generateGiftCode();
    await db.execute(
      `INSERT INTO gift_cards (user_phone, operator, card_type, company_name, card_code, amount) VALUES (?, ?, ?, ?, ?, ?)`,
      [userPhone, debitOp.code, cardType, companyName, card_code, numAmount]
    );

    await db.execute(`UPDATE broker SET status='success' WHERE id=?`, [txnId]);
    return {
      id: txnId, cardCode: card_code, amount: numAmount,
      operator: debitOp.code, newBalance: debitRes.data.newBalance,
      status: 'Success', type: 'giftcard',
      date: new Date().toISOString().split('T')[0],
    };
  } catch (err) {
    await db.execute(`UPDATE broker SET status='failed', error_message=? WHERE id=?`, [err.message, txnId]);
    throw err;
  }
};

// ── INTERNATIONAL TRANSFER ────────────────────────────────────
const internationalTransfer = async ({ sourcePhone, receiverPhone, receiverName, destCountry, destNetwork, amount, pin, accountPhone }) => {
  const numAmount  = parseFloat(amount);
  const sourceOp   = await detectOperator(sourcePhone);
  const receiverOp = await detectOperator(receiverPhone);

  if (!sourceOp)   throw new Error(`Opérateur inconnu pour: ${sourcePhone}`);
  if (!receiverOp) throw new Error(`Numéro destinataire inconnu: ${receiverPhone}.`);

  const fee        = Math.ceil(numAmount * 0.02);
  const totalDebit = numAmount + fee;
  const fullReceiverName = receiverName ? `${receiverName} (${destCountry})` : `${receiverPhone} (${destCountry})`;

  const [log] = await db.execute(
    `INSERT INTO broker (sender_phone, sender_operator, receiver_phone, receiver_name, receiver_operator, account_phone, amount, fee, type, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'transfer', 'pending')`,
    [sourcePhone, sourceOp.code, receiverPhone, fullReceiverName, receiverOp.code, accountPhone || sourcePhone, numAmount, fee]
  );
  const txnId = log.insertId;

  try {
    const debitRes = await callOperator(sourceOp.url, 'POST', '/internal/debit', {
      phone: sourcePhone, amount: totalDebit, pin,
    });
    if (!debitRes.success) {
      await db.execute(`UPDATE broker SET status='failed', error_message=? WHERE id=?`, [debitRes.error, txnId]);
      throw new Error(debitRes.error);
    }

    const creditRes = await callOperator(receiverOp.url, 'POST', '/internal/credit', {
      phone: receiverPhone, amount: numAmount,
    });
    if (!creditRes.success) {
      await callOperator(sourceOp.url, 'POST', '/internal/credit', { phone: sourcePhone, amount: totalDebit });
      await db.execute(`UPDATE broker SET status='failed', error_message=? WHERE id=?`, [`Credit failed: ${creditRes.error}`, txnId]);
      throw new Error(`Transfert échoué: ${creditRes.error}`);
    }

    await db.execute(`UPDATE broker SET status='success' WHERE id=?`, [txnId]);
    return {
      id: txnId, senderPhone: sourcePhone, senderOperator: sourceOp.code,
      receiverPhone, receiverName: fullReceiverName, receiverOperator: receiverOp.code,
      amount: numAmount, fee, newBalance: debitRes.data.newBalance,
      status: 'Success', type: 'transfer',
      date: new Date().toISOString().split('T')[0],
      time: new Date().toTimeString().substring(0, 5),
    };
  } catch (err) {
    await db.execute(`UPDATE broker SET status='failed', error_message=? WHERE id=?`, [err.message, txnId]);
    throw err;
  }
};

// ── GET BALANCE ───────────────────────────────────────────────
const getBalance = async (phone) => {
  const op = await detectOperator(phone);
  if (!op) throw new Error(`Unknown operator for: ${phone}`);
  const res = await callOperator(op.url, 'GET', `/internal/balance/${phone}`);
  if (!res.success) throw new Error(res.error);
  return res.data.balance;
};

// ── GET HISTORY ───────────────────────────────────────────────
const getHistory = async (phone, filters = {}) => {
  let query  = `SELECT * FROM broker WHERE (sender_phone = ? OR receiver_phone = ? OR account_phone = ?)`;
  const params = [phone, phone, phone];
  if (filters.type)   { query += ` AND type = ?`;   params.push(filters.type); }
  if (filters.status) { query += ` AND status = ?`; params.push(filters.status); }
  query += ` ORDER BY created_at DESC, id DESC LIMIT 50`;
  const [rows] = await db.execute(query, params);
  return rows.map(t => ({
    id: t.id, senderPhone: t.sender_phone, senderOperator: t.sender_operator,
    receiverPhone: t.receiver_phone, receiverName: t.receiver_name,
    receiverOperator: t.receiver_operator, accountPhone: t.account_phone,
    amount: parseFloat(t.amount), fee: parseFloat(t.fee || 0),
    type: t.type, status: t.status, errorMessage: t.error_message,
    date: t.created_at?.toISOString().split('T')[0],
    time: t.created_at?.toTimeString().substring(0, 5),
    createdAt: t.created_at,
  }));
};

// ── CHANGE PIN ────────────────────────────────────────────────
const changePin = async (phone, oldPin, newPin) => {
  const op = await detectOperator(phone);
  if (!op) throw new Error(`Unknown operator for: ${phone}`);
  const res = await callOperator(op.url, 'POST', '/internal/change-pin', {
    phone, old_pin: oldPin, new_pin: newPin,
  });
  if (!res.success) throw new Error(res.error);
  return res.data;
};

module.exports = { transfer, deposit, purchaseGiftCard, internationalTransfer, getBalance, getHistory, changePin, detectOperator, OPERATORS };
