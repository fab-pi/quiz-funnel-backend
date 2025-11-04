-- Migration: Add result_page_config JSONB column to questions table
-- This column stores configuration for result_page question type.
-- Structure:
-- {
--   "section_title": "Aging Level",
--   "explanation_box": {
--     "title": "HIGH level",
--     "text": "High levels of skin aging..."
--   },
--   "insight_cards": [
--     {
--       "icon_name": "aging-type",
--       "title": "Aging type",
--       "value": "Extrinsic"
--     },
--     ...
--   ]
-- }
-- Note: question_text and image_url are stored in standard columns (not in config)

-- Add result_page_config column
ALTER TABLE questions 
ADD COLUMN IF NOT EXISTS result_page_config JSONB;

-- Add comment for documentation
COMMENT ON COLUMN questions.result_page_config IS 'JSONB configuration for result_page questions. Contains section_title, explanation_box (title, text), and insight_cards array. The headline (question_text) and result image (image_url) are stored in standard columns.';

