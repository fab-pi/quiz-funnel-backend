import { Pool } from 'pg';
import { shopifyApi, LATEST_API_VERSION, ApiVersion, Session } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';
import crypto from 'crypto';
import { BaseService } from '../BaseService';
import { Shop, ShopDatabaseRow, StoreShopRequest } from '../../types/shopify';
import { ShopifySessionStorage } from './ShopifySessionStorage';

/**
 * Shopify Service
 * Handles Shopify OAuth, shop storage, and API interactions
 */
export class ShopifyService extends BaseService {
  private shopify;
  private sessionStorage: ShopifySessionStorage;

  constructor(pool: Pool) {
    super(pool);

    // Validate required environment variables
    const apiKey = process.env.SHOPIFY_API_KEY;
    const apiSecret = process.env.SHOPIFY_API_SECRET;
    const appUrl = process.env.SHOPIFY_APP_URL; // Frontend URL where embedded app is loaded

    if (!apiKey || !apiSecret || !appUrl) {
      throw new Error(
        'Missing required Shopify environment variables: SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_APP_URL'
      );
    }

    // Get scopes from environment or use defaults
    const scopes = process.env.SHOPIFY_SCOPES?.split(',').map(s => s.trim()) || [
      'read_products',
      'write_products',
    ];

    // Get API version from environment or use latest
    const apiVersion = (process.env.SHOPIFY_API_VERSION as ApiVersion) || LATEST_API_VERSION;

    // CRITICAL: hostName is used by Shopify API to construct redirect_uri for OAuth callback
    // The redirect_uri MUST point to the backend API endpoint, not the frontend app URL
    // Example: redirect_uri = https://{hostName}/api/shopify/auth/callback
    // So hostName should be: api.try-directquiz.com (backend), not quiz.try-directquiz.com (frontend)
    // 
    // Use SHOPIFY_BACKEND_URL if available, otherwise try API_BASE_URL or API_URL, fallback to default
    let backendUrl = process.env.SHOPIFY_BACKEND_URL || 
                     process.env.API_BASE_URL || 
                     (process.env.API_URL ? process.env.API_URL.replace(/\/api\/?$/, '') : null) || // Remove /api suffix if present
                     'https://api.try-directquiz.com';
    
    // Extract hostname from backend URL (remove protocol and trailing slashes)
    const hostName = backendUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

    // Initialize custom session storage and store as class property
    this.sessionStorage = new ShopifySessionStorage(this.pool);

    // Initialize Shopify API client with session storage
    this.shopify = shopifyApi({
      apiKey,
      apiSecretKey: apiSecret,
      scopes,
      hostName,
      apiVersion,
      isEmbeddedApp: true,
      sessionStorage: this.sessionStorage, // Add session storage
    });

    console.log('✅ Shopify API client initialized');
    console.log(`   API Version: ${apiVersion}`);
    console.log(`   Scopes: ${scopes.join(', ')}`);
    console.log(`   Host (for OAuth redirect_uri): ${hostName}`);
    console.log(`   App URL (frontend): ${appUrl}`);
    console.log(`   Session Storage: Enabled`);
  }

  /**
   * Get the session storage instance
   * This allows other parts of the codebase to access session storage directly
   */
  getSessionStorage(): ShopifySessionStorage {
    return this.sessionStorage;
  }

