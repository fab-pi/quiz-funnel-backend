-- Migration: Add primary_domain field to shops table
-- This migration:
-- 1. Adds primary_domain column to store Shopify store's primary domain (nullable)
-- 2. Creates index for faster lookups
-- 3. Maintains backward compatibility (column is nullable)
--
-- Date: 2024
-- Safe to run: Yes (adds nullable column, backward compatible)

-- ============================================
-- 1. Add primary_domain column
-- ============================================
ALTER TABLE shops 
ADD COLUMN IF NOT EXISTS primary_domain VARCHAR(255) NULL;

-- ============================================
-- 2. Create index for performance
-- ============================================

-- Index for primary_domain lookups (only for non-null values)
CREATE INDEX IF NOT EXISTS idx_shops_primary_domain 
ON shops(primary_domain) 
WHERE primary_domain IS NOT NULL;

-- ============================================
-- 3. Add comment for documentation
-- ============================================
COMMENT ON COLUMN shops.primary_domain IS 'Primary domain for the Shopify store (e.g., shop.brandx.com). NULL means store uses default myshopify.com domain. This is the custom domain that customers see when visiting the store.';

-- ============================================
-- Migration complete
-- ============================================
-- Shops can now store their primary domain
-- The field is nullable to support:
-- - Stores that haven't configured a custom domain
-- - Backward compatibility with existing shops
-- - Fallback to shop_domain (myshopify.com) when primary_domain is NULL

