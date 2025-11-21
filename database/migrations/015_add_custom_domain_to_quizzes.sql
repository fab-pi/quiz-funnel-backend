-- Migration: Add custom_domain field to quizzes table
-- This migration:
-- 1. Adds custom_domain column to quizzes table (nullable)
-- 2. Creates unique index to ensure one domain per quiz
-- 3. Creates regular index for faster lookups
-- 4. Adds documentation comment
--
-- Date: 2024
-- Safe to run: Yes (adds nullable column, backward compatible)

-- Add custom_domain field to quizzes table
ALTER TABLE quizzes 
ADD COLUMN custom_domain VARCHAR(255) NULL;

-- Add unique constraint to ensure one domain per quiz
-- NULL values are allowed (multiple quizzes can have NULL custom_domain)
CREATE UNIQUE INDEX unique_custom_domain 
ON quizzes(custom_domain) 
WHERE custom_domain IS NOT NULL;

-- Add index for faster lookups
CREATE INDEX idx_quizzes_custom_domain 
ON quizzes(custom_domain) 
WHERE custom_domain IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN quizzes.custom_domain IS 'Custom domain/subdomain for this quiz (e.g., shop.brandx.com). NULL means quiz uses default domain.';

