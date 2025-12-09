import { Pool } from 'pg';
import { BaseService } from '../BaseService';
import { ShopifyService } from './ShopifyService';

/**
 * Shopify Theme Assets Service
 * Handles uploading and managing Liquid template files in Shopify themes
 */
export class ShopifyThemeAssetsService extends BaseService {
  private shopifyService: ShopifyService;

  constructor(pool: Pool, shopifyService: ShopifyService) {
    super(pool);
    this.shopifyService = shopifyService;
  }

  /**
   * Create or update a Liquid template file in a Shopify theme
   * @param shopDomain - Shop domain (e.g., mystore.myshopify.com)
   * @param accessToken - Shopify access token
   * @param themeId - Theme ID (numeric ID)
   * @param templatePath - Template file path (e.g., "templates/page.quiz-app-iframe.liquid")
   * @param templateContent - Liquid template content
   * @returns Success status
   */
  async upsertTemplateFile(
    shopDomain: string,
    accessToken: string,
    themeId: number,
    templatePath: string,
    templateContent: string
  ): Promise<void> {
    try {
      console.log(`🔄 Uploading template file: ${templatePath} to theme ${themeId} for shop ${shopDomain}...`);

      // Create REST client
      const shopifyApi = this.shopifyService.getShopifyApi();
      const session = shopifyApi.session.customAppSession(shopDomain);
      (session as any).accessToken = accessToken;
      
      const restClient = new shopifyApi.clients.Rest({ session });

      // Shopify REST API endpoint for theme assets
      // PUT /admin/api/{version}/themes/{theme_id}/assets.json
      const apiVersion = process.env.SHOPIFY_API_VERSION || '2025-10';
      const endpoint = `themes/${themeId}/assets.json`;

      // Prepare the asset data
      // Note: Shopify expects the key to be the file path
      const assetData = {
        asset: {
          key: templatePath,
          value: templateContent,
        },
      };

      // Make PUT request to create/update the asset
      const response = await restClient.put({
        path: endpoint,
        data: assetData,
      });

      if (!response || !response.body) {
        throw new Error('Invalid response from Shopify theme assets API');
      }

      // Check for errors in response
      if (response.body.errors) {
        const errors = JSON.stringify(response.body.errors);
        throw new Error(`Shopify API errors: ${errors}`);
      }

      console.log(`✅ Template file uploaded successfully: ${templatePath}`);
      console.log(`   Theme ID: ${themeId}`);
      console.log(`   Shop: ${shopDomain}`);

    } catch (error: any) {
      console.error(`❌ Error uploading template file ${templatePath} for shop ${shopDomain}:`, error);
      throw new Error(`Failed to upload template file: ${error.message}`);
    }
  }

  /**
   * Create the quiz app iframe template file
   * @param shopDomain - Shop domain (e.g., mystore.myshopify.com)
   * @param accessToken - Shopify access token
   * @param themeId - Theme ID (numeric ID)
   * @param templateContent - Liquid template content
   * @returns Success status
   */
  async createQuizAppTemplate(
    shopDomain: string,
    accessToken: string,
    themeId: number,
    templateContent: string
  ): Promise<void> {
    const templatePath = 'templates/page.quiz-app-iframe.liquid';
    return this.upsertTemplateFile(shopDomain, accessToken, themeId, templatePath, templateContent);
  }

  /**
   * Delete a template file from a Shopify theme
   * @param shopDomain - Shop domain (e.g., mystore.myshopify.com)
   * @param accessToken - Shopify access token
   * @param themeId - Theme ID (numeric ID)
   * @param templatePath - Template file path (e.g., "templates/page.quiz-app-iframe.liquid")
   * @returns Success status
   */
  async deleteTemplateFile(
    shopDomain: string,
    accessToken: string,
    themeId: number,
    templatePath: string
  ): Promise<void> {
    try {
      console.log(`🔄 Deleting template file: ${templatePath} from theme ${themeId} for shop ${shopDomain}...`);

      // Create REST client
      const shopifyApi = this.shopifyService.getShopifyApi();
      const session = shopifyApi.session.customAppSession(shopDomain);
      (session as any).accessToken = accessToken;
      
      const restClient = new shopifyApi.clients.Rest({ session });

      // Shopify REST API endpoint for deleting theme assets
      // DELETE /admin/api/{version}/themes/{theme_id}/assets.json?asset[key]={templatePath}
      const endpoint = `themes/${themeId}/assets.json`;

      // Make DELETE request with query parameter
      const response = await restClient.delete({
        path: endpoint,
        query: {
          'asset[key]': templatePath,
        },
      });

      if (!response || !response.body) {
        throw new Error('Invalid response from Shopify theme assets API');
      }

      // Check for errors in response
      if (response.body.errors) {
        const errors = JSON.stringify(response.body.errors);
        throw new Error(`Shopify API errors: ${errors}`);
      }

      console.log(`✅ Template file deleted successfully: ${templatePath}`);

    } catch (error: any) {
      console.error(`❌ Error deleting template file ${templatePath} for shop ${shopDomain}:`, error);
      throw new Error(`Failed to delete template file: ${error.message}`);
    }
  }

  /**
   * Delete the quiz app iframe template file
   * @param shopDomain - Shop domain (e.g., mystore.myshopify.com)
   * @param accessToken - Shopify access token
   * @param themeId - Theme ID (numeric ID)
   * @returns Success status
   */
  async deleteQuizAppTemplate(
    shopDomain: string,
    accessToken: string,
    themeId: number
  ): Promise<void> {
    const templatePath = 'templates/page.quiz-app-iframe.liquid';
    return this.deleteTemplateFile(shopDomain, accessToken, themeId, templatePath);
  }

  /**
   * Check if a template file exists in a theme
   * @param shopDomain - Shop domain (e.g., mystore.myshopify.com)
   * @param accessToken - Shopify access token
   * @param themeId - Theme ID (numeric ID)
   * @param templatePath - Template file path (e.g., "templates/page.quiz-app-iframe.liquid")
   * @returns True if template exists, false otherwise
   */
  async templateFileExists(
    shopDomain: string,
    accessToken: string,
    themeId: number,
    templatePath: string
  ): Promise<boolean> {
    try {
      // Create REST client
      const shopifyApi = this.shopifyService.getShopifyApi();
      const session = shopifyApi.session.customAppSession(shopDomain);
      (session as any).accessToken = accessToken;
      
      const restClient = new shopifyApi.clients.Rest({ session });

      // Shopify REST API endpoint for getting a specific asset
      // GET /admin/api/{version}/themes/{theme_id}/assets.json?asset[key]={templatePath}
      const endpoint = `themes/${themeId}/assets.json`;

      const response = await restClient.get({
        path: endpoint,
        query: {
          'asset[key]': templatePath,
        },
      });

      if (!response || !response.body) {
        return false;
      }

      // If asset exists, response.body.asset will contain the asset data
      return !!(response.body.asset && response.body.asset.key === templatePath);

    } catch (error: any) {
      // If asset doesn't exist, Shopify returns 404
      if (error.statusCode === 404 || error.message?.includes('404')) {
        return false;
      }
      // For other errors, log and return false
      console.error(`❌ Error checking template file existence ${templatePath} for shop ${shopDomain}:`, error);
      return false;
    }
  }
}

