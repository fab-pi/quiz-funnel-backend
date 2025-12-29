import express, { Router, Request, Response, NextFunction } from 'express';
import { ShopifyService } from '../services/shopify/ShopifyService';
import { ShopifyBillingService } from '../services/shopify/ShopifyBillingService';
import { QuizContentService } from '../services/QuizContentService';
import { captureRawQueryString, RawQueryRequest } from '../middleware/rawQueryString';
import { shopifyAuthenticate, ShopifyRequest } from '../middleware/shopifyAuth';
import pool from '../config/db';

const router = Router();
const shopifyService = new ShopifyService(pool);
const shopifyBillingService = new ShopifyBillingService(pool, shopifyService);
const quizContentService = new QuizContentService(pool);

/**
 * Rewrite relative asset URLs to absolute URLs pointing to the frontend domain
 * This fixes 404 errors when Next.js assets are loaded from the shop domain
 */
function rewriteAssetUrls(html: string, frontendUrl: string): string {
  // Remove trailing slash from frontendUrl
  const baseUrl = frontendUrl.replace(/\/$/, '');
  
  // Patterns to match:
  // - href="/_next/static/..." -> href="https://quiz.try-directquiz.com/_next/static/..."
  // - src="/_next/static/..." -> src="https://quiz.try-directquiz.com/_next/static/..."
  // - href="/favicon.ico" -> href="https://quiz.try-directquiz.com/favicon.ico"
  // - Any relative URL starting with /
  
  // Rewrite href attributes with relative URLs
  html = html.replace(/href="\/([^"]+)"/g, (match, path) => {
    // Skip if already absolute URL
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//')) {
      return match;
    }
    return `href="${baseUrl}/${path}"`;
  });
  
  // Rewrite src attributes with relative URLs
  html = html.replace(/src="\/([^"]+)"/g, (match, path) => {
    // Skip if already absolute URL
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//')) {
      return match;
    }
    return `src="${baseUrl}/${path}"`;
  });
  
  // Rewrite srcset attributes (for responsive images)
  html = html.replace(/srcset="([^"]+)"/g, (match, srcset) => {
    return `srcset="${srcset.split(',').map((src: string) => {
      const trimmed = src.trim();
      if (trimmed.startsWith('/') && !trimmed.startsWith('http://') && !trimmed.startsWith('https://') && !trimmed.startsWith('//')) {
        return trimmed.replace(/^\//, `${baseUrl}/`);
      }
      return trimmed;
    }).join(', ')}"`;
  });
  
  // Rewrite action attributes (for forms)
  html = html.replace(/action="\/([^"]+)"/g, (match, path) => {
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//')) {
      return match;
    }
    return `action="${baseUrl}/${path}"`;
  });
  
  // Rewrite URLs in CSS (url() references)
  html = html.replace(/url\(["']?\/([^"')]+)["']?\)/g, (match, path) => {
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//')) {
      return match;
    }
    return `url("${baseUrl}/${path}")`;
  });
  
  // CRITICAL: Rewrite URLs in RSC payload (self.__next_f.push() format)
  // Next.js App Router uses RSC streaming with chunk paths like "/_next/static/chunks/..."
  // These need to be absolute URLs for the scripts to load correctly
  // Pattern: "/_next/static/chunks/..." inside quotes in the RSC payload
  html = html.replace(/"(\/_next\/static\/[^"]+)"/g, (match, path) => {
    // Don't rewrite if already absolute
    if (path.includes('http://') || path.includes('https://')) {
      return match;
    }
    // Rewrite relative paths in RSC payload to absolute URLs
    return `"${baseUrl}${path}"`;
  });
  
  return html;
}

/**
 * Inject CSS to hide Shopify theme elements and ensure full-height rendering
 */
function injectShopifyThemeHidingCSS(html: string): string {
  const hideThemeCSS = `
    <style id="shopify-proxy-theme-hide">
      /* Hide Shopify store header and footer - very aggressive selectors */
      #shopify-section-header,
      #shopify-section-footer,
      .shopify-section-header,
      .shopify-section-footer,
      .header-wrapper,
      .footer-wrapper,
      .site-header,
      .site-footer,
      header:not(#quiz-container header):not(#__next header),
      footer:not(#quiz-container footer):not(#__next footer),
      .shopify-section:not(#quiz-container),
      nav:not(#quiz-container nav):not(#__next nav),
      .shopify-section-header,
      .shopify-section-footer,
      [class*="header"],
      [class*="Header"],
      [class*="footer"],
      [class*="Footer"],
      [id*="header"],
      [id*="Header"],
      [id*="footer"],
      [id*="Footer"] {
        display: none !important;
        visibility: hidden !important;
        height: 0 !important;
        max-height: 0 !important;
        overflow: hidden !important;
        margin: 0 !important;
        padding: 0 !important;
        opacity: 0 !important;
        position: absolute !important;
        left: -9999px !important;
      }
      
      /* Ensure main content area takes full height - override all theme constraints */
      html, body {
        height: 100vh !important;
        min-height: 100vh !important;
        max-height: 100vh !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow-x: hidden !important;
        overflow-y: auto !important;
      }
      
      /* Override all possible container constraints */
      main,
      .main-content,
      .page-content,
      #MainContent,
      .container,
      .page-container,
      .content-wrapper,
      [class*="container"],
      [class*="Container"],
      [class*="wrapper"],
      [class*="Wrapper"] {
        height: 100vh !important;
        min-height: 100vh !important;
        max-width: 100% !important;
        width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        box-sizing: border-box !important;
      }
      
      /* Ensure quiz container is full height */
      #__next,
      #quiz-container,
      [data-quiz-container],
      body > div:first-child {
        height: 100vh !important;
        min-height: 100vh !important;
        width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        display: block !important;
      }
    </style>
    <script>
      // Also hide elements via JavaScript as a fallback
      (function() {
        function hideShopifyElements() {
          const selectors = [
            '#shopify-section-header',
            '#shopify-section-footer',
            '.shopify-section-header',
            '.shopify-section-footer',
            '.header-wrapper',
            '.footer-wrapper',
            '.site-header',
            '.site-footer'
          ];
          selectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
              if (el && !el.closest('#quiz-container') && !el.closest('#__next')) {
                el.style.display = 'none';
                el.style.visibility = 'hidden';
                el.style.height = '0';
                el.style.overflow = 'hidden';
              }
            });
          });
        }
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', hideShopifyElements);
        } else {
          hideShopifyElements();
        }
        // Also run after a delay to catch dynamically loaded elements
        setTimeout(hideShopifyElements, 100);
        setTimeout(hideShopifyElements, 500);
      })();
    </script>
  `;
  
  // Inject CSS before closing </head> tag
  if (html.includes('</head>')) {
    html = html.replace('</head>', `${hideThemeCSS}</head>`);
  } else {
    // If no </head> tag, inject at the beginning
    html = hideThemeCSS + html;
  }
  
  return html;
}

/**
 * Generate HTML shell for App Proxy
 * This HTML loads the React quiz app directly (no iframe) and keeps the URL on the shop domain
 * Uses Content-Type: application/liquid to integrate directly into Shopify theme without container wrapper
 */
