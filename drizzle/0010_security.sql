CREATE TABLE security_rate_limit (key TEXT PRIMARY KEY NOT NULL, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX security_rate_expiry ON security_rate_limit(expires_at);
CREATE TABLE security_event (id TEXT PRIMARY KEY NOT NULL, user_id TEXT, kind TEXT NOT NULL, score INTEGER NOT NULL, reasons TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX security_event_created ON security_event(created_at);
CREATE TABLE trial_claim (user_id TEXT PRIMARY KEY NOT NULL, device_hash TEXT NOT NULL UNIQUE, fingerprint_hash TEXT UNIQUE, network_hash TEXT NOT NULL, browser_hash TEXT NOT NULL, screen_hash TEXT NOT NULL, timezone_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX trial_claim_network ON trial_claim(network_hash);
ALTER TABLE user ADD COLUMN premium_payment_reference TEXT;
ALTER TABLE user ADD COLUMN premium_expires_at INTEGER;