  /**
   * Store shop information from a Shopify Session object (new standard method)
   * This method creates/updates the shop record FIRST, then stores the session in session storage
   * 
   * IMPORTANT: Order matters! We must create/update the shop BEFORE storing the session,
   * because session storage requires the shop to exist in the database.
   */
  async storeShopFromSession(session: Session): Promise<Shop> {
    const client = await this.pool.connect();

    try {
      // Check if shop already exists FIRST (before fetching primary domain)
      const existingShop = await client.query<ShopDatabaseRow>(
        'SELECT * FROM shops WHERE shop_domain = $1',
        [session.shop]
      );

      let shopRecord: ShopDatabaseRow;

      if (existingShop.rows.length > 0) {
        // Update existing shop (reinstall scenario)
        // Don't fetch primary domain here - it will be refreshed later if needed
        const result = await client.query<ShopDatabaseRow>(
          `UPDATE shops 
           SET access_token = $1, 
               scope = $2, 
               installed_at = CURRENT_TIMESTAMP,
               uninstalled_at = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE shop_domain = $3
           RETURNING *`,
          [session.accessToken, session.scope || null, session.shop]
        );

        shopRecord = result.rows[0];
        console.log(`✅ Shop updated from session: ${session.shop}`);
      } else {
        // Insert new shop
        // Initialize session columns as NULL - they will be set by session storage
        // Don't fetch primary domain here - it will be refreshed later if needed
        const result = await client.query<ShopDatabaseRow>(
          `INSERT INTO shops (shop_domain, access_token, scope, installed_at)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
           RETURNING *`,
          [session.shop, session.accessToken, session.scope || null]
        );

        shopRecord = result.rows[0];
        console.log(`✅ Shop stored from session: ${session.shop}`);
      }

      // NOW store session in session storage (shop must exist first)
      const stored = await this.sessionStorage.storeSession(session);
      if (!stored) {
        throw new Error(`Failed to store session for shop: ${session.shop}`);
      }

      // Fetch primary domain AFTER shop and session are stored (optional, non-blocking)
      // This allows the OAuth flow to complete even if primary domain fetch fails
      // Use the session we just created instead of looking it up again
      try {
        const graphqlClient = new this.shopify.clients.Graphql({ session });
        const query = `
          query getShopPrimaryDomain {
            shop {
              primaryDomain {
                host
              }
            }
          }
        `;

        const response = await graphqlClient.query({
          data: {
            query: query,
          },
        }) as {
          body: {
            data: {
              shop: {
                primaryDomain: {
                  host: string;
                } | null;
              };
            };
          };
        };

        const primaryDomain = response.body?.data?.shop?.primaryDomain?.host || null;
        
        if (primaryDomain) {
          await client.query(
            'UPDATE shops SET primary_domain = $1, updated_at = CURRENT_TIMESTAMP WHERE shop_domain = $2',
            [primaryDomain, session.shop]
          );
          console.log(`✅ Primary domain updated for ${session.shop}: ${primaryDomain}`);
        }
      } catch (error: any) {
        // Log but don't fail - primary domain is optional and can be refreshed later
        console.warn(`⚠️ Failed to fetch primary domain for ${session.shop}:`, error.message);
      }

      // Reload shop record to get updated primary_domain if it was fetched
      const finalShop = await client.query<ShopDatabaseRow>(
        'SELECT * FROM shops WHERE shop_domain = $1',
        [session.shop]
      );

      return this.mapShopFromDatabase(finalShop.rows[0]);
    } catch (error: any) {
      console.error('❌ Error storing shop from session:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Store shop information after successful OAuth (legacy method - kept for backward compatibility)
   * @deprecated Use storeShopFromSession() instead
   */
  async storeShop(data: StoreShopRequest): Promise<Shop> {
    const client = await this.pool.connect();

    try {
      // Fetch primary domain from Shopify API
      let primaryDomain: string | null = null;
      try {
        primaryDomain = await this.getShopPrimaryDomain(data.shopDomain);
      } catch (error: any) {
        // Log but don't fail - primary domain is optional
        console.warn(`⚠️ Failed to fetch primary domain for ${data.shopDomain}:`, error.message);
      }

      // Check if shop already exists
      const existingShop = await client.query<ShopDatabaseRow>(
        'SELECT * FROM shops WHERE shop_domain = $1',
        [data.shopDomain]
      );

      if (existingShop.rows.length > 0) {
        // Update existing shop (reinstall scenario)
        const result = await client.query<ShopDatabaseRow>(
          `UPDATE shops 
           SET access_token = $1, 
               scope = $2, 
               primary_domain = $4,
               installed_at = CURRENT_TIMESTAMP,
               uninstalled_at = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE shop_domain = $3
           RETURNING *`,
          [data.accessToken, data.scope, data.shopDomain, primaryDomain]
        );

        console.log(`✅ Shop updated: ${data.shopDomain}${primaryDomain ? ` (primary domain: ${primaryDomain})` : ''}`);
        return this.mapShopFromDatabase(result.rows[0]);
      } else {
        // Insert new shop
        const result = await client.query<ShopDatabaseRow>(
          `INSERT INTO shops (shop_domain, access_token, scope, primary_domain, installed_at)
           VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
           RETURNING *`,
          [data.shopDomain, data.accessToken, data.scope, primaryDomain]
        );

        console.log(`✅ Shop stored: ${data.shopDomain}${primaryDomain ? ` (primary domain: ${primaryDomain})` : ''}`);
        return this.mapShopFromDatabase(result.rows[0]);
      }
    } catch (error: any) {
      console.error('❌ Error storing shop:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get shop access token by shop domain
   */
  async getShopAccessToken(shopDomain: string): Promise<string | null> {
    const client = await this.pool.connect();

    try {
      const result = await client.query<ShopDatabaseRow>(
        `SELECT access_token FROM shops 
         WHERE shop_domain = $1 AND uninstalled_at IS NULL`,
        [shopDomain]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0].access_token;
    } catch (error) {
      console.error('❌ Error getting shop access token:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get shop by domain
   */
  async getShopByDomain(shopDomain: string): Promise<Shop | null> {
    const client = await this.pool.connect();

    try {
      const result = await client.query<ShopDatabaseRow>(
        'SELECT * FROM shops WHERE shop_domain = $1',
        [shopDomain]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapShopFromDatabase(result.rows[0]);
    } catch (error) {
      console.error('❌ Error getting shop:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get shop by ID
   */
  async getShopById(shopId: number): Promise<Shop | null> {
    const client = await this.pool.connect();

    try {
      const result = await client.query<ShopDatabaseRow>(
        'SELECT * FROM shops WHERE shop_id = $1',
        [shopId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapShopFromDatabase(result.rows[0]);
    } catch (error) {
      console.error('❌ Error getting shop by ID:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Handle app uninstall - mark shop as uninstalled
   */
  async uninstallShop(shopDomain: string): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query(
        `UPDATE shops 
         SET uninstalled_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE shop_domain = $1`,
        [shopDomain]
      );

      console.log(`✅ Shop marked as uninstalled: ${shopDomain}`);
    } catch (error) {
      console.error('❌ Error uninstalling shop:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get Shopify API instance (for use in routes)
   */
  getShopifyApi() {
    return this.shopify;
  }

  /**
   * Create a Shopify GraphQL client for a shop
   * Loads session from storage, with fallback to access_token column for backward compatibility
   */
  async createGraphQLClient(shop: string): Promise<any> {
    // Try session storage first
    const sessionId = `offline_${shop}`; // Use shop domain for offline sessions
    let session = await this.sessionStorage.loadSession(sessionId);
    
    // Fallback to access_token column if session not found (backward compatibility)
    if (!session) {
      const client = await this.pool.connect();
      try {
        const result = await client.query(
          'SELECT access_token, scope FROM shops WHERE shop_domain = $1',
          [shop]
        );
        
        if (result.rows[0]?.access_token) {
          // Create session from access_token (backward compatibility)
          session = this.shopify.session.customAppSession(shop);
          (session as any).accessToken = result.rows[0].access_token;
          (session as any).scope = result.rows[0].scope || '';
          
          // Log migration opportunity
          console.warn(`⚠️ Using access_token fallback for shop ${shop}. Consider migrating to session storage.`);
        }
      } finally {
        client.release();
      }
    }
    
    if (!session || !session.accessToken) {
      throw new Error(`No session or access token found for shop: ${shop}`);
    }
    
    // Check expiration (for online sessions)
    if (session.expires && new Date(session.expires) < new Date()) {
      throw new Error(`Session expired for shop: ${shop}. Please re-authenticate.`);
    }
    
    return new this.shopify.clients.Graphql({ session });
  }

  /**
   * Get shop primary domain from Shopify GraphQL API
   * @param shopDomain - Shop domain (e.g., mystore.myshopify.com)
   * @returns Primary domain (e.g., shop.brandx.com) or null if not set
   */
  async getShopPrimaryDomain(shopDomain: string): Promise<string | null> {
    try {
      const client = await this.createGraphQLClient(shopDomain);

      const query = `
        query getShopPrimaryDomain {
          shop {
            primaryDomain {
              host
            }
          }
        }
      `;

      const response = await client.query({
        data: {
          query: query,
        },
      }) as {
        body: {
          data: {
            shop: {
              primaryDomain: {
                host: string;
              } | null;
            };
          };
        };
      };

      if (!response || !response.body || !response.body.data) {
        console.error('❌ Invalid response from Shopify shop query');
        return null;
      }

      const primaryDomain = response.body.data.shop?.primaryDomain?.host || null;

      if (primaryDomain) {
        console.log(`✅ Primary domain for ${shopDomain}: ${primaryDomain}`);
      } else {
        console.log(`ℹ️ No primary domain set for ${shopDomain} (using default myshopify.com domain)`);
      }

      return primaryDomain;
    } catch (error: any) {
      console.error(`❌ Error getting primary domain for shop ${shopDomain}:`, error);
      // Don't throw - return null so shop creation can continue
      // Primary domain is optional, shop_domain is the fallback
      return null;
    }
  }

  /**
   * Update primary domain for an existing shop
   * Fetches current primary domain from Shopify API and updates database only if changed
   * @param shopDomain - Shop domain (e.g., mystore.myshopify.com)
   * @returns Updated primary domain or null if not set, and whether it was actually updated
   */
  async updatePrimaryDomain(shopDomain: string): Promise<{ primaryDomain: string | null; updated: boolean }> {
    const client = await this.pool.connect();

    try {
      // Get shop from database to get access token and current primary domain
      const shop = await this.getShopByDomain(shopDomain);
      if (!shop) {
        throw new Error(`Shop not found: ${shopDomain}`);
      }

      const currentPrimaryDomain = shop.primaryDomain;

      // Fetch current primary domain from Shopify API
      const newPrimaryDomain = await this.getShopPrimaryDomain(shopDomain);

      // Only update if the value actually changed
      const hasChanged = currentPrimaryDomain !== newPrimaryDomain;

      if (hasChanged) {
        // Update database
        await client.query(
          `UPDATE shops 
           SET primary_domain = $1, 
               updated_at = CURRENT_TIMESTAMP
           WHERE shop_domain = $2`,
          [newPrimaryDomain, shopDomain]
        );

        // Update all quiz URLs for this shop to use the new primary domain
        const shop = await this.getShopByDomain(shopDomain);
        if (shop) {
          const domain = newPrimaryDomain || shopDomain;
          
          // Get all quizzes for this shop that have Shopify pages
          const quizzesResult = await client.query(
            `SELECT quiz_id, shopify_page_handle 
             FROM quizzes 
             WHERE shop_id = $1 AND shopify_page_handle IS NOT NULL`,
            [shop.shopId]
          );

          // Update quiz_start_url for each quiz
          for (const quiz of quizzesResult.rows) {
            const shopifyPageUrl = `https://${domain}/pages/${quiz.shopify_page_handle}`;
            await client.query(
              `UPDATE quizzes 
               SET quiz_start_url = $1 
               WHERE quiz_id = $2`,
              [shopifyPageUrl, quiz.quiz_id]
            );
          }

          if (quizzesResult.rows.length > 0) {
            console.log(`   Updated ${quizzesResult.rows.length} quiz URL(s) to use domain: ${domain}`);
          }
        }

        if (newPrimaryDomain) {
          console.log(`✅ Primary domain updated for ${shopDomain}: ${newPrimaryDomain} (was: ${currentPrimaryDomain || 'none'})`);
        } else {
          console.log(`ℹ️ Primary domain cleared for ${shopDomain} (was: ${currentPrimaryDomain})`);
        }
      } else {
        console.log(`ℹ️ Primary domain unchanged for ${shopDomain}: ${newPrimaryDomain || 'none'}`);
      }

      return {
        primaryDomain: newPrimaryDomain,
        updated: hasChanged
      };
    } catch (error: any) {
      console.error(`❌ Error updating primary domain for shop ${shopDomain}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get shop information from Shopify API
   * Note: This requires proper session storage implementation
   * For now, this is a placeholder for future implementation
   */
  async getShopInfo(shop: string, accessToken: string): Promise<any> {
    // TODO: Implement proper GraphQL client with session storage
    // For now, return null - this can be implemented in a future phase
    console.warn('⚠️ getShopInfo not yet fully implemented - requires session storage');
    return null;
  }

  /**
   * Get products from Shopify store
   * Note: This requires proper session storage implementation
   * For now, this is a placeholder for future implementation
   */
  async getProducts(shop: string, accessToken: string, limit: number = 10): Promise<any[]> {
    // TODO: Implement proper GraphQL client with session storage
    // For now, return empty array - this can be implemented in a future phase
    console.warn('⚠️ getProducts not yet fully implemented - requires session storage');
    return [];
  }

  /**
   * Validate Shopify App Proxy request signature
   * @param queryParams - Query parameters from the request
   * @param shopDomain - Shop domain from the request
   * @returns true if signature is valid, false otherwise
   */
  /**
   * Validate Shopify App Proxy request signature
   * IMPORTANT: Must use raw query string (URL-encoded) as Shopify calculates signature on raw values
   * @param rawQueryString - The raw query string from the request URL (e.g., "shop=...&path_prefix=%2Fapps%2Fquiz&...")
   * @param shopDomain - Shop domain for logging
   * @returns true if signature is valid, false otherwise
   */
  validateProxySignatureFromRawQuery(rawQueryString: string, shopDomain: string): boolean {
    if (!rawQueryString) {
      console.error('❌ App Proxy request missing query string');
      return false;
    }

    const apiSecret = process.env.SHOPIFY_API_SECRET;
    if (!apiSecret) {
      console.error('❌ SHOPIFY_API_SECRET is not configured');
      return false;
    }

    // Parse the raw query string manually to preserve URL encoding
    // Split by '&' to get individual parameters
    const params = rawQueryString.split('&');
    
    // Extract signature and other parameters
    // IMPORTANT: Keep parameters in their original order to match Shopify's calculation
    let signature: string | null = null;
    const paramPairs: Array<{ key: string; value: string }> = [];
    
    for (const param of params) {
      // Split on first '=' to handle values that might contain '='
      const equalIndex = param.indexOf('=');
      if (equalIndex === -1) {
        // Parameter without value (shouldn't happen, but handle it)
        continue;
      }
      
      const key = param.substring(0, equalIndex);
      const value = param.substring(equalIndex + 1);
      
      if (key === 'signature') {
        signature = value;
      } else {
        // Store parameter in original order (preserve URL encoding in value)
        paramPairs.push({ key, value });
      }
    }
    
    if (!signature) {
      console.error('❌ App Proxy request missing signature parameter');
      return false;
    }

    // According to Shopify docs (https://shopify.dev/apps/build/online-store/display-dynamic-data):
    // 1. Sort parameters alphabetically by key
    // 2. Concatenate them WITHOUT any delimiters (no & between parameters)
    // 3. Format: key1=value1key2=value2key3=value3 (no separators)
    // Example: logged_in_customer_id=path_prefix=%2Fapps%2Fquizshop=quiz-test-1002.myshopify.comtimestamp=1765124963
    
    // Sort the parameter pairs by key alphabetically
    paramPairs.sort((a, b) => {
      if (a.key < b.key) return -1;
      if (a.key > b.key) return 1;
      return 0;
    });
    
    // Build string by concatenating key=value pairs WITHOUT delimiters.
    // IMPORTANT: For App Proxy, Shopify signs the query string values as they appear (URL-encoded),
    // after sorting keys, and concatenating without '&'. We must NOT decode here.
    const queryString = paramPairs
      .map((pair) => `${pair.key}=${pair.value}`)
      .join('');
    
    // Calculate HMAC SHA256
    const calculatedSignature = crypto
      .createHmac('sha256', apiSecret)
      .update(queryString)
      .digest('hex');
    
    // Compare signatures safely:
    // - timingSafeEqual throws if buffer lengths differ (would cause 500)
    // - treat mismatched lengths as invalid signature (401/403 at caller)
    const expectedBuf = Buffer.from(calculatedSignature, 'utf8');
    const receivedBuf = Buffer.from(signature, 'utf8');
    const isValid =
      expectedBuf.length === receivedBuf.length && crypto.timingSafeEqual(expectedBuf, receivedBuf);
    
    if (!isValid) {
      console.error('❌ App Proxy signature validation failed');
      console.error(`   Shop: ${shopDomain}`);
      console.error(`   Raw query string: ${rawQueryString}`);
      console.error(`   Reconstructed query string: ${queryString}`);
      console.error(`   Expected: ${calculatedSignature}`);
      console.error(`   Received: ${signature}`);
    }
    
    return isValid;
  }

  /**
   * @deprecated Use validateProxySignatureFromRawQuery instead
   * This method doesn't preserve URL encoding which causes signature validation to fail
   */
  validateProxySignature(queryParams: Record<string, string | string[] | undefined>, shopDomain: string): boolean {
    // For backward compatibility, try to reconstruct from decoded params
    // But this may fail due to URL encoding issues
    const signature = queryParams.signature as string | undefined;
    
    if (!signature) {
      console.error('❌ App Proxy request missing signature parameter');
      return false;
    }

    const apiSecret = process.env.SHOPIFY_API_SECRET;
    if (!apiSecret) {
      console.error('❌ SHOPIFY_API_SECRET is not configured');
      return false;
    }

    // Build query string without signature parameter
    const sortedParams: string[] = [];
    for (const key in queryParams) {
      if (key !== 'signature') {
        const value = queryParams[key];
        if (value !== undefined) {
          const paramValue = Array.isArray(value) ? value[0] : value;
          // URL encode the value to match Shopify's encoding
          sortedParams.push(`${key}=${encodeURIComponent(paramValue)}`);
        }
      }
    }
    
    // Sort parameters alphabetically
    sortedParams.sort();
    
    // Build query string
    const queryString = sortedParams.join('&');
    
    // Calculate HMAC SHA256
    const calculatedSignature = crypto
      .createHmac('sha256', apiSecret)
      .update(queryString)
      .digest('hex');
    
    // Compare signatures (use timing-safe comparison)
    const isValid = crypto.timingSafeEqual(
      Buffer.from(calculatedSignature),
      Buffer.from(signature)
    );
    
    if (!isValid) {
      console.error('❌ App Proxy signature validation failed');
      console.error(`   Shop: ${shopDomain}`);
      console.error(`   Query string: ${queryString}`);
      console.error(`   Expected: ${calculatedSignature}`);
      console.error(`   Received: ${signature}`);
    }
    
    return isValid;
  }

  /**
   * Map database row to Shop interface
   */
  private mapShopFromDatabase(row: ShopDatabaseRow): Shop {
    return {
      shopId: row.shop_id,
      shopDomain: row.shop_domain,
      primaryDomain: row.primary_domain || null,
      accessToken: row.access_token,
      scope: row.scope,
      installedAt: row.installed_at,
      uninstalledAt: row.uninstalled_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

