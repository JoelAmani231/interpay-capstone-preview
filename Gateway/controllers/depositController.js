// Gateway/controllers/depositController.js
const gatewayService = require('../services/gatewayService');

// POST /api/deposits
// Body: { source_phone, source_pin, amount }
exports.createDeposit = async (req, res) => {
  const { source_phone, source_pin, amount } = req.body;
  if (!source_phone || !source_pin || !amount)
    return res.status(400).json({ success: false, error: 'source_phone, source_pin and amount are required.' });

  try {
    const result = await gatewayService.deposit({
      destPhone:    req.phone,
      sourcePhone:  source_phone,
      sourcePin:    source_pin,
      accountPhone: req.phone,   // ← user connecté
      amount,
    });
    return res.json({ success: true, data: { transaction: result, newBalance: result.newBalance } });
  } catch (err) {
    const status = err.message.includes('PIN') ? 401 : 400;
    return res.status(status).json({ success: false, error: err.message });
  }
};
