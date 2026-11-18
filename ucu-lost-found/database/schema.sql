-- =====================================================================
-- UCU Campus Lost-and-Found System — database schema
-- Target: MySQL 8.0+ (also tested on MariaDB 10.11)
-- Usage:  mysql -u <user> -p < database/schema.sql
-- =====================================================================

CREATE DATABASE IF NOT EXISTS ucu_lost_found
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ucu_lost_found;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS admin_actions;
DROP TABLE IF EXISTS claims;
DROP TABLE IF EXISTS report_photos;
DROP TABLE IF EXISTS reports;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS locations;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- Lookup tables
-- ---------------------------------------------------------------------
CREATE TABLE categories (
  id    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name  VARCHAR(60) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE locations (
  id    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name  VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Users and sessions
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name       VARCHAR(100) NOT NULL,
  email           VARCHAR(150) NOT NULL UNIQUE,
  student_number  VARCHAR(20)  NULL UNIQUE,
  phone           VARCHAR(20)  NULL,               -- private: admin only
  password_hash   VARCHAR(100) NOT NULL,           -- bcrypt hash, never plain text
  role            ENUM('student','admin') NOT NULL DEFAULT 'student',
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Server-side sessions: logging out deletes the row, so the cookie stops working.
CREATE TABLE sessions (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  token_hash  CHAR(64) NOT NULL UNIQUE,            -- SHA-256 of the random token
  expires_at  DATETIME NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_sessions_expires (expires_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Lost / found reports
-- ---------------------------------------------------------------------
CREATE TABLE reports (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           INT UNSIGNED NOT NULL,          -- reporter
  type              ENUM('lost','found') NOT NULL,
  title             VARCHAR(120) NOT NULL,
  category_id       INT UNSIGNED NOT NULL,
  description       TEXT NOT NULL,                  -- public
  private_details   TEXT NULL,                      -- found items only; reporter + admin only
  event_date        DATE NOT NULL,                  -- date lost / found
  location_id       INT UNSIGNED NOT NULL,
  location_detail   VARCHAR(150) NULL,              -- e.g. "under a chair, back row"
  status            ENUM('open','awaiting_collection','returned','closed','removed')
                    NOT NULL DEFAULT 'open',
  status_note       VARCHAR(255) NULL,              -- e.g. admin reason for removal
  returned_at       DATETIME NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_reports_user     FOREIGN KEY (user_id)     REFERENCES users(id),
  CONSTRAINT fk_reports_category FOREIGN KEY (category_id) REFERENCES categories(id),
  CONSTRAINT fk_reports_location FOREIGN KEY (location_id) REFERENCES locations(id),
  INDEX idx_reports_search (type, status, event_date),
  INDEX idx_reports_user (user_id),
  FULLTEXT INDEX ft_reports_text (title, description)
) ENGINE=InnoDB;

-- Photos are stored in the database so they survive restarts on hosts
-- with ephemeral disks. Kept in a separate table so list queries stay light.
CREATE TABLE report_photos (
  report_id   INT UNSIGNED PRIMARY KEY,
  mime_type   VARCHAR(30) NOT NULL,
  size_bytes  INT UNSIGNED NOT NULL,
  data        MEDIUMBLOB NOT NULL,
  uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_photos_report FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Ownership claims
-- ---------------------------------------------------------------------
CREATE TABLE claims (
  id                       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  report_id                INT UNSIGNED NOT NULL,
  claimant_id              INT UNSIGNED NOT NULL,
  evidence                 TEXT NOT NULL,           -- private: claimant + admin only
  status                   ENUM('pending','approved','rejected','collected')
                           NOT NULL DEFAULT 'pending',
  admin_reason             TEXT NULL,               -- reason recorded with decision
  collection_instructions  VARCHAR(255) NULL,       -- where/when to collect (approved)
  reviewed_by              INT UNSIGNED NULL,
  reviewed_at              DATETIME NULL,
  collected_at             DATETIME NULL,
  created_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Database-level guarantee: at most ONE approved/collected claim per item.
  approved_lock            INT UNSIGNED
                           GENERATED ALWAYS AS (CASE WHEN status IN ('approved','collected')
                                                     THEN report_id ELSE NULL END) STORED,
  CONSTRAINT fk_claims_report   FOREIGN KEY (report_id)   REFERENCES reports(id) ON DELETE CASCADE,
  CONSTRAINT fk_claims_claimant FOREIGN KEY (claimant_id) REFERENCES users(id),
  CONSTRAINT fk_claims_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id),
  UNIQUE KEY uq_one_claim_per_student (report_id, claimant_id),
  UNIQUE KEY uq_one_approved_claim (approved_lock),
  INDEX idx_claims_status (status)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Audit trail of administrator decisions
-- ---------------------------------------------------------------------
CREATE TABLE admin_actions (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  admin_id    INT UNSIGNED NOT NULL,
  action      VARCHAR(40) NOT NULL,   -- approve_claim, reject_claim, confirm_return, ...
  report_id   INT UNSIGNED NULL,
  claim_id    INT UNSIGNED NULL,
  note        TEXT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_actions_admin FOREIGN KEY (admin_id) REFERENCES users(id),
  INDEX idx_actions_report (report_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------
INSERT INTO categories (name) VALUES
  ('Keys'), ('Phones & Electronics'), ('Bags'), ('Books & Stationery'),
  ('ID & Cards'), ('Clothing'), ('Jewellery & Accessories'), ('Water Bottles & Flasks'),
  ('Documents'), ('Other');

INSERT INTO locations (name) VALUES
  ('N5B Lecture Room'), ('Hamu Mukasa Library'), ('Touch of Class Restaurant'),
  ('Premium Hostel'), ('Nkoyoyo Hall'), ('Bishop Tucker Building'), ('Allan Galpin Health Centre'),
  ('Main Chapel'), ('Sports Grounds'), ('Main Gate'), ('Technology Building'),
  ('Dining Hall'), ('Other / Not listed');
