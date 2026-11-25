-- =====================================================================
-- 004_matching_notifications — rule-based match suggestions between lost
-- and found reports, in-app notifications, settings, email preference.
-- =====================================================================

CREATE TABLE app_settings (
  setting_key  VARCHAR(60) NOT NULL PRIMARY KEY,
  value        JSON NOT NULL,
  updated_by   INT UNSIGNED NULL,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_settings_user FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB;

INSERT INTO app_settings (setting_key, value) VALUES ('matching', JSON_OBJECT(
  'weights', JSON_OBJECT('name', 0.35, 'category', 0.25, 'location', 0.20, 'date', 0.15, 'description', 0.05),
  'notifyThreshold', 0.70,
  'listThreshold', 0.50,
  'windowDays', 30
));

CREATE TABLE item_matches (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  lost_report_id   INT UNSIGNED NOT NULL,
  found_report_id  INT UNSIGNED NOT NULL,
  score            DECIMAL(4,3) NOT NULL,
  breakdown        JSON NOT NULL,
  status           ENUM('suggested','dismissed','claimed','expired') NOT NULL DEFAULT 'suggested',
  notified_at      DATETIME NULL,
  dismissed_at     DATETIME NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_match_pair (lost_report_id, found_report_id),
  INDEX idx_matches_found (found_report_id),
  INDEX idx_matches_status (status, score),
  CONSTRAINT fk_matches_lost FOREIGN KEY (lost_report_id) REFERENCES reports(id),
  CONSTRAINT fk_matches_found FOREIGN KEY (found_report_id) REFERENCES reports(id),
  CONSTRAINT chk_match_score CHECK (score >= 0 AND score <= 1),
  CONSTRAINT chk_match_pair CHECK (lost_report_id <> found_report_id)
) ENGINE=InnoDB;

CREATE TABLE notifications (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  type        VARCHAR(40)  NOT NULL,
  title       VARCHAR(150) NOT NULL,
  body        VARCHAR(600) NOT NULL,
  link        VARCHAR(255) NULL,
  dedupe_key  VARCHAR(100) NOT NULL,   -- e.g. match:12:31 or claim:7:approved — one notification per key per user
  read_at     DATETIME NULL,
  emailed_at  DATETIME NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_notification_once (user_id, dedupe_key),
  INDEX idx_notifications_user (user_id, read_at, created_at),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

ALTER TABLE users ADD COLUMN notify_email TINYINT(1) NOT NULL DEFAULT 1;

INSERT INTO permissions (code, description) VALUES ('settings.manage', 'Change platform settings such as matching weights');
INSERT INTO role_permissions (role_id, permission_id)
  SELECT r.id, p.id FROM admin_roles r JOIN permissions p ON p.code = 'settings.manage' WHERE r.code = 'super_admin';
