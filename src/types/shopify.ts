/**
 * Shopify-related TypeScript types
 */

export interface Shop {
  shopId: number;
  shopDomain: string;
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

