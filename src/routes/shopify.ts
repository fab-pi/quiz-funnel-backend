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

    // Get API key and secret for manual OAuth URL construction
    const apiKey = process.env.SHOPIFY_API_KEY;
    const scopes = process.env.SHOPIFY_SCOPES?.split(',').map(s => s.trim()).join(',') || 'read_products,write_products';
    
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        message: 'SHOPIFY_API_KEY is not configured'
      });
    }

    // Manually construct OAuth URL with correct redirect_uri
    // This ensures we use the backend domain (api.try-directquiz.com) instead of frontend domain
    const shopifyOAuthUrl = `https://${shop}/admin/oauth/authorize?` +
      `client_id=${apiKey}&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `redirect_uri=${encodeURIComponent(callbackUrl)}`;

    console.log(`   🔗 Redirecting to Shopify OAuth: ${shopifyOAuthUrl.replace(/client_id=[^&]+/, 'client_id=***')}`);
    
    // Redirect to Shopify OAuth page
    res.redirect(shopifyOAuthUrl);

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
    const code = req.query.code as string;
    const shop = req.query.shop as string;
    const host = req.query.host as string;

    if (!code || !shop) {
      throw new Error('Missing code or shop parameter in OAuth callback');
    }

    console.log('🔄 Processing OAuth callback...');
    console.log(`   Shop: ${shop}`);
    console.log(`   Host: ${host || 'not provided'}`);

    // Manually exchange authorization code for access token
    const apiKey = process.env.SHOPIFY_API_KEY;
    const apiSecret = process.env.SHOPIFY_API_SECRET;
    const callbackUrl = process.env.SHOPIFY_CALLBACK_URL || 'https://api.try-directquiz.com/api/shopify/auth/callback';

    if (!apiKey || !apiSecret) {
      throw new Error('SHOPIFY_API_KEY or SHOPIFY_API_SECRET is not configured');
    }

    // Exchange code for access token using Shopify REST API
    const tokenUrl = `https://${shop}/admin/oauth/access_token`;
    
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: apiKey,
        client_secret: apiSecret,
        code: code,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Failed to exchange code for token: ${tokenResponse.status} ${errorText}`);
    }

    const tokenData = await tokenResponse.json() as { access_token: string; scope?: string };
    const accessToken = tokenData.access_token;
    const scope = tokenData.scope || '';

    if (!accessToken) {
      throw new Error('Failed to obtain access token from Shopify');
    }

    console.log(`✅ OAuth successful for shop: ${shop}`);
    console.log(`   Access token obtained, scope: ${scope}`);

    // Store shop in database
    await shopifyService.storeShop({
      shopDomain: shop,
      accessToken: accessToken,
      scope: scope,
    });

    // Redirect to app
    const appUrl = process.env.SHOPIFY_APP_URL || 'https://quiz.try-directquiz.com';
    const redirectUrl = `${appUrl}/shopify?shop=${shop}${host ? `&host=${host}` : ''}`;

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

