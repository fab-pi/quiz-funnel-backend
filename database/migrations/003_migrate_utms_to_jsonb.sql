-- Migration: Migrate UTM parameters from individual columns to JSONB
-- This migration replaces the 5 individual UTM columns with a single JSONB column
-- for flexible storage of any UTM parameters (standard and custom)

-- Add utm_params JSONB column to user_sessions table
ALTER TABLE user_sessions 
ADD COLUMN IF NOT EXISTS utm_params JSONB;

-- Create GIN index on utm_params for efficient JSONB queries
CREATE INDEX IF NOT EXISTS idx_user_sessions_utm_params 
ON user_sessions USING GIN (utm_params);

-- Drop old UTM columns (this will delete existing UTM data)
-- Note: Only the 5 UTM column values will be lost, all other session data remains
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'user_sessions' AND column_name = 'utm_source') THEN
        ALTER TABLE user_sessions DROP COLUMN utm_source;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'user_sessions' AND column_name = 'utm_medium') THEN
        ALTER TABLE user_sessions DROP COLUMN utm_medium;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'user_sessions' AND column_name = 'utm_campaign') THEN
        ALTER TABLE user_sessions DROP COLUMN utm_campaign;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'user_sessions' AND column_name = 'utm_term') THEN
        ALTER TABLE user_sessions DROP COLUMN utm_term;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'user_sessions' AND column_name = 'utm_content') THEN
        ALTER TABLE user_sessions DROP COLUMN utm_content;
    END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN user_sessions.utm_params IS 'JSONB object storing all UTM parameters (utm_source, utm_campaign, utm_medium, utm_term, utm_content, and any custom utm_* parameters)';

