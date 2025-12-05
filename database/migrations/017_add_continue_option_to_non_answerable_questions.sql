-- Migration: Add "continue" option to existing non-answerable questions
-- This migration:
-- 1. Adds a "continue" option (with associated_value = 'continue') to all existing
--    fake_loader, result_page, and timeline_projection questions that don't have one
-- 2. This ensures consistent answer tracking for all question types
-- 3. Only affects non-archived questions
--
-- Date: 2024
-- Safe to run: Yes (only adds missing options, backward compatible)

-- ============================================
-- Add "continue" option to existing non-answerable questions
-- ============================================

-- Insert "continue" option for fake_loader, result_page, and timeline_projection questions
-- that don't already have a continue option
INSERT INTO answer_options (question_id, option_text, associated_value)
SELECT 
  q.question_id,
  'Continue',
  'continue'
FROM questions q
WHERE q.interaction_type IN ('fake_loader', 'result_page', 'timeline_projection')
  AND NOT EXISTS (
    SELECT 1 
    FROM answer_options ao 
    WHERE ao.question_id = q.question_id 
      AND ao.associated_value = 'continue'
  )
  AND (q.is_archived = false OR q.is_archived IS NULL);

-- ============================================
-- Log migration results
-- ============================================

-- Count and log how many options were added
DO $$
DECLARE
  options_added INTEGER;
BEGIN
  SELECT COUNT(*) INTO options_added
  FROM answer_options ao
  JOIN questions q ON q.question_id = ao.question_id
  WHERE ao.associated_value = 'continue'
    AND ao.option_text = 'Continue'
    AND q.interaction_type IN ('fake_loader', 'result_page', 'timeline_projection')
    AND (q.is_archived = false OR q.is_archived IS NULL);
  
  RAISE NOTICE 'Migration 017: Added % continue options to non-answerable questions', options_added;
END $$;

-- ============================================
-- Migration complete
-- ============================================
-- All existing non-answerable questions now have a "continue" option
-- This enables consistent answer tracking across all question types
-- New questions of these types will automatically get the continue option
-- via the frontend question editors

