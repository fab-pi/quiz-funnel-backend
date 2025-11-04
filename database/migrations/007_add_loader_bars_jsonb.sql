-- Migration: Add loader_bars JSONB column to questions table
-- This column stores an array of progress bars for fake_loader question type.
-- Each bar has: text_before, text_after, popup_header, popup_question, and order.
-- The old loader_text and popup_question columns are kept for backward compatibility.

-- Add loader_bars column
ALTER TABLE questions 
ADD COLUMN IF NOT EXISTS loader_bars JSONB;

-- Add comment for documentation
COMMENT ON COLUMN questions.loader_bars IS 'JSONB array of progress bars for fake_loader questions. Each bar contains: text_before, text_after, popup_header, popup_question, and order fields. Example: [{"text_before": "Setting Goals", "text_after": "Goals", "popup_header": "To move forward, please specify", "popup_question": "Would looking younger help you feel more confident?", "order": 0}]';

