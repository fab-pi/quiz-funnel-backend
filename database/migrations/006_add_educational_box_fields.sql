-- Migration: Add educational box fields to questions table
-- These optional fields allow single_choice and multiple_choice questions
-- to display an educational box with title and text below answer options

-- Add educational_box_title column
ALTER TABLE questions 
ADD COLUMN IF NOT EXISTS educational_box_title VARCHAR(500);

-- Add educational_box_text column
ALTER TABLE questions 
ADD COLUMN IF NOT EXISTS educational_box_text TEXT;

-- Add comments for documentation
COMMENT ON COLUMN questions.educational_box_title IS 'Optional title for educational box (displayed in accent color). Used for single_choice and multiple_choice question types.';
COMMENT ON COLUMN questions.educational_box_text IS 'Optional text content for educational box. Used for single_choice and multiple_choice question types.';

