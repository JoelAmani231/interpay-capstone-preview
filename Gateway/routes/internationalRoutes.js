const express = require('express');
const router  = express.Router();
const { internationalTransfer } = require('../controllers/internationalController');
const { protect } = require('../middleware/authMiddleware');

router.post('/', protect, internationalTransfer);
module.exports = router;
