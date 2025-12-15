/**
 * Shopify-related TypeScript types
 */

export interface Shop {
  shopId: number;
  shopDomain: string;
  primaryDomain: string | null;
  accessToken: string;
  scope: string | null;
  installedAt: Date;
  uninstalledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShopDatabaseRow {
  shop_id: number;
  shop_domain: string;
  primary_domain: string | null;
  access_token: string;
  scope: string | null;
  installed_at: Date;
  uninstalled_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface StoreShopRequest {
  shopDomain: string;
  accessToken: string;
  scope: string;
}

export interface ShopifySession {
  shop: string;
  accessToken: string;
  scope: string;
  isOnline: boolean;
}

/**
 * Shopify Page information stored in quizzes table
 */
export interface ShopifyPageInfo {
  shopifyPageId: number | null;
  shopifyPageHandle: string | null;
}

/**
 * Database row representation of Shopify page fields
 */
export interface ShopifyPageInfoDatabaseRow {
  shopify_page_id: number | null;
  shopify_page_handle: string | null;
}

/**
 * Subscription status types
 */
export type SubscriptionStatus = 'PENDING' | 'ACTIVE' | 'CANCELLED' | 'EXPIRED' | 'TRIAL';

/**
 * Shop subscription information
 */
export interface ShopSubscription {
  subscriptionId: number;
  shopId: number;
  planId: string;
  subscriptionGid: string;
  status: SubscriptionStatus;
  trialDays: number;
  trialEndsAt: Date | null;
  isTrial: boolean;
  currentPeriodEnd: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Database row representation of shop subscription
 */
export interface ShopSubscriptionDatabaseRow {
  subscription_id: number;
  shop_id: number;
  plan_id: string;
  subscription_gid: string;
  status: SubscriptionStatus;
  trial_days: number;
  trial_ends_at: Date | null;
  is_trial: boolean;
  current_period_end: Date | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Shop usage information for a month
 */
export interface ShopUsage {
  usageId: number;
  shopId: number;
  month: Date;
  sessionsCount: number;
  activeQuizzesCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Database row representation of shop usage
 */
export interface ShopUsageDatabaseRow {
  usage_id: number;
  shop_id: number;
  month: Date;
  sessions_count: number;
  active_quizzes_count: number;
  created_at: Date;
  updated_at: Date;
}

/**
 * Subscription status response for API
 */
export interface SubscriptionStatusResponse {
  planId: string | null;
  planName: string | null;
  status: SubscriptionStatus | null;
  trialEndsAt: Date | null;
  isTrial: boolean;
  currentPeriodEnd: Date | null;
  currentMonthSessions: number;
  maxSessions: number | null;
  activeQuizzes: number;
  maxQuizzes: number | null;
  features: {
    facebookPixel: boolean;
    conversionAPI: boolean;
  };
}

