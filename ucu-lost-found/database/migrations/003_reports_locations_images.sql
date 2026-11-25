-- =====================================================================
-- 003_reports_locations_images — campus location directory with zones,
-- grouped categories, confidential details in their own table, custody of
-- found items, and up to four public or private images per report.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Campus zones and locations
-- ---------------------------------------------------------------------
CREATE TABLE campus_zones (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(80) NOT NULL UNIQUE,
  sort_order  SMALLINT NOT NULL DEFAULT 0
) ENGINE=InnoDB;

INSERT INTO campus_zones (name, sort_order) VALUES
  ('Libraries and archives', 10),
  ('Lecture blocks and labs', 20),
  ('Gates and entrances', 30),
  ('Sports grounds', 40),
  ('Halls and accommodation', 50),
  ('Dining', 60),
  ('Chapel, health and services', 70),
  ('Other', 99);

RENAME TABLE locations TO campus_locations;

ALTER TABLE campus_locations
  ADD COLUMN zone_id     INT UNSIGNED NULL AFTER name,
  ADD COLUMN kind        ENUM('library','lecture','lab','gate','sports','hall','dining','chapel','health','office','outdoor','other')
                         NOT NULL DEFAULT 'other' AFTER zone_id,
  ADD COLUMN description VARCHAR(255) NULL AFTER kind,
  ADD COLUMN is_active   TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN sort_order  SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  ADD CONSTRAINT fk_locations_zone FOREIGN KEY (zone_id) REFERENCES campus_zones(id),
  ADD INDEX idx_locations_active (is_active, zone_id, sort_order);

-- The 16 locations supplied for v2. Names are as supplied and must be checked against official
-- university names before launch. Existing v1 locations are kept so their reports stay valid.
INSERT IGNORE INTO campus_locations (name) VALUES
  ('Paul Mukasa Library'), ('Nkoyoyo Hall'), ('Basketball Court'), ('Football Pitch'), ('Wandegea Gate'),
  ('Main Gate'), ('Tech Park Gate'), ('N Block'), ('K Block'), ('Computer Laboratories'),
  ('Networking Laboratories'), ('Robotics Laboratory'), ('Canteens'), ('Dustin Bukenya Library'),
  ('University Archives'), ('Smart Labs');

UPDATE campus_locations l JOIN (
  SELECT 'Hamu Mukasa Library' AS name, 'Libraries and archives' AS zone, 'library' AS kind UNION ALL
  SELECT 'Paul Mukasa Library', 'Libraries and archives', 'library' UNION ALL
  SELECT 'Dustin Bukenya Library', 'Libraries and archives', 'library' UNION ALL
  SELECT 'University Archives', 'Libraries and archives', 'library' UNION ALL
  SELECT 'N5B Lecture Room', 'Lecture blocks and labs', 'lecture' UNION ALL
  SELECT 'N Block', 'Lecture blocks and labs', 'lecture' UNION ALL
  SELECT 'K Block', 'Lecture blocks and labs', 'lecture' UNION ALL
  SELECT 'Bishop Tucker Building', 'Lecture blocks and labs', 'lecture' UNION ALL
  SELECT 'Technology Building', 'Lecture blocks and labs', 'lecture' UNION ALL
  SELECT 'Computer Laboratories', 'Lecture blocks and labs', 'lab' UNION ALL
  SELECT 'Networking Laboratories', 'Lecture blocks and labs', 'lab' UNION ALL
  SELECT 'Robotics Laboratory', 'Lecture blocks and labs', 'lab' UNION ALL
  SELECT 'Smart Labs', 'Lecture blocks and labs', 'lab' UNION ALL
  SELECT 'Main Gate', 'Gates and entrances', 'gate' UNION ALL
  SELECT 'Wandegea Gate', 'Gates and entrances', 'gate' UNION ALL
  SELECT 'Tech Park Gate', 'Gates and entrances', 'gate' UNION ALL
  SELECT 'Sports Grounds', 'Sports grounds', 'sports' UNION ALL
  SELECT 'Football Pitch', 'Sports grounds', 'sports' UNION ALL
  SELECT 'Basketball Court', 'Sports grounds', 'sports' UNION ALL
  SELECT 'Nkoyoyo Hall', 'Halls and accommodation', 'hall' UNION ALL
  SELECT 'Premium Hostel', 'Halls and accommodation', 'hall' UNION ALL
  SELECT 'Touch of Class Restaurant', 'Dining', 'dining' UNION ALL
  SELECT 'Dining Hall', 'Dining', 'dining' UNION ALL
  SELECT 'Canteens', 'Dining', 'dining' UNION ALL
  SELECT 'Main Chapel', 'Chapel, health and services', 'chapel' UNION ALL
  SELECT 'Allan Galpin Health Centre', 'Chapel, health and services', 'health' UNION ALL
  SELECT 'Other / Not listed', 'Other', 'other'
) m ON m.name = l.name
JOIN campus_zones z ON z.name = m.zone
SET l.zone_id = z.id, l.kind = m.kind;

UPDATE campus_locations SET zone_id = (SELECT id FROM campus_zones WHERE name = 'Other') WHERE zone_id IS NULL;
UPDATE campus_locations SET sort_order = 999 WHERE name = 'Other / Not listed';

-- ---------------------------------------------------------------------
-- Categories: one level of grouping. Reports always use a category that has no children.
-- ---------------------------------------------------------------------
ALTER TABLE categories
  ADD COLUMN parent_id  INT UNSIGNED NULL AFTER name,
  ADD COLUMN is_active  TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN sort_order SMALLINT NOT NULL DEFAULT 0,
  ADD CONSTRAINT fk_categories_parent FOREIGN KEY (parent_id) REFERENCES categories(id);

