-- Migration: Add Shopify session storage columns to shops table
-- This migration:
-- 1. Adds session storage columns for Shopify's standard session management
-- 2. Maintains backward compatibility by keeping access_token column
-- 3. Creates indexes for session lookups
-- 4. Migrates existing access_token data to session storage format
--
-- Date: 2024
-- Safe to run: Yes (adds nullable columns, backward compatible)

-- ============================================
-- 1. Add session storage columns
-- ============================================
ALTER TABLE shops 
ADD COLUMN IF NOT EXISTS session_id VARCHAR(255) NULL,
ADD COLUMN IF NOT EXISTS session_expires TIMESTAMP NULL,
ADD COLUMN IF NOT EXISTS session_scope TEXT NULL,
ADD COLUMN IF NOT EXISTS session_state VARCHAR(255) NULL,
ADD COLUMN IF NOT EXISTS session_is_online BOOLEAN DEFAULT false;

-- ============================================
-- 2. Create indexes for performance
-- ============================================

-- Index for session_id lookups (Shopify uses format: offline_{shop} or online_{shop}_{userId})
CREATE INDEX IF NOT EXISTS idx_shops_session_id 
ON shops(session_id) 
WHERE session_id IS NOT NULL;

-- Index for session expiration cleanup
CREATE INDEX IF NOT EXISTS idx_shops_session_expires 
ON shops(session_expires) 
WHERE session_expires IS NOT NULL;

-- ============================================
-- 3. Migrate existing access_token data to session storage
-- ============================================

-- Create sessions for existing shops (offline sessions)
-- Session ID format: offline_{shop_domain}
UPDATE shops 
SET 
  session_id = 'offline_' || shop_domain,
  session_scope = scope,
  session_is_online = false,
  session_expires = NULL -- Offline tokens don't expire
WHERE 
  access_token IS NOT NULL 
  AND access_token != ''
  AND session_id IS NULL;

-- ============================================
-- 4. Add comments for documentation
-- ============================================
COMMENT ON COLUMN shops.session_id IS 'Shopify session ID (format: offline_{shop} or online_{shop}_{userId}). Used for session storage lookup.';
COMMENT ON COLUMN shops.session_expires IS 'Session expiration timestamp. NULL for offline sessions (they don''t expire).';
COMMENT ON COLUMN shops.session_scope IS 'OAuth scopes granted to this session. Stored separately from scope column for session management.';
COMMENT ON COLUMN shops.session_state IS 'OAuth state parameter for CSRF protection. Generated during OAuth initiation.';
COMMENT ON COLUMN shops.session_is_online IS 'Whether this is an online session (user-specific) or offline session (app-level). Default: false (offline).';

-- ============================================
-- Migration complete
-- ============================================
-- Shops table now supports Shopify's standard session storage format
-- Existing shops have been migrated to session storage
-- access_token column is kept for backward compatibility during transition
-- After full migration, access_token can be removed (optional cleanup)

