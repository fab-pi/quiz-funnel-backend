-- Migration: Add Shopify page fields to quizzes table
-- This migration:
-- 1. Adds shopify_page_id column to store Shopify page ID (nullable)
-- 2. Adds shopify_page_handle column to store Shopify page handle/URL slug (nullable)
-- 3. Creates indexes for performance
-- 4. Maintains backward compatibility (both columns are nullable)
--
-- Date: 2024
-- Safe to run: Yes (adds nullable columns, backward compatible)

-- ============================================
-- 1. Add shopify_page_id column
-- ============================================
ALTER TABLE quizzes 
ADD COLUMN IF NOT EXISTS shopify_page_id BIGINT NULL;

-- ============================================
-- 2. Add shopify_page_handle column
-- ============================================
ALTER TABLE quizzes 
ADD COLUMN IF NOT EXISTS shopify_page_handle VARCHAR(255) NULL;

-- ============================================
-- 3. Create indexes for performance
-- ============================================

-- Index for shopify_page_id lookups
CREATE INDEX IF NOT EXISTS idx_quizzes_shopify_page_id 
ON quizzes(shopify_page_id) 
WHERE shopify_page_id IS NOT NULL;

-- Index for shopify_page_handle lookups
CREATE INDEX IF NOT EXISTS idx_quizzes_shopify_page_handle 
ON quizzes(shopify_page_handle) 
WHERE shopify_page_handle IS NOT NULL;

-- Composite index for shop_id + shopify_page_id (common query pattern)
CREATE INDEX IF NOT EXISTS idx_quizzes_shop_shopify_page 
ON quizzes(shop_id, shopify_page_id) 
WHERE shop_id IS NOT NULL AND shopify_page_id IS NOT NULL;

-- ============================================
-- 4. Add comments for documentation
-- ============================================
COMMENT ON COLUMN quizzes.shopify_page_id IS 'Shopify page ID for this quiz (NULL if not published to Shopify)';
COMMENT ON COLUMN quizzes.shopify_page_handle IS 'Shopify page handle/URL slug (e.g., "quiz-4") used in page URL: store.myshopify.com/pages/quiz-4';

-- ============================================
-- Migration complete
-- ============================================
-- Quizzes can now store Shopify page information
-- Both fields are nullable to support:
-- - Native/standalone quizzes (no Shopify page)
-- - Shopify quizzes that haven't been published yet
-- - Backward compatibility with existing quizzes

