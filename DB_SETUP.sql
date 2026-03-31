CREATE TABLE IF NOT EXISTS Files (
	id INTEGER PRIMARY KEY AUTOINCREMENT,

	fileName TEXT NOT NULL,
	hash TEXT UNIQUE NOT NULL,
	lookup TEXT GENERATED ALWAYS AS (hash || id) VIRTUAL,

	download_limit INTEGER DEFAULT NULL,
	size INTEGER NOT NULL,
	created_at DATETIME NOT NULL DEFAULT ( strftime('%Y-%m-%dT%H:%M:%SZ', 'now') ), -- macro defined in Database.js
	access_at  DATETIME NOT NULL DEFAULT ( strftime('%Y-%m-%dT%H:%M:%SZ', 'now') )
);
CREATE INDEX IF NOT EXISTS Files_hash      ON Files (hash);
CREATE INDEX IF NOT EXISTS Files_lookup    ON Files (lookup);
CREATE INDEX IF NOT EXISTS Files_access_at ON Files (access_at);