function generateQuizHTMLShell(quizId: number, shop: string): string {
  const frontendUrl = process.env.SHOPIFY_APP_URL || 'https://quiz.try-directquiz.com';
  const apiUrl = process.env.API_URL || 'https://api.try-directquiz.com/api';
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quiz</title>
  <meta name="robots" content="noindex, nofollow">
  
  <!-- Prevent Shopify theme styles from interfering -->
  <style>
    /* Reset and base styles */
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    html, body {
      width: 100%;
      height: 100%;
      min-height: 100vh;
      overflow-x: hidden;
      margin: 0;
      padding: 0;
    }
    
    /* Hide Shopify store header and footer */
    #shopify-section-header,
    #shopify-section-footer,
    .shopify-section-header,
    .shopify-section-footer,
    .header-wrapper,
    .footer-wrapper,
    .site-header,
    .site-footer,
    header,
    footer {
      display: none !important;
      visibility: hidden !important;
      height: 0 !important;
      overflow: hidden !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    
    /* Ensure main content area takes full height */
    main,
    .main-content,
    .page-content,
    #MainContent {
      height: 100vh !important;
      min-height: 100vh !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    
    /* Loading state */
    #quiz-loader {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100vh;
      min-height: 100vh;
      background: #f9fafb;
      position: fixed;
      top: 0;
      left: 0;
      z-index: 9999;
    }
    
    .spinner {
      border: 3px solid #f3f4f6;
      border-top: 3px solid #3b82f6;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    
    /* Quiz container - full height */
    #quiz-container {
      width: 100%;
      height: 100vh;
      min-height: 100vh;
      margin: 0;
      padding: 0;
      position: relative;
    }
    
    /* Override any Shopify theme container constraints */
    .container,
    .page-container,
    .content-wrapper {
      max-width: 100% !important;
      width: 100% !important;
      height: 100vh !important;
      min-height: 100vh !important;
      margin: 0 !important;
      padding: 0 !important;
    }
  </style>
</head>
<body>
  <div id="quiz-loader">
    <div class="spinner"></div>
  </div>
  
  <div id="quiz-container"></div>
  
  <script>
    // Configuration passed to the quiz app
    window.__QUIZ_CONFIG__ = {
      quizId: ${quizId},
      shop: ${JSON.stringify(shop)},
      frontendUrl: ${JSON.stringify(frontendUrl)},
      apiUrl: ${JSON.stringify(apiUrl)},
      proxy: true
    };
    
    // Extract UTM parameters from current URL
    function extractUTMParams() {
      const params = new URLSearchParams(window.location.search);
      const utmParams = {};
      for (const [key, value] of params.entries()) {
        if (key.toLowerCase().startsWith('utm_')) {
          utmParams[key] = value;
        }
      }
      return utmParams;
    }
    
    // Add UTM parameters to window config
    window.__QUIZ_CONFIG__.utmParams = extractUTMParams();
    
    // Load the quiz app directly (no iframe)
    // Fetch the quiz page HTML and inject it into the container
    function loadQuizApp() {
      const config = window.__QUIZ_CONFIG__;
      
      // Build the quiz URL with all necessary parameters
      const quizUrl = new URL(config.frontendUrl + '/quiz/' + config.quizId);
      quizUrl.searchParams.set('shop', config.shop);
      quizUrl.searchParams.set('proxy', 'true');
      
      // Add UTM parameters from the current URL
      Object.keys(config.utmParams).forEach(key => {
        quizUrl.searchParams.set(key, config.utmParams[key]);
      });
      
      // Fetch the quiz page HTML
      fetch(quizUrl.toString(), {
        method: 'GET',
        mode: 'cors',
        credentials: 'include',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      })
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to load quiz: ' + response.status);
        }
        return response.text();
      })
      .then(html => {
        // Parse the HTML
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Get the body content (this contains the React app)
        const bodyContent = doc.body;
        
        // Clear container and inject content
        const container = document.getElementById('quiz-container');
        container.innerHTML = '';
        
        // Move all child nodes from parsed body to container
        while (bodyContent.firstChild) {
          container.appendChild(bodyContent.firstChild);
        }
        
        // Execute scripts from the parsed document
        const scripts = doc.querySelectorAll('script');
        scripts.forEach(oldScript => {
          const newScript = document.createElement('script');
          
          if (oldScript.src) {
            // External script - copy src
            newScript.src = oldScript.src;
            newScript.async = oldScript.async;
            newScript.defer = oldScript.defer;
          } else {
            // Inline script - copy content
            newScript.textContent = oldScript.textContent;
          }
          
          // Copy other attributes
          Array.from(oldScript.attributes).forEach(attr => {
            if (attr.name !== 'src') {
              newScript.setAttribute(attr.name, attr.value);
            }
          });
          
          document.head.appendChild(newScript);
        });
        
        // Copy stylesheets
        const stylesheets = doc.querySelectorAll('link[rel="stylesheet"]');
        stylesheets.forEach(link => {
          if (!document.querySelector('link[href="' + link.href + '"]')) {
            document.head.appendChild(link.cloneNode(true));
          }
        });
        
        // Hide loader
        document.getElementById('quiz-loader').style.display = 'none';
        
        // Ensure container is visible and full height
        container.style.display = 'block';
        container.style.height = '100vh';
        container.style.minHeight = '100vh';
      })
      .catch(error => {
        console.error('Error loading quiz:', error);
        document.getElementById('quiz-loader').innerHTML = 
          '<div style="text-align: center; padding: 2rem; color: #ef4444;">' +
          '<p style="font-size: 1.2rem; margin-bottom: 1rem;">Failed to load quiz</p>' +
          '<p>' + error.message + '</p>' +
          '<p style="margin-top: 1rem; font-size: 0.9rem;">Please try refreshing the page.</p>' +
          '</div>';
      });
    }
    
    // Start loading when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', loadQuizApp);
    } else {
      loadQuizApp();
    }
    
    // Force full height on window resize
    window.addEventListener('resize', function() {
      const container = document.getElementById('quiz-container');
      if (container) {
        container.style.height = window.innerHeight + 'px';
        container.style.minHeight = window.innerHeight + 'px';
      }
    });
  </script>
