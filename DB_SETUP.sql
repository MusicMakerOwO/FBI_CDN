CREATE TABLE IF NOT EXISTS Files (
	id INTEGER PRIMARY KEY AUTOINCREMENT,

	name TEXT NOT NULL,
	ext TEXT NOT NULL,

	hash TEXT UNIQUE NOT NULL,
	size INTEGER NOT NULL,

	lookup TEXT GENERATED ALWAYS AS (hash || id) VIRTUAL,
	download_limit INTEGER DEFAULT NULL,

	created_at DATETIME NOT NULL DEFAULT ( {{NOW}} ), -- macro defined in Database.js
	access_at  DATETIME NOT NULL DEFAULT ( {{NOW}} )
);
CREATE INDEX IF NOT EXISTS Files_hash      ON Files (hash);
CREATE INDEX IF NOT EXISTS Files_lookup    ON Files (lookup);
CREATE INDEX IF NOT EXISTS Files_access_at ON Files (access_at);
CREATE INDEX IF NOT EXISTS Files_download  ON Files (download_limit);