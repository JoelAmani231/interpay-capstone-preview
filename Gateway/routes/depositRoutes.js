const express = require('express');
const router  = express.Router();
const { createDeposit } = require('../controllers/depositController');
const { protect }       = require('../middleware/authMiddleware');
router.post('/', protect, createDeposit);
module.exports = router;
