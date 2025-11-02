-- Migration: Update unique_quiz_sequence constraint to only apply to active questions
-- This allows archived questions to have duplicate sequence_order values,
-- enabling soft delete without constraint violations

-- Drop the old constraint if it exists
ALTER TABLE questions 
DROP CONSTRAINT IF EXISTS unique_quiz_sequence;

-- Create a partial unique index that only applies to non-archived questions
-- This allows archived questions to have any sequence_order (including duplicates)
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_quiz_sequence 
ON questions(quiz_id, sequence_order) 
WHERE is_archived = false OR is_archived IS NULL;

-- Add comment for documentation
COMMENT ON INDEX unique_active_quiz_sequence IS 'Ensures unique sequence_order per quiz, but only for active (non-archived) questions. Archived questions can have any sequence_order value.';

