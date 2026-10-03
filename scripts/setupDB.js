// scripts/setupDB.js — one-command database setup.
//   npm run setup   create the database + tables + test accounts (safe to re-run)
//   npm run reset   same, then wipe all transactions / gift cards and restore the test accounts
const fs   = require('fs');
const path = require('path');

const root    = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');
if (!fs.existsSync(envPath)) {
  fs.copyFileSync(path.join(root, '.env.example'), envPath);
  console.log('Created .env from .env.example');
}
require('dotenv').config({ path: envPath });

const mysql    = require('mysql2/promise');
const { seed } = require('./seedAll');

const RESET   = process.argv.includes('--reset');
const DB_NAME = process.env.DB_NAME || 'interpay_preview';

async function main() {
  if (!/^[A-Za-z0-9_]+$/.test(DB_NAME)) throw new Error(`DB_NAME "${DB_NAME}" is not a valid database name (letters, digits, underscore only).`);

  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST     || 'localhost',
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });

  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
  await conn.query(`USE \`${DB_NAME}\``);
  await conn.query(fs.readFileSync(path.join(__dirname, 'setup.sql'), 'utf8'));
  console.log(`Database "${DB_NAME}" ready (tables created).`);

  if (RESET) {
    await conn.query('TRUNCATE TABLE broker');
    await conn.query('TRUNCATE TABLE gift_cards');
    await conn.query('UPDATE merchants SET balance = 0');
    console.log('Reset: transactions and gift cards wiped.');
  }

  await seed(conn, { overwrite: RESET });
  await conn.end();

  console.log('Next step: npm start   then open http://localhost:' + (process.env.FRONTEND_PORT || 5050));
}

main().catch(err => {
  if (err.code === 'ECONNREFUSED') {
    console.error('\nCannot reach MySQL on ' + (process.env.DB_HOST || 'localhost') + '.');
    console.error('Start it first (XAMPP Control Panel -> MySQL -> Start), then run this again.\n');
  } else if (err.code === 'ER_ACCESS_DENIED_ERROR') {
    console.error('\nMySQL refused the login. Set DB_USER / DB_PASSWORD in the .env file, then run this again.\n');
  } else {
    console.error('\nSetup failed:', err.message, '\n');
  }
  process.exit(1);
});
