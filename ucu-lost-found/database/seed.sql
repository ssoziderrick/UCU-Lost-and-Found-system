-- =====================================================================
-- UCU Campus Lost-and-Found System — FICTIONAL sample data
-- Run AFTER schema.sql:   mysql -u <user> -p ucu_lost_found < database/seed.sql
-- All people, numbers and events below are invented for demonstration.
-- Account passwords are NOT stored here (only bcrypt hashes). The plain-text
-- assessment logins are submitted privately on Moodle.
-- =====================================================================
USE ucu_lost_found;

-- Users (ids 1–6). Hash 1 = administrator password, hash 2 = shared student demo password.
INSERT INTO users (id, full_name, email, student_number, phone, password_hash, role) VALUES
 (1, 'Ruth Achieng', 'admin@lostfound.ucu.test', NULL, '0700000001',
     '$2b$12$FFaH8BgyVrhazu0HrJIvhOSqDzLeZF1to6uZYha5/ZhmtWftH52u6', 'admin'),
 (2, 'Daniel Okello',   'okello@students.ucu.test',   'S24B23/101', '0772000101',
     '$2b$12$hduiN/GmGkKXHdRw6sthZ.BThiLoFIQXHS1WMDE6WBYnZI2LKRx36', 'student'),
 (3, 'Grace Namusoke',  'namusoke@students.ucu.test', 'S24B23/102', '0772000102',
     '$2b$12$hduiN/GmGkKXHdRw6sthZ.BThiLoFIQXHS1WMDE6WBYnZI2LKRx36', 'student'),
 (4, 'Brian Mugisha',   'mugisha@students.ucu.test',  'S24B23/103', NULL,
     '$2b$12$hduiN/GmGkKXHdRw6sthZ.BThiLoFIQXHS1WMDE6WBYnZI2LKRx36', 'student'),
 (5, 'Esther Atim',     'atim@students.ucu.test',     'S24B23/104', NULL,
     '$2b$12$hduiN/GmGkKXHdRw6sthZ.BThiLoFIQXHS1WMDE6WBYnZI2LKRx36', 'student'),
 (6, 'Joel Kato',       'kato@students.ucu.test',     'S24B23/105', NULL,
     '$2b$12$hduiN/GmGkKXHdRw6sthZ.BThiLoFIQXHS1WMDE6WBYnZI2LKRx36', 'student');

