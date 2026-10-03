const express = require('express');
const router  = express.Router();
const { getBalance } = require('../controllers/walletController');
const { protect }    = require('../middleware/authMiddleware');
router.get('/balance', protect, getBalance);
module.exports = router;
