const express = require('express');
const router  = express.Router();
const { purchaseGiftCard, getGiftCards } = require('../controllers/giftCardController');
const { protect } = require('../middleware/authMiddleware');
router.get('/',          protect, getGiftCards);
router.post('/purchase', protect, purchaseGiftCard);
module.exports = router;
