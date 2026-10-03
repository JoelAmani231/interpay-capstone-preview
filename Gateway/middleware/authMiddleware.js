// Gateway/middleware/authMiddleware.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const jwt = require('jsonwebtoken');

const protect = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, error: 'No token. Please login.' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'interpay_jwt_secret_2024');
    req.phone    = decoded.phone;    // ← phone used for operator calls
    req.operator = decoded.operator;
    req.userId   = decoded.userId;
    next();
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid or expired token.' });
  }
};

module.exports = { protect };