</body>
</html>`;
}

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
// Uses captureRawQueryString middleware to capture raw query string for debugging
router.all('/shopify/proxy*', captureRawQueryString, (req: RawQueryRequest, res: Response, next: NextFunction) => {
  console.log('🔍 [DEBUG] Request received at /shopify/proxy*');
  console.log('   Method:', req.method);
  console.log('   URL:', req.url);
  console.log('   Path:', req.path);
  console.log('   Raw Query String:', req.rawQueryString);
  console.log('   Parsed Query:', JSON.stringify(req.query));
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

    // Use Shopify's standard OAuth initiation
    // This handles state parameter, HMAC validation, and proper redirects
    await shopify.auth.begin({
      shop: shop,
      callbackPath: '/api/shopify/auth/callback',
      isOnline: false, // Offline token (app-level, doesn't expire)
      rawRequest: req,
      rawResponse: res,
    });

    // shopify.auth.begin() handles the redirect automatically
    // No need to manually construct OAuth URL or send HTML

  } catch (error: any) {
    console.error('❌ Error initiating OAuth:', error);
    
    // Only send error response if headers haven't been sent yet
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to initiate OAuth flow'
      });
    }
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
    const host = req.query.host as string;

    console.log('🔄 Processing OAuth callback...');
    console.log(`   Host: ${host || 'not provided'}`);

    const shopify = shopifyService.getShopifyApi();

    // Use Shopify's standard OAuth callback
    // This handles HMAC validation, state parameter validation, and token exchange
    const callbackResponse = await shopify.auth.callback({
      rawRequest: req,
      rawResponse: res,
    });

    // Extract session from callback response
    const session = callbackResponse.session;

    if (!session || !session.accessToken) {
      throw new Error('Failed to obtain session from OAuth callback');
    }

    console.log(`✅ OAuth callback successful for shop: ${session.shop}`);
    console.log(`   Session ID: ${session.id}`);
    console.log(`   Scope: ${session.scope || 'not provided'}`);

    // Store session using new storeShopFromSession method
    const storedShop = await shopifyService.storeShopFromSession(session);

    /**
     * Register billing webhook: APP_SUBSCRIPTIONS_UPDATE
     * Shopify docs recommend using webhookSubscriptionCreate for app webhooks.
     * We do this here so every installed shop has the billing webhook configured.
     * If this fails, we log a warning but do NOT block the OAuth flow.
     */
    try {
      console.log(`🔄 Ensuring APP_SUBSCRIPTIONS_UPDATE webhook is registered for shop ${session.shop}...`);

      const graphqlClient = await shopifyService.createGraphQLClient(session.shop);

      const webhookMutation = `
        mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
          webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
            webhookSubscription {
              id
              callbackUrl
              topic
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      // Base URL for webhook callback – must be publicly accessible over HTTPS
      const webhookBaseUrl =
        process.env.SHOPIFY_WEBHOOK_BASE_URL ||
        process.env.API_BASE_URL ||
        'https://api.try-directquiz.com';

      const webhookCallbackUrl = `${webhookBaseUrl.replace(/\/+$/, '')}/api/shopify/webhooks/app_subscriptions/update`;

      const webhookVariables = {
        topic: 'APP_SUBSCRIPTIONS_UPDATE',
        webhookSubscription: {
          callbackUrl: webhookCallbackUrl,
          format: 'JSON' as const,
        },
      };

      const webhookResponse = await graphqlClient.query({
        data: {
          query: webhookMutation,
          variables: webhookVariables,
        },
      });

      if (!webhookResponse || !webhookResponse.body || !webhookResponse.body.data) {
        console.warn('⚠️ APP_SUBSCRIPTIONS_UPDATE webhook registration returned empty response body');
      } else {
        const result = webhookResponse.body.data.webhookSubscriptionCreate;

        if (result.userErrors && result.userErrors.length > 0) {
          // Common benign case: webhook already exists -> user error about duplicate subscription
          const messages = result.userErrors.map((e: { field: string[] | null; message: string }) => e.message).join(', ');
          console.warn(`⚠️ APP_SUBSCRIPTIONS_UPDATE webhook registration returned userErrors: ${messages}`);
        } else if (result.webhookSubscription) {
          console.log('✅ APP_SUBSCRIPTIONS_UPDATE webhook registered:', result.webhookSubscription);
        } else {
          console.warn('⚠️ APP_SUBSCRIPTIONS_UPDATE webhook registration returned no subscription and no errors');
        }
      }
    } catch (webhookError: any) {
      // Do not fail OAuth flow if webhook registration fails; just log for later investigation
      console.warn(
        `⚠️ Failed to register APP_SUBSCRIPTIONS_UPDATE webhook for shop ${session.shop}:`,
        webhookError?.message || webhookError
      );
    }

    /**
     * Register app uninstall webhook: APP_UNINSTALLED
     * Shopify docs recommend using webhookSubscriptionCreate for app webhooks.
     * We do this here so every installed shop has the uninstall webhook configured.
     * If this fails, we log a warning but do NOT block the OAuth flow.
     */
    try {
      console.log(`🔄 Ensuring APP_UNINSTALLED webhook is registered for shop ${session.shop}...`);

      const graphqlClient = await shopifyService.createGraphQLClient(session.shop);

      const webhookMutation = `
        mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
          webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
            webhookSubscription {
              id
              callbackUrl
              topic
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      // Base URL for webhook callback – must be publicly accessible over HTTPS
      const webhookBaseUrl =
        process.env.SHOPIFY_WEBHOOK_BASE_URL ||
        process.env.API_BASE_URL ||
        'https://api.try-directquiz.com';

      const webhookCallbackUrl = `${webhookBaseUrl.replace(/\/+$/, '')}/api/shopify/webhooks/app/uninstalled`;

      const webhookVariables = {
        topic: 'APP_UNINSTALLED',
        webhookSubscription: {
          callbackUrl: webhookCallbackUrl,
          format: 'JSON' as const,
        },
      };

      const webhookResponse = await graphqlClient.query({
        data: {
          query: webhookMutation,
          variables: webhookVariables,
        },
      });

      if (!webhookResponse || !webhookResponse.body || !webhookResponse.body.data) {
        console.warn('⚠️ APP_UNINSTALLED webhook registration returned empty response body');
      } else {
        const result = webhookResponse.body.data.webhookSubscriptionCreate;

        if (result.userErrors && result.userErrors.length > 0) {
          // Common benign case: webhook already exists -> user error about duplicate subscription
          const messages = result.userErrors.map((e: { field: string[] | null; message: string }) => e.message).join(', ');
          console.warn(`⚠️ APP_UNINSTALLED webhook registration returned userErrors: ${messages}`);
        } else if (result.webhookSubscription) {
          console.log('✅ APP_UNINSTALLED webhook registered:', result.webhookSubscription);
        } else {
          console.warn('⚠️ APP_UNINSTALLED webhook registration returned no subscription and no errors');
        }
      }
    } catch (webhookError: any) {
      // Do not fail OAuth flow if webhook registration fails; just log for later investigation
      console.warn(
        `⚠️ Failed to register APP_UNINSTALLED webhook for shop ${session.shop}:`,
        webhookError?.message || webhookError
      );
    }

    /**
     * Register mandatory compliance webhooks (Privacy law compliance)
     * Topics required for Shopify App Store submission:
     * - customers/data_request
     * - customers/redact
     * - shop/redact
     *
     * Docs: https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance
     *
     * If registration fails, we log a warning but do NOT block OAuth flow.
     */
    try {
      console.log(`🔄 Ensuring mandatory compliance webhooks are registered for shop ${session.shop}...`);

      const graphqlClient = await shopifyService.createGraphQLClient(session.shop);

      const webhookMutation = `
        mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
          webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
            webhookSubscription {
              id
              callbackUrl
              topic
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const webhookBaseUrl =
        process.env.SHOPIFY_WEBHOOK_BASE_URL ||
        process.env.API_BASE_URL ||
        'https://api.try-directquiz.com';

      const base = webhookBaseUrl.replace(/\/+$/, '');

      // Use a single callback URL for all compliance topics.
      // Shopify CLI config uses a single `uri` for compliance topics, and Shopify sends the topic in headers.
      const topics: Array<{ topic: string; path: string }> = [
        { topic: 'CUSTOMERS_DATA_REQUEST', path: '/api/shopify/webhooks/compliance' },
        { topic: 'CUSTOMERS_REDACT', path: '/api/shopify/webhooks/compliance' },
        { topic: 'SHOP_REDACT', path: '/api/shopify/webhooks/compliance' },
      ];

      for (const t of topics) {
        const webhookCallbackUrl = `${base}${t.path}`;

        const webhookVariables = {
          topic: t.topic,
          webhookSubscription: {
            callbackUrl: webhookCallbackUrl,
            format: 'JSON' as const,
          },
        };

        const webhookResponse = await graphqlClient.query({
          data: {
            query: webhookMutation,
            variables: webhookVariables,
          },
        });

        if (!webhookResponse || !webhookResponse.body || !webhookResponse.body.data) {
          console.warn(`⚠️ ${t.topic} webhook registration returned empty response body`);
          continue;
        }

        const result = webhookResponse.body.data.webhookSubscriptionCreate;

        if (result.userErrors && result.userErrors.length > 0) {
          const messages = result.userErrors
            .map((e: { field: string[] | null; message: string }) => e.message)
            .join(', ');
          console.warn(`⚠️ ${t.topic} webhook registration returned userErrors: ${messages}`);
        } else if (result.webhookSubscription) {
          console.log(`✅ ${t.topic} webhook registered:`, result.webhookSubscription);
        } else {
          console.warn(`⚠️ ${t.topic} webhook registration returned no subscription and no errors`);
        }
      }
    } catch (webhookError: any) {
      console.warn(
        `⚠️ Failed to register compliance webhooks for shop ${session.shop}:`,
        webhookError?.message || webhookError
      );
    }

    // Set any headers from callback response (if needed)
    if (callbackResponse.headers) {
      Object.entries(callbackResponse.headers).forEach(([key, value]) => {
        res.setHeader(key, value as string | number | readonly string[]);
      });
    }

    // Check if shop has an active subscription
    const activeSubscription = await shopifyBillingService.getActiveSubscriptionByShopId(storedShop.shopId);

    const appUrl = process.env.SHOPIFY_APP_URL || 'https://quiz.try-directquiz.com';
    
    // After OAuth callback, redirect to App URL (frontend)
    // Shopify will automatically load the app embedded when accessing admin.shopify.com/store/.../apps/...
    // The App URL should include /shopify path if configured that way in Partner Dashboard
    // Include shop and host parameters so App Bridge can initialize correctly
    
    if (!activeSubscription || (activeSubscription.status !== 'ACTIVE' && activeSubscription.status !== 'TRIAL')) {
      // No active subscription, redirect to plan selection
      const redirectUrl = `${appUrl}/shopify/plans?shop=${encodeURIComponent(session.shop)}${host ? `&host=${encodeURIComponent(host)}` : ''}`;
      console.log(`ℹ️ No active subscription found for shop ${session.shop}, redirecting to plan selection: ${redirectUrl}`);
      res.redirect(redirectUrl);
      return;
    }

    // Has active subscription, redirect to dashboard
    const redirectUrl = `${appUrl}/shopify?shop=${encodeURIComponent(session.shop)}${host ? `&host=${encodeURIComponent(host)}` : ''}`;
    console.log(`✅ Redirecting to app dashboard: ${redirectUrl}`);
    res.redirect(redirectUrl);

  } catch (error: any) {
    console.error('❌ Error in OAuth callback:', error);
    
    // Redirect to error page or show error
    const appUrl = process.env.SHOPIFY_APP_URL || 'https://quiz.try-directquiz.com';
    res.redirect(`${appUrl}/shopify?error=oauth_failed&message=${encodeURIComponent(error.message || 'OAuth failed')}`);
  }
});

