-- Migration: Add is_archived fields for soft delete
-- This allows us to hide questions/options from public quiz view
-- without losing historical data (user_answers remain intact)

-- Add is_archived to questions table
ALTER TABLE questions 
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;

-- Add is_archived to answer_options table
ALTER TABLE answer_options 
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;

-- Create indexes for better performance when filtering archived items
CREATE INDEX IF NOT EXISTS idx_questions_is_archived 
ON questions(is_archived) 
WHERE is_archived = false;

CREATE INDEX IF NOT EXISTS idx_answer_options_is_archived 
ON answer_options(is_archived) 
WHERE is_archived = false;

-- Add comments for documentation
COMMENT ON COLUMN questions.is_archived IS 'If true, question is hidden from public quiz view but data is preserved';
COMMENT ON COLUMN answer_options.is_archived IS 'If true, option is hidden from public quiz view but data is preserved';

-- IMPORTANT: This migration must be followed by migration 005 to update the unique_quiz_sequence constraint
-- to only apply to non-archived questions, allowing archived questions to have duplicate sequence_order values.

