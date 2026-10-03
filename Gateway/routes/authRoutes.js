const express = require('express');
const router  = express.Router();
const { login, register, logout, changePin } = require('../controllers/authController');
const { protect }                  = require('../middleware/authMiddleware');
router.post('/login',       login);
router.post('/register',    register);
router.post('/logout',      protect, logout);
router.post('/change-pin',  protect, changePin);
module.exports = router;
