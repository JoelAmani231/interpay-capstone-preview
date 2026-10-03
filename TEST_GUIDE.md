# Test guide: national transfers

Estimated time: 20 to 30 minutes. Setup is in README.md.

Short on time? `npm run selftest` runs the core checks automatically (39 checks, 1 minute;
see README.md). This guide is the same ground done by hand in the app, plus the parts a script
cannot judge (what the screens look like, History, Settings, dark mode).

Before you start, run `npm run reset` so every number below matches your screen, then
`npm start` and open http://localhost:5050.

The app's labels are mostly in French:
**Envoyer** = Send, **Depuis** = From, **Vers** = To, **Montant** = Amount, **Frais** = Fee,
**Code secret** = PIN, **Confirmer** = Confirm, **Mes cartes** = My cards, **Paramètres** = Settings.

Balances are not shown in the app. To verify them, use the SQL queries in README.md
("Seeing the money move"). The expected balances below assume you run the scenarios in order
from a fresh `npm run reset`.

---

## 1. Login

1. Log in with Orange CI **0712345678** / PIN **1234**. The operator is detected as you type the number.
2. Log out (top right), try PIN **0000**. Expected: "Incorrect PIN".

## 2. Send, same operator (fee 1%)

Logged in as 0712345678: **Send**, pay from Orange CI (default, your own number), send to
**0787654321** (Alice Orange), amount **10,000**, PIN 1234.

- Before confirming, the summary shows: fee **100 XOF**, total debited **10,100 XOF**.
- Expected balances: Jean Orange **139,900**, Alice Orange **85,000**.
- The success screen names the recipient and shows the fee.

## 3. Send, different operators (fee 1.5%)

Send **10,000** from Orange to MTN **0512345678**.

- Summary: fee **150 XOF** (1% + 0.5% inter-operator), total **10,150 XOF**.
- The receiving operator (MTN Money CI) is detected from the number as soon as you type it.
- Expected balances: Jean Orange **129,750**, Jean MTN **90,000**.

## 4. Pay from another operator's number

Still logged in as the Orange user: **Send**, in "Depuis" click the **Wave CI** chip.

- The number field **empties**: you must enter the number of the account you want to debit.
  Enter **0712398765**. It is labelled "sera débité".
- Send **2,000** to Moov **0112345678**, PIN **1234** (the PIN of the account being debited).
- Expected: Wave account debited 2,030 (2,000 + 30 fee) = **117,970**; Moov credited = **102,000**.
- In the `broker` table, `sender_operator` is `WAVE_CI` for this row, not `ORANGE_CI`.

## 5. Things that must be refused

- Wrong PIN: the transfer is refused ("Incorrect PIN") and nothing moves.
- Amount above the balance (for example 400,000 from Orange): refused with "Insufficient balance".
- Amount under 250 or not a multiple of 10: the Send button stays disabled.
- Both refused transfers still appear in the `broker` table with status `failed` and the reason.

## 6. Frequent contacts

Open **Send** again. Under the recipient field, "Fréquents, d'après votre historique" lists the
numbers you really sent to, most frequent first. Clicking one fills the number and name and
detects the operator and fee immediately.

## 7. Gift cards

**Cards**, tab **Acheter**: choose Netflix, amount 5k, pay with your own Orange number, PIN 1234.

- Expected: a code like `XXXX-XXXX-XXXX-XXXX` with a copy button. The balance goes down by 5,000.
- Click "Voir mes cartes": the card appears with the company name (Netflix), amount, date,
  status Active and its code.
- Try "Payer avec" > another operator chip: the number field empties, same as in Send.

## 8. History

Open **History**.

- Entries are grouped by date ("Aujourd'hui"), newest first, including failed attempts.
- The three tiles at the top (this month) count **successful** transactions only: how many,
  XOF sent, XOF of fees.
- Search by name or number, filter by Success / Pending / Failed.
- Click an entry: the detail card shows recipient, number (only when a name exists), the
  sender-to-receiver operator route, date and time, reference, fees and total debited.

## 9. Money received while logged in (live refresh)

1. Browser A: log in as Alice Orange **0787654321** / PIN **5678** and stay on the Dashboard.
2. Browser B (a private window): log in as Jean Orange and send her 1,000.
3. Browser A: click **History** (or go back to the Dashboard). The new transaction appears
   without logging out.

## 10. Settings (gear icon)

- **Profil / Activité**: name, number, operator, number of logins and last login.
- **Apparence**: dark mode toggle; it is remembered after a reload.
- **Changer le code secret**: current PIN, new PIN twice. Then log out and log in with the new PIN;
  the old one must be refused. Change it back afterwards (or run `npm run reset`).

## 11. Optional: a server goes down mid-transfer

This checks the automatic refund. Start each server in its own terminal instead of `npm start`:

```
npm run gateway     npm run moov    npm run orange
npm run mtn         npm run wave    npm run web
```

Stop only the **MTN** terminal (Ctrl+C), then send 1,000 from Orange to MTN **0512345678**.

- Expected: the transfer fails with "Cannot reach the operator server", the sender's balance is
  **unchanged**, and the `broker` table has a `failed` row with the reason.
- Start `npm run mtn` again and retry: it succeeds.

---

## Known limitations

- Balances are not displayed in the app (check them in the database).
- History shows received transfers with the same minus-style amount as sent ones; it does not yet
  distinguish incoming from outgoing money.
- International transfers are not testable on one machine (see README.md).
- The app is French/English mixed in places; the interface language is not configurable yet.
