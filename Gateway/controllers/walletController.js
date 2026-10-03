// Gateway/controllers/walletController.js
const gatewayService = require('../services/gatewayService');

// GET /api/wallet/balance
exports.getBalance = async (req, res) => {
  try {
    const data = await gatewayService.getBalance(req.phone);
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
