-- Migration: Allow NULL question_text for info_screen question type
-- This allows info_screen questions to exist without question_text (only image or instructions)

-- Drop NOT NULL constraint on question_text column
ALTER TABLE questions 
ALTER COLUMN question_text DROP NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN questions.question_text IS 'Question text. Required for most question types, but optional for info_screen.';

