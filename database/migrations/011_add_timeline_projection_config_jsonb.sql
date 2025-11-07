-- Migration: Add timeline_projection_config JSONB column to questions table
-- This column stores configuration for timeline_projection question type.
-- Structure:
-- {
--   "direction": "ascendent" | "descendent",
--   "months_count": 3
-- }
-- Note: question_text and instructions_text are stored in standard columns (not in config)
-- The {{target_date}} placeholder in these texts will be replaced with calculated date

-- Add timeline_projection_config column
ALTER TABLE questions 
ADD COLUMN IF NOT EXISTS timeline_projection_config JSONB;

-- Add comment for documentation
COMMENT ON COLUMN questions.timeline_projection_config IS 'JSONB configuration for timeline_projection questions. Contains direction (ascendent/descendent) and months_count (number of months to add to current date). The headline (question_text) and instructions (instructions_text) are stored in standard columns and may contain {{target_date}} placeholder.';

