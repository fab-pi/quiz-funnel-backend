-- Migration: Add billing tables for Shopify app subscriptions
-- This migration:
-- 1. Creates shop_subscriptions table to track Shopify app subscriptions
-- 2. Creates shop_usage table to track monthly usage (sessions, quizzes)
-- 3. Adds indexes for performance
--
-- Date: 2024
-- Safe to run: Yes (creates new tables, backward compatible)

-- ============================================
-- 1. Create shop_subscriptions table
-- ============================================
CREATE TABLE IF NOT EXISTS shop_subscriptions (
  subscription_id SERIAL PRIMARY KEY,
  shop_id INTEGER NOT NULL REFERENCES shops(shop_id) ON DELETE CASCADE,
  plan_id VARCHAR(50) NOT NULL CHECK (plan_id IN ('starter', 'advanced', 'scaling')),
  subscription_gid VARCHAR(255) UNIQUE NOT NULL, -- Shopify subscription GID (e.g., gid://shopify/AppSubscription/123456)
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- PENDING, ACTIVE, CANCELLED, EXPIRED, TRIAL
  trial_days INTEGER DEFAULT 7,
  trial_ends_at TIMESTAMP NULL,
  is_trial BOOLEAN DEFAULT true,
  current_period_end TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT check_trial_ends_after_created CHECK (
    trial_ends_at IS NULL OR trial_ends_at >= created_at
  ),
  CONSTRAINT check_period_ends_after_created CHECK (
    current_period_end IS NULL OR current_period_end >= created_at
  )
);

-- ============================================
-- 2. Create shop_usage table
-- ============================================
CREATE TABLE IF NOT EXISTS shop_usage (
  usage_id SERIAL PRIMARY KEY,
  shop_id INTEGER NOT NULL REFERENCES shops(shop_id) ON DELETE CASCADE,
  month DATE NOT NULL, -- First day of billing month (YYYY-MM-01)
  sessions_count INTEGER DEFAULT 0 NOT NULL,
  active_quizzes_count INTEGER DEFAULT 0 NOT NULL, -- Snapshot of active quizzes at month start
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(shop_id, month),
  CONSTRAINT check_month_format CHECK (
    EXTRACT(DAY FROM month) = 1 -- Ensure it's the first day of the month
  )
);

-- ============================================
-- 3. Create indexes for performance
-- ============================================

-- Indexes for shop_subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_shop ON shop_subscriptions(shop_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON shop_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_gid ON shop_subscriptions(subscription_gid);

-- Indexes for shop_usage
CREATE INDEX IF NOT EXISTS idx_usage_shop_month ON shop_usage(shop_id, month);
CREATE INDEX IF NOT EXISTS idx_usage_month ON shop_usage(month);

-- ============================================
-- 4. Add comments for documentation
-- ============================================
COMMENT ON TABLE shop_subscriptions IS 'Tracks Shopify app subscriptions for each shop. One active subscription per shop at a time.';
COMMENT ON COLUMN shop_subscriptions.plan_id IS 'Plan ID: starter, advanced, or scaling';
COMMENT ON COLUMN shop_subscriptions.subscription_gid IS 'Shopify GraphQL Global ID for the subscription';
COMMENT ON COLUMN shop_subscriptions.status IS 'Subscription status: PENDING (awaiting approval), ACTIVE (billing active), CANCELLED, EXPIRED, TRIAL';
COMMENT ON COLUMN shop_subscriptions.trial_ends_at IS 'When the trial period ends. NULL if not in trial.';
COMMENT ON COLUMN shop_subscriptions.is_trial IS 'Whether the subscription is currently in trial period';
COMMENT ON COLUMN shop_subscriptions.current_period_end IS 'End date of current billing period';

COMMENT ON TABLE shop_usage IS 'Tracks monthly usage statistics (sessions, active quizzes) for each shop. One record per shop per month.';
COMMENT ON COLUMN shop_usage.month IS 'First day of the billing month (YYYY-MM-01)';
COMMENT ON COLUMN shop_usage.sessions_count IS 'Number of quiz sessions started in this month';
COMMENT ON COLUMN shop_usage.active_quizzes_count IS 'Snapshot of active quizzes count at the start of the month';

-- ============================================
-- Migration complete
-- ============================================
-- Tables created:
-- - shop_subscriptions: Tracks app subscriptions
-- - shop_usage: Tracks monthly usage per shop
-- 
-- Next steps:
-- 1. Implement ShopifyBillingService to create subscriptions
-- 2. Implement usage tracking in SessionService
-- 3. Create webhook handlers for subscription updates

