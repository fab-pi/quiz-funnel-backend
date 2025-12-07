import { Router, Request, Response, NextFunction } from 'express';
import { ShopifyService } from '../services/shopify/ShopifyService';
import { QuizContentService } from '../services/QuizContentService';
import pool from '../config/db';

const router = Router();
const shopifyService = new ShopifyService(pool);
const quizContentService = new QuizContentService(pool);

// Debug: Log route definitions
console.log('🔧 Defining Shopify routes:');
console.log('  - GET  /shopify/auth');
console.log('  - GET  /shopify/auth/callback');
console.log('  - POST /shopify/webhooks/app/uninstalled');
console.log('  - GET  /shopify/proxy/:quizId (App Proxy)');

// Test route to verify proxy endpoint is accessible
router.get('/shopify/proxy/test', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'App Proxy test endpoint is working',
    query: req.query,
    path: req.path,
    url: req.url
  });
});

// Catch-all route for debugging - log ALL requests to /shopify/proxy/*
router.all('/shopify/proxy*', (req: Request, res: Response, next: NextFunction) => {
  console.log('🔍 [DEBUG] Request received at /shopify/proxy*');
  console.log('   Method:', req.method);
  console.log('   URL:', req.url);
  console.log('   Path:', req.path);
  console.log('   Query:', JSON.stringify(req.query));
  console.log('   Headers:', JSON.stringify({
    'x-shopify-shop-domain': req.get('X-Shopify-Shop-Domain'),
    'user-agent': req.get('User-Agent'),
  }));
  next(); // Continue to next route handler
});

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

/**
 * GET /api/shopify/proxy/:quizId
 * Shopify App Proxy endpoint
 * Handles requests from store.myshopify.com/apps/quiz/{quizId}
 * Validates signature, verifies shop, and serves quiz content
 * 
 * Shopify sends requests as: /shopify/proxy/{quizId}?shop=...&signature=...
 */
router.get('/shopify/proxy/:quizId', async (req: Request, res: Response) => {
  try {
    console.log('🔄 App Proxy request received');
    console.log('   Method:', req.method);
    console.log('   URL:', req.url);
    console.log('   Path:', req.path);
    console.log('   Query:', JSON.stringify(req.query));
    console.log('   Headers:', JSON.stringify({
      'x-shopify-shop-domain': req.get('X-Shopify-Shop-Domain'),
      'user-agent': req.get('User-Agent'),
    }));
    
    // Extract shop domain from query parameters or headers
    const shop = (req.query.shop as string) || req.get('X-Shopify-Shop-Domain');
    
    if (!shop) {
      console.error('❌ App Proxy request missing shop parameter');
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Error</title></head>
        <body>
          <h1>Error</h1>
          <p>Missing shop parameter. Please ensure you're accessing this quiz from your Shopify store.</p>
        </body>
        </html>
      `);
    }

    // Validate shop domain format
    if (!shop.includes('.myshopify.com') && !shop.includes('.')) {
      console.error('❌ Invalid shop domain format:', shop);
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Error</title></head>
        <body>
          <h1>Error</h1>
          <p>Invalid shop domain format.</p>
        </body>
        </html>
      `);
    }

    // Validate Shopify signature
    const isValidSignature = shopifyService.validateProxySignature(req.query as Record<string, string | string[] | undefined>, shop);
    
    if (!isValidSignature) {
      console.error('❌ App Proxy signature validation failed for shop:', shop);
      return res.status(401).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Unauthorized</title></head>
        <body>
          <h1>Unauthorized</h1>
          <p>Invalid request signature. Please ensure you're accessing this quiz from your Shopify store.</p>
        </body>
        </html>
      `);
    }

    // Verify shop is installed
    const shopData = await shopifyService.getShopByDomain(shop);
    
    if (!shopData) {
      console.error('❌ Shop not found or not installed:', shop);
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head><title>App Not Installed</title></head>
        <body>
          <h1>App Not Installed</h1>
          <p>This app is not installed on your store. Please install the Direct Quiz app first.</p>
        </body>
        </html>
      `);
    }

    if (shopData.uninstalledAt) {
      console.error('❌ Shop has uninstalled the app:', shop);
      return res.status(403).send(`
        <!DOCTYPE html>
        <html>
        <head><title>App Uninstalled</title></head>
        <body>
          <h1>App Uninstalled</h1>
          <p>This app has been uninstalled from your store. Please reinstall the Direct Quiz app.</p>
        </body>
        </html>
      `);
    }

    // Extract quiz ID from path parameter
    // Shopify sends requests as: /shopify/proxy/{quizId}
    // The quizId is in req.params.quizId
    const quizIdParam = req.params.quizId;
    
    if (!quizIdParam || !/^\d+$/.test(quizIdParam)) {
      console.error('❌ App Proxy request missing or invalid quiz ID:', quizIdParam);
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Error</title></head>
        <body>
          <h1>Error</h1>
          <p>Invalid quiz ID. Please check the quiz URL.</p>
          <p>Expected format: yourstore.myshopify.com/apps/quiz/123</p>
        </body>
        </html>
      `);
    }

    const quizId = parseInt(quizIdParam, 10);
    console.log(`🔄 App Proxy request for shop: ${shop}, quiz: ${quizId}`);

    // Verify quiz belongs to this shop
    const client = await pool.connect();
    try {
      const quizCheck = await client.query(
        'SELECT quiz_id, shop_id, is_active FROM quizzes WHERE quiz_id = $1',
        [quizId]
      );

      if (quizCheck.rows.length === 0) {
        return res.status(404).send(`
          <!DOCTYPE html>
          <html>
          <head><title>Quiz Not Found</title></head>
          <body>
            <h1>Quiz Not Found</h1>
            <p>The requested quiz could not be found.</p>
          </body>
          </html>
        `);
      }

      const quiz = quizCheck.rows[0];

      // Verify quiz belongs to this shop
      if (quiz.shop_id !== shopData.shopId) {
        console.error(`❌ Quiz ${quizId} does not belong to shop ${shop}`);
        return res.status(403).send(`
          <!DOCTYPE html>
          <html>
          <head><title>Unauthorized</title></head>
          <body>
            <h1>Unauthorized</h1>
            <p>You do not have access to this quiz.</p>
          </body>
          </html>
        `);
      }

      // Check if quiz is active
      if (!quiz.is_active) {
        return res.status(404).send(`
          <!DOCTYPE html>
          <html>
          <head><title>Quiz Not Available</title></head>
          <body>
            <h1>Quiz Not Available</h1>
            <p>This quiz is currently inactive.</p>
          </body>
          </html>
        `);
      }
    } finally {
      client.release();
    }

    // Get frontend URL from environment
    const frontendUrl = process.env.SHOPIFY_APP_URL || 'https://quiz.try-directquiz.com';
    
    // Redirect to frontend quiz page with shop context
    // The frontend will handle rendering the quiz without store header/footer
    const quizUrl = `${frontendUrl}/quiz/${quizId}?shop=${encodeURIComponent(shop)}&proxy=true`;
    
    console.log(`✅ App Proxy validated, redirecting to quiz: ${quizUrl}`);
    
    // Redirect to frontend quiz page
    res.redirect(quizUrl);

  } catch (error: any) {
    console.error('❌ Error in App Proxy:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Error</title></head>
      <body>
        <h1>Error</h1>
        <p>An error occurred while loading the quiz. Please try again later.</p>
      </body>
      </html>
    `);
  }
});

export default router;

