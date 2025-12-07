import { Pool } from 'pg';
import { shopifyApi, LATEST_API_VERSION, ApiVersion } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';
import crypto from 'crypto';
import { BaseService } from '../BaseService';
import { Shop, ShopDatabaseRow, StoreShopRequest } from '../../types/shopify';

/**
 * Shopify Service
 * Handles Shopify OAuth, shop storage, and API interactions
 */
export class ShopifyService extends BaseService {
  private shopify;

  constructor(pool: Pool) {
    super(pool);

    // Validate required environment variables
    const apiKey = process.env.SHOPIFY_API_KEY;
    const apiSecret = process.env.SHOPIFY_API_SECRET;
    const appUrl = process.env.SHOPIFY_APP_URL;

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

    // Extract hostname from app URL (remove protocol)
    const hostName = appUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

    // Initialize Shopify API client
    this.shopify = shopifyApi({
      apiKey,
      apiSecretKey: apiSecret,
      scopes,
      hostName,
      apiVersion,
      isEmbeddedApp: true,
    });

    console.log('✅ Shopify API client initialized');
    console.log(`   API Version: ${apiVersion}`);
    console.log(`   Scopes: ${scopes.join(', ')}`);
    console.log(`   Host: ${hostName}`);
  }

  /**
   * Store shop information after successful OAuth
   */
  async storeShop(data: StoreShopRequest): Promise<Shop> {
    const client = await this.pool.connect();

    try {
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
               installed_at = CURRENT_TIMESTAMP,
               uninstalled_at = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE shop_domain = $3
           RETURNING *`,
          [data.accessToken, data.scope, data.shopDomain]
        );

        console.log(`✅ Shop updated: ${data.shopDomain}`);
        return this.mapShopFromDatabase(result.rows[0]);
      } else {
        // Insert new shop
        const result = await client.query<ShopDatabaseRow>(
          `INSERT INTO shops (shop_domain, access_token, scope, installed_at)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
           RETURNING *`,
          [data.shopDomain, data.accessToken, data.scope]
        );

        console.log(`✅ Shop stored: ${data.shopDomain}`);
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
   * Note: This is a simplified version. For full implementation,
   * you may need to implement custom session storage.
   * For now, these methods are placeholders for future implementation.
   */
  async createGraphQLClient(shop: string, accessToken: string) {
    // Create a custom session for GraphQL requests
    // Note: In production, you should implement proper session storage
    const session = this.shopify.session.customAppSession(shop);
    (session as any).accessToken = accessToken;
    
    return new this.shopify.clients.Graphql({ session });
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
    
    // Build string by concatenating key=value pairs WITHOUT delimiters
    // IMPORTANT: Decode URL-encoded values before concatenation (Shopify example shows decoded values)
    // This matches Shopify's exact format: parameters are joined directly with no & between them
    const queryString = paramPairs.map(pair => {
      // Decode URL-encoded value (e.g., %2Fapps%2Fquiz becomes /apps/quiz)
      const decodedValue = decodeURIComponent(pair.value);
      return `${pair.key}=${decodedValue}`;
    }).join('');
    
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
      accessToken: row.access_token,
      scope: row.scope,
      installedAt: row.installed_at,
      uninstalledAt: row.uninstalled_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

