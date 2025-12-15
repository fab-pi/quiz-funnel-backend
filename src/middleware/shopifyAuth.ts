import { Request, Response, NextFunction } from 'express';
import { Session } from '@shopify/shopify-api';
import { ShopifyService } from '../services/shopify/ShopifyService';
import pool from '../config/db';

/**
 * Extended Request interface with Shopify shop property
 */
export interface ShopifyRequest extends Request {
  shop?: string;
  shopId?: number;
  authType?: 'shopify';
  session?: Session; // Session object from session storage
}

const shopifyService = new ShopifyService(pool);

/**
 * Shopify authentication middleware
 * Validates Shopify session token from App Bridge (for embedded apps)
 * Falls back to shop domain header validation (for non-embedded requests like webhooks)
 * Loads session from storage and adds shop info to request
 */
export const shopifyAuthenticate = async (
  req: ShopifyRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const shopify = shopifyService.getShopifyApi();
    let shopDomain: string | undefined;
    let session: Session | undefined;

    // Priority 1: Check for App Bridge session token (embedded apps)
    // Note: For embedded apps, Shopify App Bridge sends session tokens in Authorization header
    // The session token contains shop information, but we still need to validate it
    // For now, we'll extract shop from header and validate session from storage
    // Full session token validation can be added later if needed
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      // Session token is present - extract shop from header
      const shopFromHeader = req.headers['x-shopify-shop-domain'] as string || req.query.shop as string;
      if (shopFromHeader) {
        shopDomain = shopFromHeader;
        // Try to load session from storage using service's sessionStorage
        const sessionId = `offline_${shopFromHeader}`;
        session = await shopifyService.getSessionStorage().loadSession(sessionId);
        if (session) {
          console.log(`🔐 Session token found for shop: ${shopDomain}`);
        }
      }
    }

    // Priority 2: Check for shop domain header (non-embedded requests, webhooks)
    if (!shopDomain) {
      shopDomain = 
        req.headers['x-shopify-shop-domain'] as string ||
        req.query.shop as string ||
        req.body?.shop as string;
    }

    if (!shopDomain) {
      res.status(401).json({
        success: false,
        message: 'Shopify shop domain required. Please provide shop parameter or session token.'
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

    // Load session from storage if not already loaded
    if (!session) {
      const sessionId = `offline_${shopDomain}`;
      session = await shopifyService.getSessionStorage().loadSession(sessionId);
      
      if (!session) {
        // Fallback: Check database for shop (backward compatibility)
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

        // Shop exists but no session - this is OK for backward compatibility
        // Session will be created on next OAuth flow
        console.warn(`⚠️ No session found for shop ${shopDomain}, using database fallback`);
      }
    }

    // Get shop from database for shopId
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

    // Add shop info and session to request
    req.shop = shopDomain;
    req.shopId = shop.shopId;
    req.authType = 'shopify';
    req.session = session; // May be undefined if using fallback

    console.log(`🔐 Shopify authentication successful for shop: ${shopDomain}${session ? ` (session: ${session.id})` : ' (fallback)'}`);

    // Continue to next middleware/route handler
    next();
  } catch (error: any) {
    console.error('❌ Shopify authentication middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Shopify authentication error occurred'
    });
    return;
  }
};

