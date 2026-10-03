// scripts/seedAll.js — test accounts for the national (Côte d'Ivoire) preview build.
//   npm run seed   -> put the 8 test accounts back to their starting balance, PIN and name
//
// (npm run setup also calls seed(), but without overwriting accounts that already exist.)
const path   = require('path');
const bcrypt = require('bcrypt');

const SEED_DATA = [
  { table: 'moov_clients',   label: 'Moov CI',   users: [
    { phone: '0112345678', full_name: 'Jean Moov',    pin: '1234', balance: 100000 },
    { phone: '0198765432', full_name: 'Alice Moov',   pin: '5678', balance: 50000  },
  ]},
  { table: 'orange_clients', label: 'Orange CI', users: [
    { phone: '0712345678', full_name: 'Jean Orange',  pin: '1234', balance: 150000 },
    { phone: '0787654321', full_name: 'Alice Orange', pin: '5678', balance: 75000  },
  ]},
  { table: 'mtn_clients',    label: 'MTN CI',    users: [
    { phone: '0512345678', full_name: 'Jean MTN',     pin: '1234', balance: 80000  },
    { phone: '0556789012', full_name: 'Alice MTN',    pin: '5678', balance: 60000  },
  ]},
  // Wave shares the 01/05/07 prefixes with the others, so the Gateway looks these up by exact number.
  { table: 'wave_clients',   label: 'Wave CI',   users: [
    { phone: '0712398765', full_name: 'Jean Wave',    pin: '1234', balance: 120000 },
    { phone: '0512398765', full_name: 'Alice Wave',   pin: '5678', balance: 40000  },
  ]},
];

// overwrite=true  -> insert, or restore name/PIN/balance/login stats if the account exists
// overwrite=false -> insert only, never touch an account that already exists
async function seed(pool, { overwrite = false } = {}) {
  console.log(overwrite ? '\nRestoring test accounts...\n' : '\nCreating test accounts (existing ones are left untouched)...\n');
  let count = 0;
  for (const { table, label, users } of SEED_DATA) {
    for (const u of users) {
      const pin_hash = await bcrypt.hash(u.pin, 10);
      const insert = `INSERT INTO ${table} (phone, full_name, pin_hash, balance) VALUES (?, ?, ?, ?)`;
      const sql = overwrite
        ? `${insert} ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), pin_hash=VALUES(pin_hash), balance=VALUES(balance), login_count=0, last_login=NULL`
        : `${insert} ON DUPLICATE KEY UPDATE id=id`;
      await pool.execute(sql, [u.phone, u.full_name, pin_hash, u.balance]);
      console.log(`  ${label.padEnd(10)} ${u.phone}  PIN ${u.pin}  ${u.balance.toLocaleString('en-US').padStart(8)} XOF  ${u.full_name}`);
      count++;
    }
  }
  console.log(`\n${count} test accounts ready.\n`);
}

module.exports = { seed, SEED_DATA };

// Run directly: `npm run seed`
if (require.main === module) {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
  const mysql = require('mysql2/promise');
  const pool = mysql.createPool({
    host:     process.env.DB_HOST     || 'localhost',
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'interpay_preview',
  });
  seed(pool, { overwrite: true })
    .then(() => pool.end())
    .catch(err => { console.error('Seed failed:', err.message); process.exit(1); });
}