/**
 * Mandatory privacy compliance webhooks (Shopify App Store requirement)
 * Docs: https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance
 *
 * Requirements:
 * - Must accept POST with application/json
 * - Must validate webhook HMAC
 * - If invalid HMAC, return 401
 * - If valid, return 200-series
 */
router.post(
  '/shopify/webhooks/compliance',
  express.raw({ type: 'application/json' }),
  async (req: Request, res: Response) => {
    const shopify = shopifyService.getShopifyApi();

    // 1) Validate HMAC. Shopify requires 401 if invalid HMAC.
    let isValid = false;
    try {
      const validation = await shopify.webhooks.validate({
        rawBody: req.body,
        rawRequest: req,
        rawResponse: res,
      });
      isValid = (validation as any) === true || (validation as any)?.valid === true;
    } catch (error: any) {
      console.error('❌ Compliance webhook HMAC validation threw (shared endpoint):', error?.message || error);
      return res.status(401).send('Invalid webhook signature');
    }

    if (!isValid) {
      console.error('❌ Invalid compliance webhook signature (shared endpoint)');
      return res.status(401).send('Invalid webhook signature');
    }

    // 2) Process payload. If processing fails, still return 200 to acknowledge receipt.
    try {
      // Shopify includes the topic in headers (canonical) for webhooks
      const topic = (req.headers['x-shopify-topic'] as string) || '';

      // Parse JSON body after validation
      let payload;
      if (typeof req.body === 'string') {
        payload = JSON.parse(req.body);
      } else if (Buffer.isBuffer(req.body)) {
        payload = JSON.parse(req.body.toString('utf8'));
      } else if (typeof req.body === 'object' && req.body !== null) {
        // Already parsed (shouldn't happen with express.raw(), but handle it)
        payload = req.body;
      } else {
        throw new Error('Invalid request body type');
      }
      const shop = (req.headers['x-shopify-shop-domain'] as string) || payload?.shop_domain;

      console.log(`✅ Compliance webhook received (shared): ${topic || 'unknown'} (shop=${shop || 'unknown'})`);

      // Minimal compliant behavior: acknowledge receipt.
      // If you later need to implement data export/redaction, dispatch based on topic here.
      return res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('❌ Error processing compliance webhook (shared endpoint):', error);
      return res.status(200).json({ success: false });
    }
  }
);

router.post(
  '/shopify/webhooks/compliance/customers/data_request',
  express.raw({ type: 'application/json' }),
  async (req: Request, res: Response) => {
    const shopify = shopifyService.getShopifyApi();

    let isValid = false;
    try {
      const validation = await shopify.webhooks.validate({
        rawBody: req.body,
        rawRequest: req,
        rawResponse: res,
      });
      isValid = (validation as any) === true || (validation as any)?.valid === true;
    } catch (error: any) {
      console.error('❌ Compliance webhook HMAC validation threw (customers/data_request):', error?.message || error);
      return res.status(401).send('Invalid webhook signature');
    }

    if (!isValid) {
      console.error('❌ Invalid compliance webhook signature (customers/data_request)');
      return res.status(401).send('Invalid webhook signature');
    }

    try {
      // Parse JSON body after validation
      let payload;
      if (typeof req.body === 'string') {
        payload = JSON.parse(req.body);
      } else if (Buffer.isBuffer(req.body)) {
        payload = JSON.parse(req.body.toString('utf8'));
      } else if (typeof req.body === 'object' && req.body !== null) {
        // Already parsed (shouldn't happen with express.raw(), but handle it)
        payload = req.body;
      } else {
        throw new Error('Invalid request body type');
      }
      const shop = (req.headers['x-shopify-shop-domain'] as string) || payload?.shop_domain;
      console.log(`✅ Compliance webhook received: customers/data_request (shop=${shop || 'unknown'})`);

      return res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('❌ Error processing compliance webhook customers/data_request:', error);
      return res.status(200).json({ success: false });
    }
  }
);

