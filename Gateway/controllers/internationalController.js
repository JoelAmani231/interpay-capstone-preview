// Gateway/controllers/internationalController.js
const gatewayService = require('../services/gatewayService');

// POST /api/transfer/international
// Body: { source_phone, receiver_phone, receiver_name, dest_country, dest_network, amount, pin }
exports.internationalTransfer = async (req, res) => {
  const { source_phone, receiver_phone, receiver_name, dest_country, dest_network, amount, pin } = req.body;
  if (!receiver_phone || !dest_country || !amount || !pin)
    return res.status(400).json({ success: false, error: 'receiver_phone, dest_country, amount and pin are required.' });

  try {
    const result = await gatewayService.internationalTransfer({
      sourcePhone:   source_phone || req.phone,
      receiverPhone: receiver_phone,
      receiverName:  receiver_name || receiver_phone,
      destCountry:   dest_country,
      destNetwork:   dest_network,
      accountPhone:  req.phone,
      amount, pin,
    });
    return res.json({ success: true, data: { transaction: result, newBalance: result.newBalance } });
  } catch (err) {
    const status = err.message.includes('PIN') ? 401 : 400;
    return res.status(status).json({ success: false, error: err.message });
  }
};
