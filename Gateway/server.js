// Gateway/server.js — Orchestrateur central (port 5000)
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10kb' }));
// Limits are configurable (.env) so a reviewer clicking around for a while is not locked out.
// Code defaults stay strict (100 / 10); the preview package's .env.example raises them.
const RATE_MAX  = parseInt(process.env.RATE_LIMIT_MAX)       || 100;
const LOGIN_MAX = parseInt(process.env.LOGIN_RATE_LIMIT_MAX) || 10;
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: RATE_MAX, message: { success: false, error: 'Too many requests.' } }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: LOGIN_MAX, message: { success: false, error: 'Too many login attempts.' } }));

app.use('/api/auth',                   require('./routes/authRoutes'));
app.use('/api/transfer/international', require('./routes/internationalRoutes')); // ← AVANT /api/transfer
app.use('/api/transfer',               require('./routes/transferRoutes'));
app.use('/api/deposits',               require('./routes/depositRoutes'));
app.use('/api/wallet',                 require('./routes/walletRoutes'));
app.use('/api/history',                require('./routes/historyRoutes'));
app.use('/api/giftcards',              require('./routes/giftCardRoutes'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', message: 'InterPay Gateway running ✅' }));
app.use((req, res) => res.status(404).json({ success: false, error: `Route ${req.method} ${req.path} not found.` }));

const PORT = process.env.GATEWAY_PORT || 5000;
app.listen(PORT, () => console.log(`🚀 InterPay Gateway running on http://localhost:${PORT}`));