-- Category ids: 1 Keys, 2 Phones & Electronics, 3 Bags, 4 Books & Stationery, 5 ID & Cards,
--               6 Clothing, 7 Jewellery & Accessories, 8 Water Bottles & Flasks, 9 Documents, 10 Other
-- Location ids: 1 N5B, 2 Hamu Mukasa Library, 3 Touch of Class, 4 Premium Hostel, 5 Nkoyoyo Hall,
--               6 Bishop Tucker Building, 7 Allan Galpin Health Centre, 8 Main Chapel, 9 Sports Grounds,
--               10 Main Gate, 11 Technology Building, 12 Dining Hall, 13 Other / Not listed
INSERT INTO reports (id, user_id, type, title, category_id, description, private_details,
                     event_date, location_id, location_detail, status, returned_at) VALUES
 -- The scenario from the brief: Namusoke found keys in N5B; Okello lost them.
 (1, 3, 'found', 'Set of keys with a blue keyring', 1,
     'Three keys on a blue plastic keyring, found under a chair after the Health and Wholeness lecture.',
     'Back of the keyring has the inscription "D.O. RM 14" scratched into it. One key is a small padlock key.',
     CURDATE() - INTERVAL 1 DAY, 1, 'Back row, under a chair', 'open', NULL),
 (2, 2, 'lost', 'Keys on a blue keyring', 1,
     'Lost my room keys on a blue keyring. I was in N5B, then Touch of Class Restaurant and Hamu Mukasa Library.',
     NULL, CURDATE() - INTERVAL 1 DAY, 1, 'N5B, Touch of Class or the library', 'open', NULL),
 -- Pending competing claims scenario
 (3, 4, 'found', 'Black Tecno smartphone', 2,
     'Black Tecno phone with a cracked screen protector, found on a reading table on the first floor.',
     'Lock screen wallpaper shows a sunset over a lake. Phone case has a sticker of a football club inside.',
     CURDATE() - INTERVAL 3 DAY, 2, 'First floor reading area', 'open', NULL),
 -- Already returned item (complete workflow example)
 (4, 5, 'found', 'Grey laptop charger', 2,
     'Grey laptop charger (65W) left plugged in at a socket near the entrance.',
     'Has a strip of masking tape on the brick with initials written in red ink.',
     CURDATE() - INTERVAL 8 DAY, 6, 'Socket near the main entrance', 'returned', NOW() - INTERVAL 5 DAY),
 (5, 6, 'lost', 'Green water bottle', 8,
     'Green metal water bottle with a bamboo lid. Lost after evening football training.',
     NULL, CURDATE() - INTERVAL 4 DAY, 9, 'Near the benches', 'open', NULL),
 (6, 2, 'found', 'Student ID card', 5,
     'UCU student ID card found on the path near the Main Gate. Name hidden here for privacy.',
     'Card holder name begins with "M" and the card has a small hole punched at the top corner.',
     CURDATE() - INTERVAL 2 DAY, 10, 'Footpath just inside the gate', 'open', NULL),
 (7, 5, 'lost', 'Navy blue backpack', 3,
     'Navy backpack with a broken side zip, containing lecture notebooks.',
     NULL, CURDATE() - INTERVAL 6 DAY, 12, NULL, 'open', NULL),
 (8, 4, 'found', 'Silver bracelet', 7,
     'Thin silver bracelet found on a pew after Sunday service.',
     'Small charm shaped like a letter on the clasp end.',
     CURDATE() - INTERVAL 10 DAY, 8, 'Left side pews', 'awaiting_collection', NULL),
 (9, 6, 'found', 'Scientific calculator', 4,
     'Casio scientific calculator left in a computer lab.',
     'Owner''s initials engraved on the back cover.',
     CURDATE() - INTERVAL 5 DAY, 11, 'Lab 2', 'open', NULL),
 (10, 3, 'lost', 'Maroon cardigan', 6,
     'Maroon knitted cardigan, medium size. May have left it in the dining hall.',
     NULL, CURDATE() - INTERVAL 7 DAY, 12, NULL, 'closed', NULL);

-- Claims
INSERT INTO claims (id, report_id, claimant_id, evidence, status, admin_reason, collection_instructions,
                    reviewed_by, reviewed_at, collected_at) VALUES
 -- Competing pending claims on the phone (report 3)
 (1, 3, 5, 'It is my phone. The lock screen is a sunset photo I took at Lake Victoria, and there is a football club sticker inside the case.',
     'pending', NULL, NULL, NULL, NULL, NULL),
 (2, 3, 6, 'I lost a black phone in the library around that day. It is black with a screen protector.',
     'pending', NULL, NULL, NULL, NULL, NULL),
 -- Completed return (report 4)
 (3, 4, 3, 'My charger has masking tape on the brick with my initials written in red pen. I left it near the entrance.',
     'collected', 'Initials and red ink match the private details recorded by the finder.',
     'Collect from the Lost & Found desk, Dean of Students office, 9am–4pm. Bring your student ID.',
     1, NOW() - INTERVAL 6 DAY, NOW() - INTERVAL 5 DAY),
 -- Approved, waiting for collection (report 8)
 (4, 8, 2, 'The bracelet has a small charm shaped like the letter D on the clasp. It was a gift from my sister.',
     'approved', 'Charm letter matches the private identifying details.',
     'Collect from the Lost & Found desk, Dean of Students office, 9am–4pm. Bring your student ID.',
     1, NOW() - INTERVAL 1 DAY, NULL),
 -- Rejected claim (report 9)
 (5, 9, 4, 'I think this might be my calculator, I lost one recently.',
     'rejected', 'No identifying detail was given. You may contact the office in person with proof of ownership.',
     NULL, 1, NOW() - INTERVAL 2 DAY, NULL);

INSERT INTO admin_actions (admin_id, action, report_id, claim_id, note, created_at) VALUES
 (1, 'approve_claim', 4, 3, 'Initials and red ink match the private details recorded by the finder.', NOW() - INTERVAL 6 DAY),
 (1, 'confirm_return', 4, 3, 'Collection confirmed', NOW() - INTERVAL 5 DAY),
 (1, 'approve_claim', 8, 4, 'Charm letter matches the private identifying details.', NOW() - INTERVAL 1 DAY),
 (1, 'reject_claim', 9, 5, 'No identifying detail was given.', NOW() - INTERVAL 2 DAY);