router.post(
  '/shopify/webhooks/compliance/customers/redact',
  express.raw({ type: 'application/json' }),
  async (req: Request, res: Response) => {
    const shopify = shopifyService.getShopifyApi();

    let isValid = false;
    try {
      const validation = await shopify.webhooks.validate({
        rawBody: req.body,
        rawRequest: req,
        rawResponse: res,
      });
      isValid = (validation as any) === true || (validation as any)?.valid === true;
    } catch (error: any) {
      console.error('❌ Compliance webhook HMAC validation threw (customers/redact):', error?.message || error);
      return res.status(401).send('Invalid webhook signature');
    }

    if (!isValid) {
      console.error('❌ Invalid compliance webhook signature (customers/redact)');
      return res.status(401).send('Invalid webhook signature');
    }

    try {
      // Parse JSON body after validation
      let payload;
      if (typeof req.body === 'string') {
        payload = JSON.parse(req.body);
      } else if (Buffer.isBuffer(req.body)) {
        payload = JSON.parse(req.body.toString('utf8'));
      } else if (typeof req.body === 'object' && req.body !== null) {
        // Already parsed (shouldn't happen with express.raw(), but handle it)
        payload = req.body;
      } else {
        throw new Error('Invalid request body type');
      }
      const shop = (req.headers['x-shopify-shop-domain'] as string) || payload?.shop_domain;
      console.log(`✅ Compliance webhook received: customers/redact (shop=${shop || 'unknown'})`);

      return res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('❌ Error processing compliance webhook customers/redact:', error);
      return res.status(200).json({ success: false });
    }
  }
);

router.post(
  '/shopify/webhooks/compliance/shop/redact',
  express.raw({ type: 'application/json' }),
  async (req: Request, res: Response) => {
    const shopify = shopifyService.getShopifyApi();

    let isValid = false;
    try {
      const validation = await shopify.webhooks.validate({
        rawBody: req.body,
        rawRequest: req,
        rawResponse: res,
      });
      isValid = (validation as any) === true || (validation as any)?.valid === true;
    } catch (error: any) {
      console.error('❌ Compliance webhook HMAC validation threw (shop/redact):', error?.message || error);
      return res.status(401).send('Invalid webhook signature');
    }

    if (!isValid) {
      console.error('❌ Invalid compliance webhook signature (shop/redact)');
      return res.status(401).send('Invalid webhook signature');
    }

    try {
      // Parse JSON body after validation
      let payload;
      if (typeof req.body === 'string') {
        payload = JSON.parse(req.body);
      } else if (Buffer.isBuffer(req.body)) {
        payload = JSON.parse(req.body.toString('utf8'));
      } else if (typeof req.body === 'object' && req.body !== null) {
        // Already parsed (shouldn't happen with express.raw(), but handle it)
        payload = req.body;
      } else {
        throw new Error('Invalid request body type');
      }
      const shop = (req.headers['x-shopify-shop-domain'] as string) || payload?.shop_domain;
      console.log(`✅ Compliance webhook received: shop/redact (shop=${shop || 'unknown'})`);

      return res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('❌ Error processing compliance webhook shop/redact:', error);
      return res.status(200).json({ success: false });
    }
  }
);

/**
 * PUT /api/shopify/shop/refresh-primary-domain
 * Refreshes the primary domain for the authenticated shop
 * Fetches current primary domain from Shopify API and updates database
 * Protected: Requires Shopify authentication
 */
router.put('/shopify/shop/refresh-primary-domain', shopifyAuthenticate, async (req: ShopifyRequest, res: Response) => {
  try {
    const shopDomain = req.shop;
    if (!shopDomain) {
      return res.status(400).json({
        success: false,
        message: 'Shop domain is required'
      });
    }

    console.log(`🔄 Refreshing primary domain for shop: ${shopDomain}`);

    // Update primary domain (only if changed)
    const result = await shopifyService.updatePrimaryDomain(shopDomain);

    res.json({
      success: true,
      data: {
        primaryDomain: result.primaryDomain,
        updated: result.updated
      }
    });

  } catch (error: any) {
    console.error('❌ Error refreshing primary domain:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to refresh primary domain'
    });
  }
});

/**
 * GET /api/shopify/plans
 * Get available subscription plans
 * Public endpoint (no auth required for viewing plans)
 */
router.get('/shopify/plans', async (req: Request, res: Response) => {
  try {
    const { PLANS } = await import('../config/plans');
    
    res.json({
      success: true,
      data: PLANS.map(plan => ({
        id: plan.id,
        name: plan.name,
        price: plan.price,
        trialDays: plan.trialDays,
        maxSessions: plan.maxSessions,
        maxQuizzes: plan.maxQuizzes,
        features: plan.features
      }))
    });
  } catch (error: any) {
    console.error('❌ Error fetching plans:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch plans'
    });
  }
});

/**
 * GET /api/shopify/subscription/status
 * Get current subscription status and usage for authenticated shop
 * Protected: Requires Shopify authentication
 */
