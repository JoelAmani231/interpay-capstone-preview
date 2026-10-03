# InterPay: Capstone Preview

A mobile money transfer simulator. It reproduces how Orange, MTN, Moov and Wave work in
Côte d'Ivoire, using one server per operator and a central broker (the Gateway) between them,
because real operator APIs are not available for student projects.

**Authors:** Joel Amani (and Oumar)

**This preview covers national transfers** (Orange, MTN, Moov, Wave in Côte d'Ivoire), all on one
machine. International transfers (Sénégal, Burkina Faso) need a second machine on the same network
and are not part of this preview. See "Not in this preview" below.

---

## Setup (about 5 minutes)

**Step 1. Install what you need (once):**
- **Node.js 18 or newer** (tested on v24): https://nodejs.org
- **MySQL or MariaDB running locally** (tested on MariaDB 10.4 from XAMPP). With XAMPP: open the
  control panel and click "Start" next to **MySQL**. The default login is assumed: user `root`,
  empty password.
- **An internet connection**: the web page loads React, Tailwind and Babel from public CDNs.

**Step 2. Get the code.** On the GitHub page of this project, click the green **Code** button, then
**Download ZIP**, and unzip it. (With git instead: `git clone <the page's URL>`.)

**Step 3. Open a terminal inside the project folder.** On Windows: open the folder in File Explorer,
click the address bar, type `cmd` and press Enter.

**Step 4. Run these three commands, one after the other:**

```
npm install
npm run setup
npm start
```

`npm start` keeps running: leave that window open while you use the app.

**Step 5.** Open **http://localhost:5050** in a browser. That is the app
(`Frontend/Capstone_Preview.html`). Log in with a test account from the table below.

What `npm run setup` does: creates its **own** database named `interpay_preview` (it never touches
any other database on your machine, for example an older InterPay one), creates the tables, creates
the `.env` configuration file from `.env.example`, and creates the 8 test accounts below. It is safe
to run again; it never overwrites existing accounts. If your MySQL root user has a password, put it
in `.env` (`DB_PASSWORD=`) and run `npm run setup` again.

---

## Check that everything works (1 minute)

Keep the `npm start` window open, open a **second terminal** in the same folder (same trick as in
Step 3) and run:

```
npm run selftest
```

It logs in with the 8 test accounts, makes real transfers (same operator, between operators, from a
Wave number), tries a wrong PIN and an amount above the balance, buys a gift card, reads the history
and changes a PIN and back. **Every line must say PASS** and it ends with `39 passed, 0 failed`.
It moves some test money around; `npm run reset` puts every account back to its start.

## Test numbers

| Operator   | Phone        | PIN  | Starting balance |
|------------|--------------|------|------------------|
| Orange CI  | 0712345678   | 1234 | 150,000 XOF      |
| Orange CI  | 0787654321   | 5678 |  75,000 XOF      |
| MTN CI     | 0512345678   | 1234 |  80,000 XOF      |
| MTN CI     | 0556789012   | 5678 |  60,000 XOF      |
| Moov CI    | 0112345678   | 1234 | 100,000 XOF      |
| Moov CI    | 0198765432   | 5678 |  50,000 XOF      |
| Wave CI    | 0712398765   | 1234 | 120,000 XOF      |
| Wave CI    | 0512398765   | 5678 |  40,000 XOF      |

Try these by hand in the app (after `npm run reset`):

| Test | Log in as | Send / pay | Amount | You must see |
|---|---|---|---|---|
| Same operator | Orange 0712345678 / 1234 | to Orange 0787654321 | 10,000 | fee **100**, debited **10,100** |
| Between operators | Orange 0712345678 / 1234 | to MTN 0512345678 | 10,000 | fee **150**, debited **10,150** |
| Pay from a Wave number | Orange 0712345678 / 1234, click "Wave CI", type 0712398765 (PIN 1234) | to Moov 0112345678 | 2,000 | Wave debited **2,030** |
| Wrong PIN | any account, PIN 0000 | to anyone | any | refused, nothing moves |
| Gift card | Orange 0712345678 / 1234 | Netflix | 5,000 | a code, debited **5,000** |

More scenarios, with the expected result of each, are in **TEST_GUIDE.md**.

You can also create a new account with "Créer un compte" on the login screen (it starts with
10,000 XOF; the phone prefix decides the operator).

---

## How it works (60 seconds)

```
 Browser, web app  (http://localhost:5050)
        |
        v
 Gateway / broker  (:5000)   logs EVERY attempt (success, failed) in the `broker` table
        |                    debit the sender, then credit the receiver,
        |                    refund the sender automatically if the credit fails
        +--> Moov server    (:5001) --+
        +--> Orange server  (:5002)   |   MySQL database `interpay_preview`
        +--> MTN server     (:5003)   |   (one accounts table per operator)
        +--> Wave server    (:5004) --+
```

- Each operator server owns its own accounts and only accepts calls from the Gateway (shared secret).
  The Gateway never changes a balance directly; it asks the operator server to debit or credit.
- Fees: same operator = 1%. Different operators = 1% + 0.5% (1.5%). The sender is debited
  amount + fee; the receiver gets exactly the amount.
- Operator codes are explicit per country (`ORANGE_CI`, `MTN_CI`, `MOOV_CI`, `WAVE_CI`).
- Wave shares the 01/05/07 prefixes with the other operators, so the Gateway identifies a Wave
  account by its exact number before falling back to the prefix.

## What is in this preview

- **Send money**: pick the operator you pay from, enter that account's number, see the exact fee
  and total before confirming. Frequent contacts come from your real history.
- **Gift cards**: buy Amazon, Apple, Google Play, Netflix or Steam cards; a "Mes cartes" tab
  keeps every code you bought.
- **History**: grouped by date, monthly stats, search and filter, full transaction details.
- **Settings** (gear icon, top right): profile, login activity, change PIN, dark mode.
- **Live refresh**: Dashboard and History reload every time you open them, so money received from
  someone else shows up without logging out.

## Seeing the money move

The app does not display account balances. Check them in the database. With XAMPP, click "Start"
next to **Apache** as well, open http://localhost/phpmyadmin, choose the `interpay_preview` database,
click the "SQL" tab and paste:

```sql
SELECT 'Moov' AS operator, phone, full_name, balance FROM moov_clients
UNION ALL SELECT 'Orange', phone, full_name, balance FROM orange_clients
UNION ALL SELECT 'MTN',    phone, full_name, balance FROM mtn_clients
UNION ALL SELECT 'Wave',   phone, full_name, balance FROM wave_clients;

SELECT id, sender_phone, sender_operator, receiver_phone, receiver_operator, amount, fee, status
FROM broker ORDER BY id DESC;
```

The `broker` table holds every attempt, including failed ones, with the reason in `error_message`.
(In phpMyAdmin, click "Show all" under the table, otherwise it only displays the first 25 rows.)

## Start over

`npm run reset` wipes all transactions and gift cards **of this preview's own `interpay_preview`
database** and restores the 8 test accounts (balances, PINs, names). Run it between test sessions.

## Not in this preview

**International transfers** (Côte d'Ivoire to Sénégal / Burkina Faso) need a second machine running
the Sénégal and Burkina operators, with both machines pointing at each other's IP address. The
International screen is still in the app; on a single machine an attempt fails with
"Cannot reach the operator server" and the sender is refunded automatically. Logging in with a
Sénégal or Burkina number also fails for the same reason.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `npm run setup` says it cannot reach MySQL | Start MySQL (XAMPP control panel), run it again. |
| `npm run setup` says MySQL refused the login | Put your MySQL password in `.env` (`DB_PASSWORD=`). |
| `npm run selftest` says the Gateway is not answering | `npm start` is not running; start it in another terminal. |
| `npm run selftest` asks you to run `npm run reset` | A test account was changed or ran out of money; run `npm run reset`. |
| "address already in use" for a port | Another program uses 5000-5004 or 5050. Close it. On macOS, System Settings > General > AirDrop & Handoff > turn off "AirPlay Receiver" (it takes port 5000). |
| Windows Firewall asks about "Node.js" | Either answer works. The app only talks to `localhost`. |
| White page, nothing loads | No internet (the CDN scripts cannot load), or open the browser console (F12) and read the error. |
| `bcrypt` fails to load after `npm install` | Run `npm rebuild bcrypt`. |
| `npm install` prints "2 vulnerabilities" | Both come from `tar`, a helper inside bcrypt's installer. It is not used while the app runs; safe to ignore for this local demo. |
| "Too many login attempts" | Stop and restart `npm start` (the counters are in memory). The limits are set in `.env`. |
| Accounts or balances are in a strange state | `npm run reset`. |

## Project layout

```
Frontend/Capstone_Preview.html  the whole web app (React, loaded from CDN, no build step)
Gateway/                        broker: routes, controllers, gatewayService.js (the core logic)
Operators/{moov,orange,mtn,wave}/server.js
shared/operatorServer.js        factory that builds each operator server
shared/db.js                    MySQL connection pool
scripts/setup.sql               database schema
scripts/setupDB.js, seedAll.js  npm run setup / reset / seed
scripts/selfTest.js             npm run selftest
scripts/serveFrontend.js        tiny static server for the web app (port 5050)
Logos/                          operator logos
.env.example                    default configuration
```
