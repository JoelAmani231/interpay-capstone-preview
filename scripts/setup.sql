-- InterPay (preview build) — database schema, national (Côte d'Ivoire) scope.
-- Safe to re-run: every statement is CREATE ... IF NOT EXISTS, nothing is dropped.
--
-- Normally you do NOT run this file by hand: `npm run setup` creates the database
-- and runs it for you. To import it manually (phpMyAdmin): create a database named
-- interpay_preview, SELECT it in the left panel, then Import this file.

-- ══════════════════════════════════════════════════
-- OPERATOR CLIENT TABLES (one table per operator server)
-- Moov = prefix 01 · MTN = 05 · Orange = 07
-- Wave shares 01/05/07, so the Gateway checks wave_clients first.
-- ══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS moov_clients (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  phone       VARCHAR(15)  UNIQUE NOT NULL,
  full_name   VARCHAR(100) NOT NULL,
  pin_hash    VARCHAR(255) NOT NULL,
  balance     DECIMAL(15,2) DEFAULT 0,
  login_count INT DEFAULT 0,
  last_login  TIMESTAMP NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orange_clients (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  phone       VARCHAR(15)  UNIQUE NOT NULL,
  full_name   VARCHAR(100) NOT NULL,
  pin_hash    VARCHAR(255) NOT NULL,
  balance     DECIMAL(15,2) DEFAULT 0,
  login_count INT DEFAULT 0,
  last_login  TIMESTAMP NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mtn_clients (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  phone       VARCHAR(15)  UNIQUE NOT NULL,
  full_name   VARCHAR(100) NOT NULL,
  pin_hash    VARCHAR(255) NOT NULL,
  balance     DECIMAL(15,2) DEFAULT 0,
  login_count INT DEFAULT 0,
  last_login  TIMESTAMP NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wave_clients (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  phone       VARCHAR(15)  UNIQUE NOT NULL,
  full_name   VARCHAR(100) NOT NULL,
  pin_hash    VARCHAR(255) NOT NULL,
  balance     DECIMAL(15,2) DEFAULT 0,
  login_count INT DEFAULT 0,
  last_login  TIMESTAMP NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ══════════════════════════════════════════════════
-- BROKER — one row per transaction attempt (success, failed or pending).
-- Operator codes are NETWORK_COUNTRY (ORANGE_CI, MTN_CI, ...).
-- account_phone = the logged-in user, which can differ from sender_phone
-- when paying from another of their numbers.
-- ══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS broker (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  sender_phone      VARCHAR(15),
  sender_operator   VARCHAR(20),
  receiver_phone    VARCHAR(15),
  receiver_name     VARCHAR(100),
  receiver_operator VARCHAR(20),
  account_phone     VARCHAR(15),
  amount            DECIMAL(15,2) NOT NULL,
  fee               DECIMAL(15,2) DEFAULT 0,
  type              ENUM('transfer','deposit','giftcard') DEFAULT 'transfer',
  status            ENUM('success','failed','pending') DEFAULT 'pending',
  error_message     TEXT,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ══════════════════════════════════════════════════
-- GIFT CARDS (company_name = readable merchant name, e.g. "Apple / iTunes")
-- ══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS gift_cards (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_phone   VARCHAR(15)  NOT NULL,
  operator     VARCHAR(20)  NOT NULL,
  card_type    VARCHAR(50)  NOT NULL,
  company_name VARCHAR(100),
  card_code    VARCHAR(25)  NOT NULL UNIQUE,
  amount       DECIMAL(15,2) NOT NULL,
  status       ENUM('active','used','expired') DEFAULT 'active',
  purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  used_at      TIMESTAMP NULL
);

-- ══════════════════════════════════════════════════
-- MERCHANTS — virtual ledger for the gift card companies
-- ══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS merchants (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  code         VARCHAR(30)  UNIQUE NOT NULL,
  name         VARCHAR(100) NOT NULL,
  balance      DECIMAL(15,2) DEFAULT 0,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO merchants (code, name, balance) VALUES
  ('amazon',  'Amazon',         0),
  ('apple',   'Apple / iTunes', 0),
  ('google',  'Google Play',    0),
  ('netflix', 'Netflix',        0),
  ('steam',   'Steam',          0)
ON DUPLICATE KEY UPDATE name = VALUES(name);

SELECT 'Tables ready' AS status;
