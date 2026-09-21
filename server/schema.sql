-- Fresh database schema for this experimental port; not an in-place Ent migration.
CREATE TABLE IF NOT EXISTS users (
 id INT PRIMARY KEY AUTO_INCREMENT, username VARCHAR(255) NOT NULL,
 email VARCHAR(255) NOT NULL UNIQUE, avatar_url TEXT NOT NULL DEFAULT (''),
 `rank` INT NOT NULL DEFAULT 3, role ENUM('SUPERUSER','ADMIN','USER') NOT NULL DEFAULT 'USER',
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 is_deleted BOOLEAN NOT NULL DEFAULT FALSE, CHECK (`rank` BETWEEN 1 AND 5)
);
CREATE TABLE IF NOT EXISTS memos (
 user_id INT PRIMARY KEY, memo1 VARCHAR(255) NOT NULL DEFAULT '', memo2 VARCHAR(255) NOT NULL DEFAULT '',
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS friends (
 user_id INT NOT NULL, target_user_id INT NOT NULL, status ENUM('PENDING','FRIEND','BLOCKED') NOT NULL DEFAULT 'PENDING',
 PRIMARY KEY(user_id,target_user_id), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(target_user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS ai_themes (
 id INT PRIMARY KEY AUTO_INCREMENT, theme_text TEXT NOT NULL, topic1 TEXT NOT NULL, topic2 TEXT NOT NULL, topic3 TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
 id INT PRIMARY KEY AUTO_INCREMENT, event_start DATETIME NOT NULL, event_end DATETIME NOT NULL, theme_id INT NOT NULL,
 INDEX(event_start), FOREIGN KEY(theme_id) REFERENCES ai_themes(id)
);
CREATE TABLE IF NOT EXISTS event_records (
 id INT PRIMARY KEY AUTO_INCREMENT, event_id INT NOT NULL, user_id INT NOT NULL, participates_bit INT NOT NULL DEFAULT 7,
 UNIQUE(event_id,user_id), FOREIGN KEY(event_id) REFERENCES events(id), FOREIGN KEY(user_id) REFERENCES users(id),
 CHECK(participates_bit BETWEEN 0 AND 7)
);
CREATE TABLE IF NOT EXISTS rooms (
 id INT PRIMARY KEY AUTO_INCREMENT, event_id INT NOT NULL, round INT NOT NULL,
 user_a INT NOT NULL, user_b INT NOT NULL, status ENUM('MATCHED','FINISHED') NOT NULL DEFAULT 'MATCHED',
 UNIQUE(event_id,round,user_a), UNIQUE(event_id,round,user_b), INDEX(user_a,status), INDEX(user_b,status),
 FOREIGN KEY(event_id) REFERENCES events(id), FOREIGN KEY(user_a) REFERENCES users(id), FOREIGN KEY(user_b) REFERENCES users(id),
 CHECK(user_a<>user_b), CHECK(round BETWEEN 1 AND 3)
);
CREATE TABLE IF NOT EXISTS event_match_runs (
 event_id INT PRIMARY KEY, FOREIGN KEY(event_id) REFERENCES events(id)
);