router.get('/shopify/subscription/status', shopifyAuthenticate, async (req: ShopifyRequest, res: Response) => {
  try {
    const shopDomain = req.shop;
    if (!shopDomain) {
      return res.status(400).json({
        success: false,
        message: 'Shop domain is required'
      });
    }

    // Get subscription from database (any status, including PENDING)
    let subscription = await shopifyBillingService.getSubscriptionByShopDomain(shopDomain);
    
    // If subscription is PENDING, sync status from Shopify to get real-time status
    // This handles the race condition where merchant approves but webhook hasn't arrived yet
    if (subscription && subscription.status === 'PENDING') {
      console.log(`🔄 Subscription status is PENDING for shop ${shopDomain}, syncing from Shopify...`);
      const syncedSubscription = await shopifyBillingService.syncSubscriptionStatusFromShopify(shopDomain);
      if (syncedSubscription) {
        // Shopify has active subscription - use synced status
        subscription = syncedSubscription;
      }
      // If sync returns null, Shopify doesn't have active subscription yet, keep PENDING status from DB
    }
    
    // If still no subscription found, try syncing from Shopify (might be a new subscription not yet in DB)
    if (!subscription) {
      console.log(`ℹ️ No subscription found in DB for shop ${shopDomain}, checking Shopify...`);
      subscription = await shopifyBillingService.syncSubscriptionStatusFromShopify(shopDomain);
    }
    
    // Get current billing period usage
    const client = await pool.connect();
    try {
      // Calculate billing period month based on subscription
      let billingPeriodMonth: Date;
      if (subscription && subscription.currentPeriodEnd) {
        // Calculate current billing period start
        const periodEnd = new Date(subscription.currentPeriodEnd);
        const periodStart = new Date(periodEnd);
        periodStart.setDate(periodStart.getDate() - 30); // Billing period is 30 days
        periodStart.setHours(0, 0, 0, 0);
        
        const now = new Date();
        if (now >= periodStart && now <= periodEnd) {
          // We're in the current period
          billingPeriodMonth = new Date(periodStart);
          billingPeriodMonth.setDate(1);
        } else {
          // We're in the next period (after current_period_end)
          const nextPeriodStart = new Date(periodEnd);
          nextPeriodStart.setDate(nextPeriodStart.getDate() + 1);
          nextPeriodStart.setHours(0, 0, 0, 0);
          billingPeriodMonth = new Date(nextPeriodStart);
          billingPeriodMonth.setDate(1);
        }
      } else if (subscription) {
        // No current_period_end, use created_at as starting point
        const createdAt = new Date(subscription.createdAt);
        createdAt.setHours(0, 0, 0, 0);
        const now = new Date();
        const daysSinceCreation = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
        const periodsSinceCreation = Math.floor(daysSinceCreation / 30);
        const currentPeriodStart = new Date(createdAt);
        currentPeriodStart.setDate(currentPeriodStart.getDate() + (periodsSinceCreation * 30));
        currentPeriodStart.setHours(0, 0, 0, 0);
        billingPeriodMonth = new Date(currentPeriodStart);
        billingPeriodMonth.setDate(1);
      } else {
        // No subscription, use calendar month as fallback
        billingPeriodMonth = new Date();
        billingPeriodMonth.setDate(1);
        billingPeriodMonth.setHours(0, 0, 0, 0);
      }
      
      const usageResult = await client.query(
        `SELECT sessions_count, active_quizzes_count 
         FROM shop_usage 
         WHERE shop_id = (SELECT shop_id FROM shops WHERE shop_domain = $1)
         AND month = $2`,
        [shopDomain, billingPeriodMonth]
      );

      const usage = usageResult.rows[0] || { sessions_count: 0, active_quizzes_count: 0 };

      // Get current active quizzes count
      const quizzesResult = await client.query(
        `SELECT COUNT(*) as count 
         FROM quizzes 
         WHERE shop_id = (SELECT shop_id FROM shops WHERE shop_domain = $1)
         AND is_active = true`,
        [shopDomain]
      );
      const activeQuizzes = parseInt(quizzesResult.rows[0]?.count || '0');

      // Get plan details
      const { PLANS, getPlanById } = await import('../config/plans');
      
      // Only return planId and planName if subscription is ACTIVE or TRIAL
      // If subscription is CANCELLED, EXPIRED, or PENDING, treat as no active subscription
      const isActiveSubscription = subscription && 
                                  (subscription.status === 'ACTIVE' || subscription.status === 'TRIAL');
      const plan = isActiveSubscription && subscription ? getPlanById(subscription.planId) : null;

      res.json({
        success: true,
        data: {
          planId: isActiveSubscription ? (subscription?.planId || null) : null,
          planName: isActiveSubscription ? (plan?.name || null) : null,
          status: subscription?.status || null,
          trialEndsAt: subscription?.trialEndsAt || null,
          isTrial: subscription?.isTrial || false,
          currentPeriodEnd: subscription?.currentPeriodEnd || null,
          currentMonthSessions: usage.sessions_count || 0,
          maxSessions: plan?.maxSessions || null,
          activeQuizzes: activeQuizzes,
          maxQuizzes: plan?.maxQuizzes || null,
          features: plan?.features || {
            facebookPixel: false,
            conversionAPI: false
          }
        }
      });
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('❌ Error fetching subscription status:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch subscription status'
    });
  }
});

/**
 * POST /api/shopify/subscription/create
 * Create a new subscription with selected plan
 * Protected: Requires Shopify authentication
 */
router.post('/shopify/subscription/create', shopifyAuthenticate, async (req: ShopifyRequest, res: Response) => {
  try {
    const shopDomain = req.shop;
    const { planId } = req.body;

    if (!shopDomain) {
      return res.status(400).json({
        success: false,
        message: 'Shop domain is required'
      });
    }

    if (!planId) {
      return res.status(400).json({
        success: false,
        message: 'Plan ID is required'
      });
    }

    // Validate plan ID
    const { PLANS, getPlanById } = await import('../config/plans');
    const plan = getPlanById(planId);
    if (!plan) {
      return res.status(400).json({
        success: false,
        message: `Invalid plan ID: ${planId}`
      });
    }

    // Get shop access token
    const shop = await shopifyService.getShopByDomain(shopDomain);
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }

    console.log(`🔄 Creating subscription for shop ${shopDomain} with plan ${planId}...`);

    // Create subscription
    const result = await shopifyBillingService.createSubscription(
      shopDomain,
      planId
    );

    res.json({
      success: true,
      data: {
        confirmationUrl: result.confirmationUrl,
        subscriptionGid: result.subscriptionGid,
        status: result.status,
        currentPeriodEnd: result.currentPeriodEnd
      }
    });
  } catch (error: any) {
    console.error('❌ Error creating subscription:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create subscription'
    });
  }
});

/**
 * POST /api/shopify/subscription/cancel
 * Cancel active subscription
 * Protected: Requires Shopify authentication
 */
router.post('/shopify/subscription/cancel', shopifyAuthenticate, async (req: ShopifyRequest, res: Response) => {
  try {
    const shopDomain = req.shop;
    if (!shopDomain) {
      return res.status(400).json({
        success: false,
        message: 'Shop domain is required'
      });
    }

    // Get active subscription
    const subscription = await shopifyBillingService.getActiveSubscriptionByShopDomain(shopDomain);
    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'No active subscription found'
      });
    }

    // Get shop access token
    const shop = await shopifyService.getShopByDomain(shopDomain);
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }

    // Cancel subscription
    await shopifyBillingService.cancelSubscription(
      shopDomain,
      subscription.subscriptionGid
    );

    res.json({
      success: true,
      message: 'Subscription cancelled successfully'
    });
  } catch (error: any) {
    console.error('❌ Error cancelling subscription:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to cancel subscription'
    });
  }
});

/**
 * POST /api/shopify/webhooks/app_subscriptions/update
 * Handles subscription update webhook from Shopify
 * Updates subscription status when merchant approves, cancels, or trial ends
 * 
 * IMPORTANT: This route must use express.raw() middleware to preserve raw body for HMAC validation
 * The raw body is required for webhook signature verification
 */
router.post('/shopify/webhooks/app_subscriptions/update', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  try {
    const shopify = shopifyService.getShopifyApi();
    const shop = req.headers['x-shopify-shop-domain'] as string;
    
    if (!shop) {
      console.error('❌ Webhook missing shop domain');
      return res.status(400).json({
        success: false,
        message: 'Missing shop domain in webhook'
      });
    }

    // Validate webhook HMAC signature
    const isValid = await shopify.webhooks.validate({
      rawBody: req.body, // Raw body buffer from express.raw()
      rawRequest: req,
      rawResponse: res,
    });

    if (!isValid) {
      console.error('❌ Invalid webhook signature');
      return res.status(401).json({
        success: false,
        message: 'Invalid webhook signature'
      });
    }

    // Parse JSON body after validation
    let payload;
    if (typeof req.body === 'string') {
      payload = JSON.parse(req.body);
    } else if (Buffer.isBuffer(req.body)) {
      payload = JSON.parse(req.body.toString('utf8'));
    } else if (typeof req.body === 'object' && req.body !== null) {
      // Already parsed (shouldn't happen with express.raw(), but handle it)
      payload = req.body;
    } else {
      throw new Error('Invalid request body type');
    }

    console.log(`🔄 Processing subscription update webhook for shop: ${shop}`);

    const appSubscription = payload.app_subscription;
    if (!appSubscription || !appSubscription.id) {
      return res.status(400).json({
        success: false,
        message: 'Missing app_subscription data'
      });
    }

    const subscriptionGid = appSubscription.id;
    const status = appSubscription.status; // ACTIVE, CANCELLED, EXPIRED, etc.
    const currentPeriodEnd = appSubscription.current_period_end 
      ? new Date(appSubscription.current_period_end) 
      : null;
    const trialDays = appSubscription.trial_days || 0;
    
    // Calculate trial end date
    const trialEndsAt = trialDays > 0 && appSubscription.created_at
      ? new Date(new Date(appSubscription.created_at).getTime() + trialDays * 24 * 60 * 60 * 1000)
      : null;
    
    const isTrial = trialDays > 0 && trialEndsAt && new Date() < trialEndsAt;

    // Get shop_id from database
    const client = await pool.connect();
    try {
      const shopResult = await client.query(
        'SELECT shop_id FROM shops WHERE shop_domain = $1',
        [shop]
      );

      if (shopResult.rows.length === 0) {
        console.error(`❌ Shop not found: ${shop}`);
        return res.status(404).json({
          success: false,
          message: 'Shop not found'
        });
      }

      const shopId = shopResult.rows[0].shop_id;

      // Update subscription in database
      await client.query(
        `UPDATE shop_subscriptions 
         SET status = $1,
             trial_days = $2,
             trial_ends_at = $3,
             is_trial = $4,
             current_period_end = $5,
             updated_at = CURRENT_TIMESTAMP
         WHERE subscription_gid = $6`,
        [status, trialDays, trialEndsAt, isTrial, currentPeriodEnd, subscriptionGid]
      );

      console.log(`✅ Subscription updated for shop ${shop}: ${subscriptionGid}`);
      console.log(`   Status: ${status}, Trial: ${isTrial}, Period End: ${currentPeriodEnd}`);

      res.status(200).json({
        success: true,
        message: 'Webhook processed successfully'
      });
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('❌ Error processing subscription update webhook:', error);
    res.status(200).json({
      success: false,
      message: 'Webhook received but processing failed'
    });
  }
});