INSERT INTO categories (name, sort_order) VALUES
  ('Electronics', 10), ('Academic', 20), ('Personal items', 30), ('Documents and IDs', 40);
INSERT INTO categories (name) VALUES
  ('Laptops & Chargers'), ('Calculators & Academic Equipment'), ('Umbrellas'), ('Eyewear');

-- One statement per group (MySQL won't join a table to a derived copy of itself in an UPDATE).
SET @g = (SELECT id FROM categories WHERE name = 'Electronics');
UPDATE categories SET parent_id = @g WHERE name IN ('Phones & Electronics', 'Laptops & Chargers');
SET @g = (SELECT id FROM categories WHERE name = 'Academic');
UPDATE categories SET parent_id = @g WHERE name IN ('Books & Stationery', 'Calculators & Academic Equipment');
SET @g = (SELECT id FROM categories WHERE name = 'Personal items');
UPDATE categories SET parent_id = @g
 WHERE name IN ('Bags', 'Clothing', 'Jewellery & Accessories', 'Water Bottles & Flasks', 'Umbrellas', 'Eyewear');
SET @g = (SELECT id FROM categories WHERE name = 'Documents and IDs');
UPDATE categories SET parent_id = @g WHERE name IN ('ID & Cards', 'Documents');

UPDATE categories SET sort_order = 5 WHERE name = 'Keys';
UPDATE categories SET sort_order = 999 WHERE name = 'Other';

-- ---------------------------------------------------------------------
-- Confidential identifying details move out of the reports table.
-- ---------------------------------------------------------------------
CREATE TABLE report_confidential (
  report_id            INT UNSIGNED NOT NULL PRIMARY KEY,
  identifying_details  TEXT NOT NULL,
  updated_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_confidential_report FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO report_confidential (report_id, identifying_details)
  SELECT id, private_details FROM reports WHERE private_details IS NOT NULL AND TRIM(private_details) <> '';

ALTER TABLE reports
  DROP COLUMN private_details,
  ADD COLUMN custody      ENUM('with_finder','lost_property_office','other') NULL AFTER location_detail,
  ADD COLUMN custody_note VARCHAR(255) NULL AFTER custody;

-- ---------------------------------------------------------------------
-- Images: metadata in report_images, bytes in image_blobs (kept apart so list queries stay light).
-- storage_key is random (64 hex characters) and is the only way to fetch an image.
-- ---------------------------------------------------------------------
CREATE TABLE report_images (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  report_id    INT UNSIGNED NOT NULL,
  storage_key  CHAR(64) NOT NULL UNIQUE,
  mime_type    VARCHAR(30) NOT NULL,
  size_bytes   INT UNSIGNED NOT NULL,
  width        SMALLINT UNSIGNED NULL,
  height       SMALLINT UNSIGNED NULL,
  visibility   ENUM('public','private') NOT NULL DEFAULT 'public',
  is_cover     TINYINT(1) NOT NULL DEFAULT 0,
  sort_order   SMALLINT NOT NULL DEFAULT 0,
  uploaded_by  INT UNSIGNED NOT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- At most one cover per report. (No ON DELETE CASCADE on report_id: MySQL forbids it on a
  -- column that feeds a stored generated column. Reports are never hard-deleted.)
  cover_lock   INT UNSIGNED GENERATED ALWAYS AS (IF(is_cover = 1, report_id, NULL)) STORED,
  UNIQUE KEY uq_one_cover (cover_lock),
  CONSTRAINT fk_images_report FOREIGN KEY (report_id) REFERENCES reports(id),
  CONSTRAINT fk_images_uploader FOREIGN KEY (uploaded_by) REFERENCES users(id),
  CONSTRAINT chk_cover_public CHECK (is_cover = 0 OR visibility = 'public'),
  INDEX idx_images_report (report_id, sort_order)
) ENGINE=InnoDB;

CREATE TABLE image_blobs (
  storage_key  CHAR(64) NOT NULL PRIMARY KEY,
  data         MEDIUMBLOB NOT NULL,
  CONSTRAINT fk_blobs_image FOREIGN KEY (storage_key) REFERENCES report_images(storage_key) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Move v1 photos (one per report) across as the public cover image.
INSERT INTO report_images (report_id, storage_key, mime_type, size_bytes, visibility, is_cover, uploaded_by)
  SELECT p.report_id, SHA2(CONCAT(UUID(), '|', p.report_id, '|', RAND()), 256), p.mime_type, p.size_bytes, 'public', 1, r.user_id
    FROM report_photos p JOIN reports r ON r.id = p.report_id;
INSERT INTO image_blobs (storage_key, data)
  SELECT i.storage_key, p.data FROM report_images i JOIN report_photos p ON p.report_id = i.report_id;
DROP TABLE report_photos;

-- ---------------------------------------------------------------------
-- Permissions for the setup screens.
-- ---------------------------------------------------------------------
INSERT INTO permissions (code, description) VALUES
  ('locations.manage', 'Add, edit and deactivate campus locations and zones'),
  ('categories.manage', 'Add, edit and deactivate item categories');
INSERT INTO role_permissions (role_id, permission_id)
  SELECT r.id, p.id FROM admin_roles r JOIN permissions p ON p.code IN ('locations.manage', 'categories.manage')
   WHERE r.code IN ('super_admin', 'officer');
