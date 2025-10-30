-- Migration tracking table
-- This table tracks which migrations have been applied
CREATE TABLE IF NOT EXISTS migrations (
    id SERIAL PRIMARY KEY,
    migration_name VARCHAR(255) NOT NULL UNIQUE,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    checksum VARCHAR(64) -- Optional: for integrity checking
);

-- Add comment
COMMENT ON TABLE migrations IS 'Tracks applied database migrations';

