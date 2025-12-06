-- Migration: Add Shopify app support
-- This migration:
-- 1. Creates shops table to store Shopify shop information
-- 2. Adds shop_id column to quizzes table to link quizzes to Shopify shops
-- 3. Creates indexes for performance
-- 4. Maintains backward compatibility (shop_id is nullable for native users)
--
-- Date: 2024
-- Safe to run: Yes (adds new table and nullable column, backward compatible)

-- ============================================
-- 1. Create shops table
-- ============================================
CREATE TABLE IF NOT EXISTS shops (
    shop_id SERIAL PRIMARY KEY,
    shop_domain VARCHAR(255) UNIQUE NOT NULL,
    access_token TEXT NOT NULL,
    scope TEXT,
    installed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    uninstalled_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_uninstalled_after_installed CHECK (
        uninstalled_at IS NULL OR uninstalled_at >= installed_at
    )
);

-- ============================================
-- 2. Add shop_id to quizzes table
-- ============================================
ALTER TABLE quizzes 
ADD COLUMN IF NOT EXISTS shop_id INTEGER REFERENCES shops(shop_id) ON DELETE SET NULL;

-- ============================================
-- 3. Create indexes for performance
-- ============================================

-- Shops table indexes
CREATE INDEX IF NOT EXISTS idx_shops_domain ON shops(shop_domain);
CREATE INDEX IF NOT EXISTS idx_shops_installed ON shops(shop_domain) 
    WHERE uninstalled_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shops_uninstalled ON shops(uninstalled_at) 
    WHERE uninstalled_at IS NOT NULL;

-- Quizzes table indexes for shop_id
CREATE INDEX IF NOT EXISTS idx_quizzes_shop_id ON quizzes(shop_id) 
    WHERE shop_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quizzes_shop_active ON quizzes(shop_id, is_active) 
    WHERE shop_id IS NOT NULL AND is_active = true;

-- ============================================
-- 4. Create trigger for shops.updated_at
-- ============================================
CREATE TRIGGER update_shops_updated_at 
    BEFORE UPDATE ON shops
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 5. Add comments for documentation
-- ============================================
COMMENT ON TABLE shops IS 'Shopify shops that have installed the app';
COMMENT ON COLUMN shops.shop_domain IS 'Shop domain (e.g., mystore.myshopify.com)';
COMMENT ON COLUMN shops.access_token IS 'Shopify OAuth access token (should be encrypted in production)';
COMMENT ON COLUMN shops.scope IS 'Comma-separated list of granted OAuth scopes';
COMMENT ON COLUMN shops.installed_at IS 'Timestamp when app was installed';
COMMENT ON COLUMN shops.uninstalled_at IS 'Timestamp when app was uninstalled (NULL if currently installed)';
COMMENT ON COLUMN quizzes.shop_id IS 'Shopify shop that owns this quiz (NULL for standalone/native user quizzes)';

-- ============================================
-- Migration complete
-- ============================================
-- The shops table is ready to store Shopify shop information
-- Quizzes can now be linked to Shopify shops via shop_id
-- Existing quizzes remain unchanged (shop_id will be NULL for native users)

