// Gateway/controllers/historyController.js
const gatewayService = require('../services/gatewayService');

// GET /api/history
exports.getHistory = async (req, res) => {
  try {
    const raw = await gatewayService.getHistory(req.phone, req.query);

    // Map DB fields to frontend-expected fields
    const transactions = raw.map(t => ({
      id:               t.id,
      // Frontend uses txn.receiver and txn.operator for display
      receiver:         t.receiverName || t.receiverPhone || '—',
      operator:         t.senderOperator || t.receiverOperator || '—',
      // Full fields also available for transaction details
      senderPhone:      t.senderPhone,
      senderOperator:   t.senderOperator,
      receiverPhone:    t.receiverPhone,
      receiverName:     t.receiverName,
      receiverOperator: t.receiverOperator,
      accountPhone:     t.accountPhone,
      amount:           t.amount,
      fee:              t.fee || 0,
      type:             t.type,
      status:           t.status === 'success' ? 'Success'
                      : t.status === 'failed'  ? 'Failed'
                      : 'Pending',
      isInterOperator:  t.senderOperator !== t.receiverOperator,
      date:             t.date,
      time:             t.time,
      createdAt:        t.createdAt,
    }));

    return res.json({ success: true, data: { transactions, count: transactions.length } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
