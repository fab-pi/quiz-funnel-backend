-- Migration: Convert session_id and answer_id from INTEGER to UUID
-- This migration:
-- 1. Drops constraints that check for positive integers
-- 2. Converts user_sessions.session_id from INTEGER to UUID
-- 3. Converts user_answers.session_id from INTEGER to UUID (foreign key)
-- 4. Converts user_answers.answer_id from INTEGER to UUID
-- 5. Migrates existing data (if any) by generating UUIDs
--
-- PostgreSQL 15.14 supports gen_random_uuid() natively (no extension needed)

-- ============================================
-- 1. Drop foreign key constraint on user_answers.session_id
-- ============================================
-- We need to drop this before changing the column type
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'user_answers_session_id_fkey'
    ) THEN
        ALTER TABLE user_answers DROP CONSTRAINT user_answers_session_id_fkey;
        RAISE NOTICE 'Dropped foreign key constraint user_answers_session_id_fkey';
    END IF;
END $$;

-- ============================================
-- 2. Drop check constraints
-- ============================================
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'check_session_id_positive'
    ) THEN
        ALTER TABLE user_sessions DROP CONSTRAINT check_session_id_positive;
        RAISE NOTICE 'Dropped constraint check_session_id_positive';
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'check_answer_id_positive'
    ) THEN
        ALTER TABLE user_answers DROP CONSTRAINT check_answer_id_positive;
        RAISE NOTICE 'Dropped constraint check_answer_id_positive';
    END IF;
END $$;

-- ============================================
-- 3. Convert user_sessions.session_id to UUID
-- ============================================
-- First, add a temporary UUID column
ALTER TABLE user_sessions 
ADD COLUMN session_id_new UUID;

-- Generate UUIDs for existing rows (if any)
UPDATE user_sessions 
SET session_id_new = gen_random_uuid()
WHERE session_id_new IS NULL;

-- Set default for new rows
ALTER TABLE user_sessions 
ALTER COLUMN session_id_new SET DEFAULT gen_random_uuid();

-- ============================================
-- 4. Convert user_answers.session_id to UUID
-- ============================================
-- Add temporary UUID column
ALTER TABLE user_answers 
ADD COLUMN session_id_new UUID;

-- Migrate existing data by creating a mapping from old INTEGER to new UUID
-- At this point, both user_sessions.session_id and user_answers.session_id are still INTEGER
-- We match them and copy the UUID from user_sessions.session_id_new
UPDATE user_answers ua
SET session_id_new = (
    SELECT us.session_id_new
    FROM user_sessions us
    WHERE us.session_id = ua.session_id
    LIMIT 1
)
WHERE EXISTS (
    SELECT 1 FROM user_sessions us 
    WHERE us.session_id = ua.session_id
);

-- For any orphaned answers (shouldn't happen due to CASCADE, but safety check)
-- Delete them for data integrity
DELETE FROM user_answers 
WHERE session_id_new IS NULL;

-- Now drop old INTEGER columns and rename new UUID columns
-- First, drop old session_id from user_sessions
ALTER TABLE user_sessions 
DROP COLUMN session_id;

-- Rename new column to session_id
ALTER TABLE user_sessions 
RENAME COLUMN session_id_new TO session_id;

-- Set as PRIMARY KEY
ALTER TABLE user_sessions 
ADD PRIMARY KEY (session_id);

-- Now drop old session_id from user_answers
ALTER TABLE user_answers 
DROP COLUMN session_id;

-- Rename new column
ALTER TABLE user_answers 
RENAME COLUMN session_id_new TO session_id;

-- Set NOT NULL
ALTER TABLE user_answers 
ALTER COLUMN session_id SET NOT NULL;

-- Recreate foreign key constraint
ALTER TABLE user_answers 
ADD CONSTRAINT user_answers_session_id_fkey 
FOREIGN KEY (session_id) 
REFERENCES user_sessions(session_id) 
ON DELETE CASCADE;

-- ============================================
-- 5. Convert user_answers.answer_id to UUID
-- ============================================
-- Add temporary UUID column
ALTER TABLE user_answers 
ADD COLUMN answer_id_new UUID;

-- Generate UUIDs for existing rows
UPDATE user_answers 
SET answer_id_new = gen_random_uuid()
WHERE answer_id_new IS NULL;

-- Set default for new rows
ALTER TABLE user_answers 
ALTER COLUMN answer_id_new SET DEFAULT gen_random_uuid();

-- Drop old INTEGER column
ALTER TABLE user_answers 
DROP COLUMN answer_id;

-- Rename new column
ALTER TABLE user_answers 
RENAME COLUMN answer_id_new TO answer_id;

-- Set as PRIMARY KEY
ALTER TABLE user_answers 
ADD PRIMARY KEY (answer_id);

-- ============================================
-- 6. Verify indexes (they should still work)
-- ============================================
-- Indexes on UUID columns work automatically
-- idx_user_answers_session_id - should still work
-- idx_user_answers_question_id - no change needed

-- ============================================
-- 7. Update comments
-- ============================================
COMMENT ON COLUMN user_sessions.session_id IS 'Unique session identifier (UUID, generated by application)';
COMMENT ON COLUMN user_answers.answer_id IS 'Unique answer identifier (UUID, generated by application)';
COMMENT ON COLUMN user_answers.session_id IS 'Foreign key to user_sessions.session_id (UUID)';

-- ============================================
-- Migration complete
-- ============================================
-- All session_id and answer_id columns are now UUID type
-- Application code must be updated to use UUID generation instead of generateUniqueId()