/**
 * POST /api/shopify/webhooks/app/uninstalled
 * Handles app uninstall webhook from Shopify
 * Marks shop as uninstalled in database
 * 
 * IMPORTANT: This route must use express.raw() middleware to preserve raw body for HMAC validation
 * The raw body is required for webhook signature verification
 */
router.post('/shopify/webhooks/app/uninstalled', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  try {
    const shopify = shopifyService.getShopifyApi();
    
    // Validate webhook HMAC signature first
    const isValid = await shopify.webhooks.validate({
      rawBody: req.body, // Raw body buffer from express.raw()
      rawRequest: req,
      rawResponse: res,
    });

    if (!isValid) {
      console.error('❌ Invalid webhook signature');
      return res.status(401).json({
        success: false,
        message: 'Invalid webhook signature'
      });
    }

    // Parse JSON body after validation
    let payload;
    if (typeof req.body === 'string') {
      payload = JSON.parse(req.body);
    } else if (Buffer.isBuffer(req.body)) {
      payload = JSON.parse(req.body.toString('utf8'));
    } else if (typeof req.body === 'object' && req.body !== null) {
      // Already parsed (shouldn't happen with express.raw(), but handle it)
      payload = req.body;
    } else {
      throw new Error('Invalid request body type');
    }
    const shop = req.get('X-Shopify-Shop-Domain') || payload?.shop?.myshopifyDomain;

    if (!shop) {
      console.error('❌ Webhook missing shop domain');
      return res.status(400).json({
        success: false,
        message: 'Missing shop domain in webhook'
      });
    }

    console.log(`🔄 Processing uninstall webhook for shop: ${shop}`);

    // Cancel all active subscriptions (Shopify cancels them automatically, but we need to update our DB)
    try {
      await shopifyBillingService.cancelAllActiveSubscriptions(shop);
    } catch (error: any) {
      console.error(`⚠️ Error cancelling subscriptions during uninstall (non-critical):`, error);
      // Continue with uninstall even if subscription cancellation fails
    }

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
 * POST /api/shopify/web-vitals
 * Receives Web Vitals metrics from frontend for performance monitoring
 * Used to track LCP, CLS, and INP performance for Built for Shopify compliance
 * 
 * Metrics structure:
 * {
 *   appId: string,
 *   shopId: string,
 *   userId: string,
 *   appLoadId: string,
 *   metrics: Array<{ id, name, value }>,
 *   country?: string
 * }
 */
router.post('/shopify/web-vitals', express.json(), async (req: Request, res: Response) => {
  try {
    const metrics = req.body;
    
    // Log Web Vitals metrics for analysis
    // In production, you might want to store these in a database or analytics service
    console.log('📊 Web Vitals metrics received:', {
      appId: metrics.appId,
      shopId: metrics.shopId,
      appLoadId: metrics.appLoadId,
      country: metrics.country,
      metrics: metrics.metrics?.map((m: any) => ({
        name: m.name,
        value: m.value,
        id: m.id
      }))
    });
    
    // You can store metrics in database or send to analytics service here
    // For now, we just log them
    
    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('❌ Error processing Web Vitals:', error);
    // Don't fail the request - Web Vitals monitoring should be non-blocking
    res.status(200).json({ success: false });
  }
});

/**
 * GET /api/shopify/proxy/:quizId
 * Shopify App Proxy endpoint
 * Handles requests from store.myshopify.com/apps/quiz/{quizId}
 * Validates signature, verifies shop, and serves quiz content
 * 
 * Shopify sends requests as: /shopify/proxy/{quizId}?shop=...&signature=...
 * 
 * IMPORTANT: Uses captureRawQueryString middleware to get the raw query string
 * before Express processes it, which is required for signature validation.
 */
router.get('/shopify/proxy/:quizId', captureRawQueryString, async (req: RawQueryRequest, res: Response) => {
  try {
    console.log('🔄 App Proxy request received');
    console.log('   Method:', req.method);
    console.log('   URL:', req.url);
    console.log('   Original URL:', req.originalUrl);
    console.log('   Path:', req.path);
    console.log('   Raw Query String:', req.rawQueryString);
    console.log('   Parsed Query:', JSON.stringify(req.query));
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
    // IMPORTANT: Use raw query string captured by middleware before Express processed it
    // This preserves the exact URL encoding that Shopify used to calculate the signature
    const rawQueryString = req.rawQueryString || '';
    
    if (!rawQueryString) {
      console.error('❌ App Proxy request missing raw query string');
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Error</title></head>
        <body>
          <h1>Error</h1>
          <p>Missing query string. Please ensure you're accessing this quiz from your Shopify store.</p>
        </body>
        </html>
      `);
    }
    
    const isValidSignature = shopifyService.validateProxySignatureFromRawQuery(rawQueryString, shop);
    
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

    // Fetch the quiz HTML from frontend server-side (avoids CORS issues)
    // Then serve it with Content-Type: application/liquid to integrate directly into Shopify theme
    console.log(`✅ App Proxy validated, fetching quiz HTML for quiz: ${quizId}`);
    
    const frontendUrl = process.env.SHOPIFY_APP_URL || 'https://quiz.try-directquiz.com';
    const quizUrl = `${frontendUrl}/quiz/${quizId}?shop=${encodeURIComponent(shop)}&proxy=true`;
    
    try {
      // Fetch HTML from frontend server-side
      // IMPORTANT: Use a browser-like User-Agent to ensure Next.js serves full HTML with __NEXT_DATA__
      // Also disable streaming by requesting complete HTML
      const response = await fetch(quizUrl, {
        method: 'GET',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          // Disable streaming - request complete HTML
          'Accept-Encoding': 'identity' // Don't use compression to avoid streaming
        }
      });
      
      if (!response.ok) {
        throw new Error(`Frontend returned ${response.status}: ${response.statusText}`);
      }
      
      // Ensure we read the complete response body
      // Check if response is streaming (Transfer-Encoding: chunked)
      const transferEncoding = response.headers.get('transfer-encoding');
      if (transferEncoding === 'chunked') {
        console.warn('⚠️ Frontend is using chunked transfer encoding - HTML might be incomplete');
      }
      
      // Read the complete response body
      let html = await response.text();
      
      // Verify we got complete HTML by checking for closing tags
      if (!html.includes('</html>') || !html.includes('</body>')) {
        console.warn('⚠️ HTML appears incomplete - missing closing tags');
        // Wait a bit and try to read more (if using streaming)
        await new Promise(resolve => setTimeout(resolve, 100));
        // Note: response.text() should already wait for complete response, but just in case...
      }
      
      console.log(`📄 Fetched HTML from frontend (length: ${html.length} bytes)`);
      
      // Check if HTML contains React app markers
      const hasReactRoot = html.includes('__next') || html.includes('react');
      const hasScripts = html.includes('<script') && html.includes('_next/static');
      const scriptCount = (html.match(/<script/g) || []).length;
      const hasNextData = html.includes('__NEXT_DATA__');
      const hasNextDataScript = html.includes('<script id="__NEXT_DATA__"');
      
      console.log(`   HTML Analysis:`);
      console.log(`   - Has React root: ${hasReactRoot}`);
      console.log(`   - Has scripts: ${hasScripts} (${scriptCount} script tags found)`);
      console.log(`   - Has Next.js data: ${hasNextData}`);
      console.log(`   - Has __NEXT_DATA__ script tag: ${hasNextDataScript}`);
      console.log(`   - Contains "Loading Quiz": ${html.includes('Loading Quiz')}`);
      
      if (!hasNextDataScript) {
        console.error('❌ CRITICAL: __NEXT_DATA__ script tag is missing! React hydration will fail.');
        console.log('   This usually means Next.js is serving incomplete HTML.');
        console.log('   Possible causes:');
        console.log('   1. Next.js is in development mode and serving minimal HTML');
        console.log('   2. The page is being server-side rendered incorrectly');
        console.log('   3. The HTML is being modified/stripped somewhere');
      }
      
      if (!hasReactRoot || !hasScripts) {
        console.warn('⚠️ HTML might not contain React app properly');
      }
      
      // If HTML is too small or missing key elements, log a sample
      if (html.length < 10000 || !hasScripts || !hasNextDataScript) {
        console.log(`   HTML sample (first 1000 chars): ${html.substring(0, 1000)}`);
        console.log(`   HTML sample (last 1000 chars): ${html.substring(html.length - 1000)}`);
        
        // Try to find __NEXT_DATA__ in the HTML
        const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
        if (!nextDataMatch) {
          console.error('   ❌ __NEXT_DATA__ script tag not found in HTML');
        } else {
          console.log(`   ✅ Found __NEXT_DATA__ script tag (length: ${nextDataMatch[0].length} chars)`);
        }
      }
      
      // Rewrite all relative URLs to absolute URLs pointing to the frontend domain
      // This fixes 404 errors for Next.js static assets (CSS, JS chunks, etc.)
      // Next.js generates relative URLs like /_next/static/... which need to be absolute
      const htmlBeforeRewrite = html;
      html = rewriteAssetUrls(html, frontendUrl);
      
      // Log URL rewriting results
      const scriptMatchesBefore = (htmlBeforeRewrite.match(/src="\/_next\/static/g) || []).length;
      const scriptMatchesAfter = (html.match(/src="https:\/\/quiz\.try-directquiz\.com\/_next\/static/g) || []).length;
      console.log(`   URL Rewriting: ${scriptMatchesBefore} relative script URLs found, ${scriptMatchesAfter} rewritten to absolute`);
      
      // Add CSS to hide Shopify theme elements and ensure full-height
      html = injectShopifyThemeHidingCSS(html);
      
      // Inject API URL and debug script
      // IMPORTANT: Set NEXT_PUBLIC_API_URL so QuizApp can make API calls
      const backendApiUrl = process.env.BACKEND_API_URL || 'https://api.try-directquiz.com/api';
      const debugScript = `
        <script>
          // Inject API URL into window for QuizApp to use
          window.__QUIZ_API_URL__ = '${backendApiUrl}';
          
          // Override process.env.NEXT_PUBLIC_API_URL if it exists
          if (typeof window !== 'undefined') {
            // This will be available to QuizApp component
            window.__NEXT_PUBLIC_API_URL__ = '${backendApiUrl}';
          }
          
          console.log('🔍 App Proxy: HTML loaded, checking React initialization...');
          console.log('   API URL set to:', '${backendApiUrl}');
          
          window.addEventListener('load', function() {
            console.log('✅ App Proxy: Window loaded');
            setTimeout(function() {
              const nextRoot = document.getElementById('__next');
              const reactRoot = document.querySelector('[data-reactroot]') || document.querySelector('#__next > div');
              console.log('🔍 App Proxy: React root check:', {
                hasNextRoot: !!nextRoot,
                hasReactRoot: !!reactRoot,
                nextRootChildren: nextRoot ? nextRoot.children.length : 0
              });
              
              // Check if QuizApp is stuck on loading
              const loadingElements = document.querySelectorAll('*');
              let foundLoading = false;
              loadingElements.forEach(el => {
                if (el.textContent && el.textContent.includes('Loading Quiz')) {
                  foundLoading = true;
                  console.warn('⚠️ App Proxy: Still showing "Loading Quiz" after 2 seconds');
                }
              });
              
              if (foundLoading) {
                console.error('❌ App Proxy: Quiz stuck on loading screen');
                console.log('   This usually means React hydration failed or API calls are failing');
                console.log('   Check Network tab for failed requests');
                console.log('   Expected API URL:', '${backendApiUrl}');
              }
            }, 2000);
          });
        </script>
      `;
      
      // Inject debug script before closing </body> tag
      if (html.includes('</body>')) {
        html = html.replace('</body>', `${debugScript}</body>`);
      } else if (html.includes('</html>')) {
        html = html.replace('</html>', `${debugScript}</html>`);
      } else {
        html = html + debugScript;
      }
      
      // IMPORTANT: Use text/html instead of application/liquid
      // application/liquid causes Shopify to process the HTML as Liquid template,
      // which can break React hydration and script execution
      // text/html serves it as-is, and our CSS will hide the theme elements
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      
      // Add headers to ensure proper rendering
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN'); // Allow embedding in same origin (shop domain)
      
      res.send(html);
      
      console.log(`✅ Quiz HTML served successfully for quiz: ${quizId}`);
      console.log(`   📊 HTML served with Content-Type: text/html`);
      console.log(`   ✅ Ready for React hydration`);
    } catch (fetchError: any) {
      console.error('❌ Error fetching quiz HTML from frontend:', fetchError);
      // Fallback: serve error page
      res.setHeader('Content-Type', 'application/liquid; charset=utf-8');
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Error</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 2rem; }
            h1 { color: #ef4444; }
          </style>
        </head>
        <body>
          <h1>Error Loading Quiz</h1>
          <p>Unable to load the quiz. Please try again later.</p>
          <p style="color: #666; font-size: 0.9rem;">${fetchError.message || 'Unknown error'}</p>
        </body>
        </html>
      `);
    }

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

