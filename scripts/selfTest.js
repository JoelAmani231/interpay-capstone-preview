// scripts/selfTest.js — checks that the running app works, using the test accounts.
//
//   1. In one terminal:      npm start
//   2. In a second terminal: npm run selftest
//
// It makes REAL transfers through the Gateway API (same operator, between operators, from a Wave
// number), tries a wrong PIN and an amount above the balance, buys a gift card, reads the history
// and changes a PIN and back. Every line must say PASS.
//
// It compares balances before/after each step, so it works on any state and can be re-run.
// It moves some test money around: `npm run reset` puts every account back to its start.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

if (typeof fetch !== 'function') { console.error('Node.js 18 or newer is required.'); process.exit(1); }

const API = `http://localhost:${process.env.GATEWAY_PORT || 5000}/api`;
let passed = 0, failed = 0;
const check = (name, ok, detail = '') => {
  ok ? passed++ : failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '   (' + detail + ')' : ''}`);
};
const section = title => console.log(`\n${title}`);

const call = async (method, urlPath, token, body) => {
  const res = await fetch(API + urlPath, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, ...(await res.json()) };
};
const login   = (phone, pin) => call('POST', '/auth/login', null, { phone_number: phone, pin });
const balance = async token => { const r = await call('GET', '/wallet/balance', token); return typeof r.data === 'number' ? r.data : r.data?.balance; };
const fmt = n => Number(n).toLocaleString('en-US');

const ACCOUNTS = {
  jeanOrange:  { phone: '0712345678', pin: '1234', operator: 'ORANGE_CI' },
  aliceOrange: { phone: '0787654321', pin: '5678', operator: 'ORANGE_CI' },
  jeanMtn:     { phone: '0512345678', pin: '1234', operator: 'MTN_CI'    },
  aliceMtn:    { phone: '0556789012', pin: '5678', operator: 'MTN_CI'    },
  jeanMoov:    { phone: '0112345678', pin: '1234', operator: 'MOOV_CI'   },
  aliceMoov:   { phone: '0198765432', pin: '5678', operator: 'MOOV_CI'   },
  jeanWave:    { phone: '0712398765', pin: '1234', operator: 'WAVE_CI'   },
  aliceWave:   { phone: '0512398765', pin: '5678', operator: 'WAVE_CI'   },
};

(async () => {
  console.log('InterPay self-test (national transfers)');
  console.log('Gateway: ' + API);

  // 0. Is the app running?
  try { await fetch(API + '/health'); }
  catch {
    console.error('\nThe Gateway is not answering. Start the app first (npm start, in another terminal), then run this again.\n');
    process.exit(1);
  }

  // 1. Logins
  section('1. Login with the 8 test accounts');
  const tok = {};
  let loginsOk = true;
  for (const [key, a] of Object.entries(ACCOUNTS)) {
    const r = await login(a.phone, a.pin);
    const ok = r.success && r.data.user.operator === a.operator;
    if (ok) tok[key] = r.data.token; else loginsOk = false;
    check(`${a.operator.padEnd(9)} ${a.phone} / PIN ${a.pin}`, ok, ok ? '' : (r.error || 'unexpected operator'));
  }
  const wrong = await login(ACCOUNTS.jeanOrange.phone, '9999');
  check('wrong PIN is refused at login', !wrong.success, wrong.error);
  if (!loginsOk) {
    console.log('\nA test account is missing or its PIN was changed. Run  npm run reset  and try again.\n');
    process.exit(1);
  }
  const startBalance = await balance(tok.jeanOrange);
  if (startBalance < 40000) {
    console.log(`\nJean Orange only has ${fmt(startBalance)} XOF left, not enough for this test. Run  npm run reset  and try again.\n`);
    process.exit(1);
  }

  const ids = [];   // ids of the transactions created for Jean Orange during this run

  // 2. Same operator
  section('2. Send, same operator (fee 1%)');
  let sBefore = await balance(tok.jeanOrange), rBefore = await balance(tok.aliceOrange);
  let r = await call('POST', '/transfer', tok.jeanOrange, { receiver_phone: ACCOUNTS.aliceOrange.phone, receiver_name: 'Alice Orange', source_phone: ACCOUNTS.jeanOrange.phone, amount: 10000, pin: '1234' });
  check('10,000 XOF Orange -> Orange succeeds', r.success, r.error || '');
  const sameOpId = r.data?.transaction?.id; if (sameOpId) ids.push(sameOpId);
  check('fee is 100 XOF (1%)', r.data?.transaction?.fee === 100, `fee ${r.data?.transaction?.fee}`);
  check('sender debited 10,100 (amount + fee)', (sBefore - await balance(tok.jeanOrange)) === 10100);
  check('receiver credited exactly 10,000', (await balance(tok.aliceOrange) - rBefore) === 10000);

  // 3. Between operators
  section('3. Send, between operators (fee 1.5%)');
  sBefore = await balance(tok.jeanOrange); rBefore = await balance(tok.jeanMtn);
  r = await call('POST', '/transfer', tok.jeanOrange, { receiver_phone: ACCOUNTS.jeanMtn.phone, receiver_name: 'Jean MTN', source_phone: ACCOUNTS.jeanOrange.phone, amount: 10000, pin: '1234' });
  check('10,000 XOF Orange -> MTN succeeds', r.success, r.error || '');
  if (r.data?.transaction?.id) ids.push(r.data.transaction.id);
  check('operators recorded as ORANGE_CI -> MTN_CI', r.data?.transaction?.senderOperator === 'ORANGE_CI' && r.data?.transaction?.receiverOperator === 'MTN_CI');
  check('fee is 150 XOF (1% + 0.5% inter-operator)', r.data?.transaction?.fee === 150, `fee ${r.data?.transaction?.fee}`);
  check('sender debited 10,150', (sBefore - await balance(tok.jeanOrange)) === 10150);
  check('receiver credited exactly 10,000', (await balance(tok.jeanMtn) - rBefore) === 10000);

  // 4. Pay from another operator's number
  section("4. Pay from another operator's number (Wave CI)");
  const orangeBefore = await balance(tok.jeanOrange);
  const waveBefore = await balance(tok.jeanWave), moovBefore = await balance(tok.jeanMoov);
  r = await call('POST', '/transfer', tok.jeanOrange, { receiver_phone: ACCOUNTS.jeanMoov.phone, receiver_name: 'Jean Moov', source_phone: ACCOUNTS.jeanWave.phone, amount: 2000, pin: '1234' });
  check('2,000 XOF from the Wave number to Moov succeeds', r.success, r.error || '');
  if (r.data?.transaction?.id) ids.push(r.data.transaction.id);
  check('the debited operator is WAVE_CI (not the logged-in Orange account)', r.data?.transaction?.senderOperator === 'WAVE_CI' && r.data?.transaction?.receiverOperator === 'MOOV_CI');
  check('Wave account debited 2,030 (2,000 + 30 fee)', (waveBefore - await balance(tok.jeanWave)) === 2030);
  check('Moov account credited 2,000', (await balance(tok.jeanMoov) - moovBefore) === 2000);
  check('the Orange account was not touched', await balance(tok.jeanOrange) === orangeBefore);

  // 5. Refusals
  section('5. Refusals (nothing must move)');
  const beforeRefusals = await balance(tok.jeanOrange);
  r = await call('POST', '/transfer', tok.jeanOrange, { receiver_phone: ACCOUNTS.aliceOrange.phone, source_phone: ACCOUNTS.jeanOrange.phone, amount: 1000, pin: '0000' });
  check('wrong PIN on a transfer is refused', !r.success && r.status === 401, r.error);
  r = await call('POST', '/transfer', tok.jeanOrange, { receiver_phone: ACCOUNTS.aliceOrange.phone, source_phone: ACCOUNTS.jeanOrange.phone, amount: 5000000, pin: '1234' });
  check('amount above the balance is refused', !r.success, r.error);
  check('balance unchanged after both refusals', await balance(tok.jeanOrange) === beforeRefusals);

  // 6. Gift card
  section('6. Gift card');
  sBefore = await balance(tok.jeanOrange);
  r = await call('POST', '/giftcards/purchase', tok.jeanOrange, { card_type: 'netflix', amount: 5000, pin: '1234' });
  const code = r.data?.code;
  check('Netflix 5,000 XOF purchase returns a code', r.success && /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/.test(code || ''), code || r.error);
  if (r.data?.transaction?.id) ids.push(r.data.transaction.id);
  check('balance goes down by 5,000 (no fee)', (sBefore - await balance(tok.jeanOrange)) === 5000);
  const cards = await call('GET', '/giftcards', tok.jeanOrange);
  const card = cards.data?.giftCards?.find(c => c.cardCode === code);
  check('the card is listed with company name "Netflix", status active', card?.companyName === 'Netflix' && card?.status === 'active', card ? `${card.companyName} / ${card.status}` : 'not found');

  // 7. History
  section('7. History');
  const h = await call('GET', '/history', tok.jeanOrange);
  const list = h.data?.transactions || [];
  // Two refused attempts were also logged by the broker: find them (newest failed rows)
  const failedIds = list.filter(x => x.status === 'Failed').slice(0, 2).map(x => x.id);
  const runIds = [...ids, ...failedIds].sort((a, b) => b - a);
  check('history loads', h.success, h.error || `${list.length} rows`);
  check('this run\'s 6 transactions are the newest 6, newest first', JSON.stringify(list.slice(0, 6).map(x => x.id)) === JSON.stringify(runIds), `top ids ${list.slice(0, 6).map(x => x.id).join(',')}`);
  check('the 2 refused attempts are logged as Failed', failedIds.length === 2);
  check('every row has receiver, operator, date and time', list.every(x => x.receiver && x.operator && x.date && x.time));

  // 8. Received money is visible to the receiver
  section('8. The receiver sees the money she received');
  const ah = await call('GET', '/history', tok.aliceOrange);
  check('Alice Orange has the 10,000 XOF transfer in her history', !!ah.data?.transactions?.some(x => x.id === sameOpId));

  // 9. Change PIN
  section('9. Change PIN, then change it back');
  r = await call('POST', '/auth/change-pin', tok.aliceOrange, { old_pin: '5678', new_pin: '4321' });
  check('PIN 5678 -> 4321', r.success, r.error || '');
  check('old PIN is refused', !(await login(ACCOUNTS.aliceOrange.phone, '5678')).success);
  const again = await login(ACCOUNTS.aliceOrange.phone, '4321');
  check('new PIN works', again.success);
  r = await call('POST', '/auth/change-pin', again.data?.token, { old_pin: '4321', new_pin: '5678' });
  check('PIN changed back to 5678', r.success, r.error || '');
  r = await call('POST', '/auth/change-pin', again.data?.token, { old_pin: '1111', new_pin: '5678' });
  check('a wrong current PIN is refused', !r.success && r.status === 401, r.error);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) console.log('Something is not working. Send this output (and the terminal running npm start) to the project authors.\n');
  else console.log('Everything works. Run  npm run reset  to put the test accounts back to their starting balances.\n');
  process.exit(failed ? 1 : 0);
})().catch(err => { console.error('\nSelf-test crashed:', err.message, '\n'); process.exit(2); });
