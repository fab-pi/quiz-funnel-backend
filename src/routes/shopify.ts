import { Router, Request, Response } from 'express';
import { ShopifyService } from '../services/shopify/ShopifyService';
import pool from '../config/db';

const router = Router();
const shopifyService = new ShopifyService(pool);

// Debug: Log route definitions
console.log('🔧 Defining Shopify routes:');
console.log('  - GET  /shopify/auth');
console.log('  - GET  /shopify/auth/callback');
console.log('  - POST /shopify/webhooks/app/uninstalled');

/**
 * GET /api/shopify/auth
 * Initiates Shopify OAuth flow
 * Redirects merchant to Shopify OAuth page
 */
router.get('/shopify/auth', async (req: Request, res: Response) => {
  try {
    const shop = req.query.shop as string;

    if (!shop) {
      return res.status(400).json({
        success: false,
        message: 'Shop parameter is required. Expected: ?shop=mystore.myshopify.com'
      });
    }

    // Validate shop domain format
    if (!shop.includes('.myshopify.com') && !shop.includes('.')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid shop domain format. Expected: mystore.myshopify.com'
      });
    }

    console.log(`🔄 Initiating OAuth for shop: ${shop}`);

    const shopify = shopifyService.getShopifyApi();

    // Get callback URL from environment or construct it
    const callbackUrl = process.env.SHOPIFY_CALLBACK_URL || 'https://api.try-directquiz.com/api/shopify/auth/callback';
    console.log(`   📍 Using callback URL: ${callbackUrl}`);

    // Begin OAuth flow
    // This will redirect to Shopify's OAuth page
    const authRoute = await shopify.auth.begin({
      shop,
      callbackPath: callbackUrl.replace(/^https?:\/\/[^\/]+/, ''), // Extract path from full URL
      isOnline: false, // Use offline access tokens (persistent)
      rawRequest: req,
      rawResponse: res,
    });

    // Redirect to Shopify OAuth page
    res.redirect(authRoute);

  } catch (error: any) {
    console.error('❌ Error initiating OAuth:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to initiate OAuth flow'
    });
  }
});

/**
 * GET /api/shopify/auth/callback
 * Handles Shopify OAuth callback
 * Exchanges authorization code for access token
 * Stores shop in database
 * Redirects to app
 */
router.get('/shopify/auth/callback', async (req: Request, res: Response) => {
  try {
    const shopify = shopifyService.getShopifyApi();

    console.log('🔄 Processing OAuth callback...');

    // Handle OAuth callback
    const callbackResponse = await shopify.auth.callback({
      rawRequest: req,
      rawResponse: res,
    });

    const { session } = callbackResponse;

    if (!session || !session.shop || !session.accessToken) {
      return res.status(400).json({
        success: false,
        message: 'OAuth callback failed: Missing session data'
      });
    }

    console.log(`✅ OAuth successful for shop: ${session.shop}`);

    // Store shop in database
    await shopifyService.storeShop({
      shopDomain: session.shop,
      accessToken: session.accessToken,
      scope: session.scope || '',
    });

    // Get host parameter for App Bridge (required for embedded apps)
    const host = req.query.host as string;

    // Redirect to app
    const appUrl = process.env.SHOPIFY_APP_URL || 'https://quiz.try-directquiz.com';
    const redirectUrl = `${appUrl}/shopify?shop=${session.shop}${host ? `&host=${host}` : ''}`;

    console.log(`✅ Redirecting to app: ${redirectUrl}`);
    res.redirect(redirectUrl);

  } catch (error: any) {
    console.error('❌ Error in OAuth callback:', error);
    
    // Redirect to error page or show error
    const appUrl = process.env.SHOPIFY_APP_URL || 'https://quiz.try-directquiz.com';
    res.redirect(`${appUrl}/shopify?error=oauth_failed&message=${encodeURIComponent(error.message || 'OAuth failed')}`);
  }
});

/**
 * POST /api/shopify/webhooks/app/uninstalled
 * Handles app uninstall webhook from Shopify
 * Marks shop as uninstalled in database
 */
router.post('/shopify/webhooks/app/uninstalled', async (req: Request, res: Response) => {
  try {
    const shopify = shopifyService.getShopifyApi();
    const shop = req.get('X-Shopify-Shop-Domain') || req.body?.shop?.myshopifyDomain;

    if (!shop) {
      console.error('❌ Webhook missing shop domain');
      return res.status(400).json({
        success: false,
        message: 'Missing shop domain in webhook'
      });
    }

    console.log(`🔄 Processing uninstall webhook for shop: ${shop}`);

    // Verify webhook (Shopify API handles this automatically in callback)
    // For now, we'll trust the webhook if it comes from Shopify
    // In production, you should verify the webhook signature

    // Mark shop as uninstalled
    await shopifyService.uninstallShop(shop);

    console.log(`✅ Shop marked as uninstalled: ${shop}`);

    // Shopify expects 200 OK response
    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully'
    });

  } catch (error: any) {
    console.error('❌ Error processing uninstall webhook:', error);
    
    // Still return 200 to prevent Shopify from retrying
    // Log the error for investigation
    res.status(200).json({
      success: false,
      message: 'Webhook received but processing failed'
    });
  }
});

export default router;

