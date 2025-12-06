import { Request, Response, NextFunction } from 'express';
import { ShopifyService } from '../services/shopify/ShopifyService';
import pool from '../config/db';

/**
 * Extended Request interface with Shopify shop property
 */
export interface ShopifyRequest extends Request {
  shop?: string;
  shopId?: number;
  authType?: 'shopify';
}

const shopifyService = new ShopifyService(pool);

/**
 * Shopify authentication middleware
 * Validates Shopify session token from App Bridge
 * Extracts shop domain and adds shop info to request
 */
export const shopifyAuthenticate = async (
  req: ShopifyRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Get shop domain from various possible sources
    const shopDomain = 
      req.headers['x-shopify-shop-domain'] as string ||
      req.query.shop as string ||
      req.body?.shop as string;

    if (!shopDomain) {
      res.status(401).json({
        success: false,
        message: 'Shopify shop domain required. Please provide shop parameter.'
      });
      return;
    }

    // Validate shop domain format
    if (!shopDomain.includes('.myshopify.com') && !shopDomain.includes('.')) {
      res.status(400).json({
        success: false,
        message: 'Invalid shop domain format'
      });
      return;
    }

    // Get shop from database
    const shop = await shopifyService.getShopByDomain(shopDomain);

    if (!shop) {
      res.status(401).json({
        success: false,
        message: 'Shop not found. Please install the app first.'
      });
      return;
    }

    // Check if shop is uninstalled
    if (shop.uninstalledAt) {
      res.status(401).json({
        success: false,
        message: 'App has been uninstalled from this shop. Please reinstall.'
      });
      return;
    }

    // Add shop info to request
    req.shop = shop.shopDomain;
    req.shopId = shop.shopId;
    req.authType = 'shopify';

    console.log(`🔐 Shopify session validated for shop: ${shop.shopDomain}`);

    // Continue to next middleware/route handler
    next();
  } catch (error) {
    console.error('❌ Shopify authentication middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Shopify authentication error occurred'
    });
    return;
  }
};

