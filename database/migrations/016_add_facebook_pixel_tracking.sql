-- Migration: Add Facebook Pixel tracking fields
-- This migration:
-- 1. Adds facebook_pixel_id and facebook_access_token_encrypted columns to quizzes table (nullable)
-- 2. Adds fbp (Facebook Browser ID) and fbc (Facebook Click ID) columns to user_sessions table (nullable)
-- 3. Creates indexes for faster lookups
-- 4. Adds documentation comments
--
-- Date: 2024
-- Safe to run: Yes (adds nullable columns, backward compatible)

-- ============================================
-- 1. Add Facebook Pixel fields to quizzes table
-- ============================================

-- Add facebook_pixel_id column (Facebook Pixel ID, e.g., "123456789012345")
ALTER TABLE quizzes 
ADD COLUMN facebook_pixel_id VARCHAR(50) NULL;

-- Add facebook_access_token_encrypted column (encrypted Facebook Conversions API access token)
ALTER TABLE quizzes 
ADD COLUMN facebook_access_token_encrypted TEXT NULL;

-- Create index for faster lookups on quizzes with Facebook Pixel configured
CREATE INDEX idx_quizzes_facebook_pixel 
ON quizzes(facebook_pixel_id) 
WHERE facebook_pixel_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN quizzes.facebook_pixel_id IS 'Facebook Pixel ID for tracking events. NULL means no Pixel tracking configured.';
COMMENT ON COLUMN quizzes.facebook_access_token_encrypted IS 'Encrypted Facebook Conversions API access token. NULL means no server-side tracking configured.';

-- ============================================
-- 2. Add Facebook tracking parameters to user_sessions table
-- ============================================

-- Add fbp column (Facebook Browser ID from _fbp cookie)
ALTER TABLE user_sessions 
ADD COLUMN fbp VARCHAR(255) NULL;

-- Add fbc column (Facebook Click ID from _fbc cookie)
ALTER TABLE user_sessions 
ADD COLUMN fbc VARCHAR(500) NULL;

-- Create indexes for faster lookups (optional, but helpful for analytics)
CREATE INDEX idx_user_sessions_fbp 
ON user_sessions(fbp) 
WHERE fbp IS NOT NULL;

CREATE INDEX idx_user_sessions_fbc 
ON user_sessions(fbc) 
WHERE fbc IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN user_sessions.fbp IS 'Facebook Browser ID from _fbp cookie. Used for Conversions API event matching.';
COMMENT ON COLUMN user_sessions.fbc IS 'Facebook Click ID from _fbc cookie. Links events to Facebook ad clicks.';

-- ============================================
-- Migration complete
-- ============================================
-- All columns are nullable, so existing quizzes and sessions will continue to work
-- Facebook Pixel tracking is optional and can be configured per quiz

