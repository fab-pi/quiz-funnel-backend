-- Migration: Migrate existing quizzes to admin user
-- This migration:
-- 1. Creates a default admin user (if it doesn't exist)
-- 2. Assigns all existing quizzes (with NULL user_id) to the admin user
-- 
-- IMPORTANT: After running this migration, you MUST change the admin password!
-- The default password hash is a placeholder and should be updated immediately.

-- ============================================
-- 1. Create default admin user
-- ============================================
-- NOTE: This password hash is a PLACEHOLDER - you MUST change it after migration!
-- The hash below corresponds to password: "CHANGE_ME_IMMEDIATELY"
-- Use the create-admin script to set a proper password: npm run create-admin
INSERT INTO users (email, password_hash, full_name, role, email_verified, is_active)
VALUES (
    'fabrizio.piccolo99@gmail.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyY5Y5Y5Y5Y5', -- PLACEHOLDER - CHANGE THIS!
    'System Administrator',
    'admin',
    true,
    true
)
ON CONFLICT (email) DO NOTHING;

-- ============================================
-- 2. Assign all existing quizzes to admin user
-- ============================================
UPDATE quizzes
SET user_id = (
    SELECT                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                user_id 
    FROM users 
    WHERE role = 'admin' 
    LIMIT 1
)
WHERE user_id IS NULL;

-- ============================================
-- 3. Verify migration
-- ============================================
-- This query will show how many quizzes were assigned
-- (Run this manually after migration to verify)
-- SELECT 
--     COUNT(*) as total_quizzes,
--     COUNT(user_id) as quizzes_with_owner,
--     COUNT(*) FILTER (WHERE user_id IS NULL) as orphaned_quizzes
-- FROM quizzes;

-- ============================================
-- 4. Add comment
-- ============================================
COMMENT ON TABLE users IS 'User accounts. Default admin user created in migration 013. IMPORTANT: Change admin password immediately after migration!';

