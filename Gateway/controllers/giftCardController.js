// Gateway/controllers/giftCardController.js
const gatewayService = require('../services/gatewayService');
const db             = require('../../shared/db');

// POST /api/giftcards/purchase
// Body: { card_type, amount, pin, payment_phone? }
exports.purchaseGiftCard = async (req, res) => {
  const { card_type, amount, pin, payment_phone } = req.body;
  if (!card_type || !amount || !pin)
    return res.status(400).json({ success: false, error: 'card_type, amount and pin are required.' });

  const phoneToDebit = payment_phone || req.phone;

  try {
    const result = await gatewayService.purchaseGiftCard({
      userPhone:    req.phone,       // propriétaire du gift card
      debitPhone:   phoneToDebit,    // numéro à débiter
      accountPhone: req.phone,       // user connecté (pour l'historique)
      cardType:     card_type,
      amount, pin,
    });
    return res.json({
      success: true,
      data: { transaction: result, code: result.cardCode, newBalance: result.newBalance }
    });
  } catch (err) {
    const status = err.message.includes('PIN') ? 401 : 400;
    return res.status(status).json({ success: false, error: err.message });
  }
};

// GET /api/giftcards
exports.getGiftCards = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT * FROM gift_cards WHERE user_phone = ? ORDER BY purchased_at DESC`,
      [req.phone]
    );
    const cards = rows.map(c => ({
      id: c.id, userPhone: c.user_phone, operator: c.operator,
      cardType: c.card_type, companyName: c.company_name, cardCode: c.card_code,
      amount: parseFloat(c.amount), status: c.status,
      purchasedAt: c.purchased_at, usedAt: c.used_at,
    }));
    return res.json({ success: true, data: { giftCards: cards, count: cards.length } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
