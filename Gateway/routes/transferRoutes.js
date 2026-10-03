const express = require('express');
const router  = express.Router();
const { transfer } = require('../controllers/transferController');
const { protect }  = require('../middleware/authMiddleware');
router.post('/', protect, transfer);
module.exports = router;
