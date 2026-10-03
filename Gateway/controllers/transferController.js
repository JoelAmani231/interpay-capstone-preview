// Gateway/controllers/transferController.js
const gatewayService = require('../services/gatewayService');

// POST /api/transfer
// Body: { receiver_phone, receiver_name, amount, pin, source_phone? }
exports.transfer = async (req, res) => {
  const { receiver_phone, receiver_name, amount, pin, source_phone } = req.body;
  try {
    const result = await gatewayService.transfer({
      senderPhone:   source_phone || req.phone,  // ← numéro à débiter
      receiverPhone: receiver_phone,
      receiverName:  receiver_name || receiver_phone,
      accountPhone:  req.phone,                  // ← user connecté (pour l'historique)
      amount, pin,
    });
    return res.json({ success: true, data: { transaction: result, newBalance: result.newBalance } });
  } catch (err) {
    const status = err.message.includes('PIN') ? 401 : 400;
    return res.status(status).json({ success: false, error: err.message });
  }
};
