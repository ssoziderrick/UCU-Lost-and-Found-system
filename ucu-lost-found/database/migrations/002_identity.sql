-- =====================================================================
-- 002_identity — registration-number sign-in, student registry, admin roles
-- and permissions, one-time codes, email outbox and a general audit log.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Admin roles and permissions
-- ---------------------------------------------------------------------
CREATE TABLE admin_roles (
  id    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code  VARCHAR(30)  NOT NULL UNIQUE,
  name  VARCHAR(60)  NOT NULL,
  description VARCHAR(255) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE permissions (
  id    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code  VARCHAR(40)  NOT NULL UNIQUE,
  description VARCHAR(255) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE role_permissions (
  role_id       INT UNSIGNED NOT NULL,
  permission_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES admin_roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_rp_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO admin_roles (code, name, description) VALUES
  ('super_admin', 'Super admin', 'Manages administrators, the student registry and settings, plus everything an officer can do.'),
  ('officer', 'Lost-property officer', 'Reviews claims, confirms returns, moderates reports and manages student accounts.'),
  ('viewer', 'Viewer', 'Read-only access to statistics and the claims queue, for management.');

INSERT INTO permissions (code, description) VALUES
  ('stats.view', 'See dashboard statistics'),
  ('claims.review', 'Read claims and their evidence'),
  ('claims.decide', 'Approve, reject or revoke claims'),
  ('returns.confirm', 'Confirm that an item was collected'),
  ('reports.moderate', 'List, remove and restore reports'),
  ('students.manage', 'View, deactivate and reactivate student accounts; issue office links'),
  ('registry.manage', 'Import the student registry'),
  ('admins.manage', 'Create administrators and change their roles'),
  ('audit.view', 'Read the audit log');

INSERT INTO role_permissions (role_id, permission_id)
  SELECT r.id, p.id FROM admin_roles r CROSS JOIN permissions p WHERE r.code = 'super_admin';
INSERT INTO role_permissions (role_id, permission_id)
  SELECT r.id, p.id FROM admin_roles r JOIN permissions p
   ON p.code IN ('stats.view','claims.review','claims.decide','returns.confirm','reports.moderate','students.manage','audit.view')
   WHERE r.code = 'officer';
INSERT INTO role_permissions (role_id, permission_id)
  SELECT r.id, p.id FROM admin_roles r JOIN permissions p ON p.code IN ('stats.view','claims.review')
   WHERE r.code = 'viewer';

-- ---------------------------------------------------------------------
-- Student registry: the authorised list of who may activate an account.
-- ---------------------------------------------------------------------
CREATE TABLE registry_imports (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  admin_id      INT UNSIGNED NOT NULL,
  file_name     VARCHAR(255) NOT NULL,
  rows_total    INT UNSIGNED NOT NULL,
  rows_added    INT UNSIGNED NOT NULL,
  rows_updated  INT UNSIGNED NOT NULL,
  rows_rejected INT UNSIGNED NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_imports_admin FOREIGN KEY (admin_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE student_registry (
  registration_number VARCHAR(20)  NOT NULL PRIMARY KEY,
  full_name           VARCHAR(100) NOT NULL,
  university_email    VARCHAR(150) NULL,
  programme           VARCHAR(150) NULL,
  status              ENUM('enrolled','withdrawn','graduated') NOT NULL DEFAULT 'enrolled',
  import_id           INT UNSIGNED NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_registry_import FOREIGN KEY (import_id) REFERENCES registry_imports(id) ON DELETE SET NULL,
  INDEX idx_registry_status (status),
  INDEX idx_registry_name (full_name)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Users: registration number / staff ID identity, status, lockout, admin role.
-- ---------------------------------------------------------------------
ALTER TABLE users
  CHANGE COLUMN student_number registration_number VARCHAR(20) NULL,
  MODIFY COLUMN email VARCHAR(150) NULL,
  ADD COLUMN staff_id            VARCHAR(30)  NULL AFTER registration_number,
  ADD COLUMN admin_role_id       INT UNSIGNED NULL AFTER role,
  ADD COLUMN status              ENUM('active','deactivated') NOT NULL DEFAULT 'active' AFTER admin_role_id,
  ADD COLUMN status_reason       VARCHAR(255) NULL AFTER status,
  ADD COLUMN failed_logins       TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN locked_until        DATETIME NULL,
  ADD COLUMN password_changed_at DATETIME NULL,
  ADD COLUMN last_login_at       DATETIME NULL,
  ADD COLUMN created_by          INT UNSIGNED NULL,
  ADD UNIQUE KEY uq_users_staff_id (staff_id),
  ADD CONSTRAINT fk_users_admin_role FOREIGN KEY (admin_role_id) REFERENCES admin_roles(id),
  ADD CONSTRAINT fk_users_created_by FOREIGN KEY (created_by) REFERENCES users(id);

-- Existing administrators become super admins with a generated staff ID; they can be changed later.
UPDATE users SET staff_id = CONCAT('STAFF-', LPAD(id, 4, '0')) WHERE role = 'admin' AND staff_id IS NULL;
UPDATE users SET admin_role_id = (SELECT id FROM admin_roles WHERE code = 'super_admin') WHERE role = 'admin';
UPDATE users SET registration_number = UPPER(REPLACE(registration_number, ' ', '')) WHERE registration_number IS NOT NULL;

-- v1 allowed students without a student number. They can no longer sign in, so mark them.
UPDATE users SET status = 'deactivated', status_reason = 'No registration number on file (v1 account).'
 WHERE role = 'student' AND registration_number IS NULL;

ALTER TABLE users
  ADD CONSTRAINT chk_users_identity CHECK (
    (role = 'student' AND staff_id IS NULL AND admin_role_id IS NULL AND (registration_number IS NOT NULL OR status = 'deactivated'))
    OR (role = 'admin' AND staff_id IS NOT NULL AND admin_role_id IS NOT NULL AND registration_number IS NULL)
  );

-- Students already registered in v1 are added to the registry so the two stay consistent.
INSERT INTO student_registry (registration_number, full_name, university_email, status)
  SELECT registration_number, full_name, email, 'enrolled' FROM users
   WHERE role = 'student' AND registration_number IS NOT NULL;

ALTER TABLE sessions
  ADD COLUMN remember TINYINT(1) NOT NULL DEFAULT 0,
  ADD INDEX idx_sessions_user (user_id);

-- ---------------------------------------------------------------------
-- One-time codes and links: activation, password reset, admin invitation.
-- Only hashes are stored. A verified code is exchanged for a short-lived ticket.
-- ---------------------------------------------------------------------
CREATE TABLE verification_tokens (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  purpose             ENUM('activation','password_reset','admin_invite') NOT NULL,
  registration_number VARCHAR(20)  NULL,      -- activation: the account doesn't exist yet
  user_id             INT UNSIGNED NULL,      -- reset / invite
  link_hash           CHAR(64)     NOT NULL,  -- SHA-256 of the random link token
  code_hash           CHAR(64)     NULL,      -- HMAC-SHA256 of the 6-digit code (null for office-issued links)
  ticket_hash         CHAR(64)     NULL,      -- set once the code or link is verified
  attempts            TINYINT UNSIGNED NOT NULL DEFAULT 0,
  issued_by           INT UNSIGNED NULL,      -- admin who issued an office link or invitation
  requested_ip        VARCHAR(45)  NULL,
  expires_at          DATETIME     NOT NULL,
  ticket_expires_at   DATETIME     NULL,
  verified_at         DATETIME     NULL,
  used_at             DATETIME     NULL,
  created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tokens_link (link_hash),
  UNIQUE KEY uq_tokens_ticket (ticket_hash),
  INDEX idx_tokens_reg (purpose, registration_number, created_at),
  INDEX idx_tokens_user (purpose, user_id, created_at),
  CONSTRAINT fk_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_tokens_issuer FOREIGN KEY (issued_by) REFERENCES users(id),
  CONSTRAINT chk_tokens_subject CHECK (registration_number IS NOT NULL OR user_id IS NOT NULL)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Email outbox. With MAIL_TRANSPORT=log the body is kept (development only);
-- with SMTP only the recipient, subject and delivery status are recorded.
-- ---------------------------------------------------------------------
CREATE TABLE email_outbox (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  to_address  VARCHAR(150) NOT NULL,
  subject     VARCHAR(200) NOT NULL,
  body_text   TEXT NULL,
  purpose     VARCHAR(40)  NOT NULL,
  transport   ENUM('log','smtp') NOT NULL,
  status      ENUM('logged','sent','failed') NOT NULL,
  error       VARCHAR(255) NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_outbox_to (to_address, created_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Audit log for security-relevant events (sign-in, recovery, account and role
-- changes, registry imports). admin_actions keeps claim decisions until Phase 5.
-- ---------------------------------------------------------------------
CREATE TABLE audit_logs (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_id    INT UNSIGNED NULL,
  actor_type  ENUM('student','admin','system','anonymous') NOT NULL,
  action      VARCHAR(60)  NOT NULL,
  entity_type VARCHAR(40)  NULL,
  entity_id   VARCHAR(40)  NULL,
  details     JSON         NULL,
  ip          VARCHAR(45)  NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES users(id),
  INDEX idx_audit_entity (entity_type, entity_id),
  INDEX idx_audit_actor (actor_id, created_at),
  INDEX idx_audit_action (action, created_at)
) ENGINE=InnoDB;
