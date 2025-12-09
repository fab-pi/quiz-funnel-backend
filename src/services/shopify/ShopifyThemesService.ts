import { Pool } from 'pg';
import { BaseService } from '../BaseService';
import { ShopifyService } from './ShopifyService';

/**
 * Shopify Themes Service
 * Handles Shopify theme operations via GraphQL Admin API
 */
export class ShopifyThemesService extends BaseService {
  private shopifyService: ShopifyService;

  constructor(pool: Pool, shopifyService: ShopifyService) {
    super(pool);
    this.shopifyService = shopifyService;
  }

  /**
   * Get the active theme ID for a shop
   * @param shopDomain - Shop domain (e.g., mystore.myshopify.com)
   * @param accessToken - Shopify access token
   * @returns Active theme ID or null if not found
   */
  async getActiveThemeId(shopDomain: string, accessToken: string): Promise<number | null> {
    try {
      const client = await this.shopifyService.createGraphQLClient(shopDomain, accessToken);

      const query = `
        query getThemes {
          themes(first: 250) {
            edges {
              node {
                id
                name
                role
              }
            }
          }
        }
      `;

      // GraphqlParams expects data as string or object
      const response = await client.query({
        data: query,
      });

      if (!response || !response.body || !response.body.data) {
        console.error('❌ Invalid response from Shopify themes query');
        return null;
      }

      const themes = response.body.data.themes?.edges || [];
      
      // Find the active theme (role: MAIN)
      const activeTheme = themes.find((edge: any) => edge.node.role === 'MAIN');
      
      if (!activeTheme) {
        console.warn(`⚠️ No active theme found for shop: ${shopDomain}`);
        return null;
      }

      // Extract numeric ID from Shopify GID (format: "gid://shopify/Theme/123456")
      const themeId = this.extractIdFromGid(activeTheme.node.id);
      
      if (!themeId) {
        console.error(`❌ Failed to extract theme ID from GID: ${activeTheme.node.id}`);
        return null;
      }

      console.log(`✅ Active theme ID for ${shopDomain}: ${themeId} (${activeTheme.node.name})`);
      return themeId;
    } catch (error: any) {
      console.error(`❌ Error getting active theme for shop ${shopDomain}:`, error);
      throw new Error(`Failed to get active theme: ${error.message}`);
    }
  }

  /**
   * List all themes for a shop
   * @param shopDomain - Shop domain (e.g., mystore.myshopify.com)
   * @param accessToken - Shopify access token
   * @returns Array of theme objects with id, name, and role
   */
  async listThemes(shopDomain: string, accessToken: string): Promise<Array<{
    id: number;
    name: string;
    role: string;
  }>> {
    try {
      const client = await this.shopifyService.createGraphQLClient(shopDomain, accessToken);

      const query = `
        query getThemes {
          themes(first: 250) {
            edges {
              node {
                id
                name
                role
              }
            }
          }
        }
      `;

      // GraphqlParams expects data as string or object
      const response = await client.query({
        data: query,
      });

      if (!response || !response.body || !response.body.data) {
        console.error('❌ Invalid response from Shopify themes query');
        return [];
      }

      const themes = response.body.data.themes?.edges || [];
      
      return themes.map((edge: any) => ({
        id: this.extractIdFromGid(edge.node.id) || 0,
        name: edge.node.name,
        role: edge.node.role,
      }));
    } catch (error: any) {
      console.error(`❌ Error listing themes for shop ${shopDomain}:`, error);
      throw new Error(`Failed to list themes: ${error.message}`);
    }
  }

  /**
   * Extract numeric ID from Shopify GID (Global ID)
   * @param gid - Shopify GID (e.g., "gid://shopify/Theme/123456")
   * @returns Numeric ID or null if extraction fails
   */
  private extractIdFromGid(gid: string): number | null {
    try {
      // Shopify GID format: "gid://shopify/Theme/123456"
      const parts = gid.split('/');
      const id = parts[parts.length - 1];
      const numericId = parseInt(id, 10);
      
      if (isNaN(numericId)) {
        return null;
      }
      
      return numericId;
    } catch (error) {
      console.error(`❌ Error extracting ID from GID ${gid}:`, error);
      return null;
    }
  }
}

