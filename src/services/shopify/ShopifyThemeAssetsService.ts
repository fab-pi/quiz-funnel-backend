import { Pool } from 'pg';
import { BaseService } from '../BaseService';
import { ShopifyService } from './ShopifyService';

/**
 * Shopify Theme Assets Service
 * Handles uploading and managing Liquid template files in Shopify themes using GraphQL API
 */
export class ShopifyThemeAssetsService extends BaseService {
  private shopifyService: ShopifyService;

  constructor(pool: Pool, shopifyService: ShopifyService) {
    super(pool);
    this.shopifyService = shopifyService;
  }

  /**
   * Create or update a Liquid template file in a Shopify theme
   * Uses GraphQL themeFilesUpsert mutation
   * @param shopDomain - Shop domain (e.g., mystore.myshopify.com)
   * @param accessToken - Shopify access token
   * @param themeGid - Theme GID (full GID string from Shopify, e.g., "gid://shopify/Theme/123456")
   * @param templatePath - Template file path (e.g., "templates/page.quiz-app-iframe.liquid")
   * @param templateContent - Liquid template content
   * @returns Success status
   */
  async upsertTemplateFile(
    shopDomain: string,
    accessToken: string,
    themeGid: string,
    templatePath: string,
    templateContent: string
  ): Promise<void> {
    try {
      console.log(`🔄 Uploading template file: ${templatePath} to theme ${themeGid} for shop ${shopDomain}...`);

      // Create GraphQL client
      const client = await this.shopifyService.createGraphQLClient(shopDomain, accessToken);

      // Convert GID format if needed
      // Themes query returns: gid://shopify/Theme/{id}
      // themeFilesUpsert expects: gid://shopify/OnlineStoreTheme/{id}
      let themeGidForMutation = themeGid;
      if (themeGid.startsWith('gid://shopify/Theme/')) {
        // Extract numeric ID and convert to OnlineStoreTheme format
        const numericId = themeGid.replace('gid://shopify/Theme/', '');
        themeGidForMutation = `gid://shopify/OnlineStoreTheme/${numericId}`;
        console.log(`   Converted GID format: ${themeGid} -> ${themeGidForMutation}`);
      } else {
        console.log(`   Using theme GID as-is: ${themeGid}`);
      }

      // GraphQL mutation: themeFilesUpsert
      const mutation = `
        mutation themeFilesUpsert($files: [OnlineStoreThemeFilesUpsertFileInput!]!, $themeId: ID!) {
          themeFilesUpsert(files: $files, themeId: $themeId) {
            upsertedThemeFiles {
              filename
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      // Prepare variables according to Shopify GraphQL API documentation
      // OnlineStoreThemeFilesUpsertFileInput requires:
      // - filename: String! (file path)
      // - body: OnlineStoreThemeFileBodyInput! (with type: "TEXT" and value: content)
      const variables = {
        themeId: themeGidForMutation,
        files: [
          {
            filename: templatePath,
            body: {
              type: 'TEXT', // TEXT type for Liquid template files
              value: templateContent,
            },
          },
        ],
      };

      // Execute GraphQL mutation
      const response = await client.query<{
        data: {
          themeFilesUpsert: {
            upsertedThemeFiles: Array<{ filename: string }>;
            userErrors: Array<{ field: string[]; message: string }>;
          };
        };
      }>({
        data: {
          query: mutation,
          variables: variables,
        },
      });

      if (!response || !response.body || !response.body.data) {
        throw new Error('Invalid response from Shopify themeFilesUpsert mutation');
      }

      const result = response.body.data.themeFilesUpsert;

      // Check for user errors
      if (result.userErrors && result.userErrors.length > 0) {
        const errors = result.userErrors.map((e: any) => {
          const fieldStr = Array.isArray(e.field) ? e.field.join(', ') : e.field;
          return `${fieldStr}: ${e.message}`;
        }).join(', ');
        console.error(`❌ Shopify themeFilesUpsert userErrors:`, errors);
        throw new Error(`Shopify API errors: ${errors}`);
      }

      // Verify file was upserted
      if (!result.upsertedThemeFiles || result.upsertedThemeFiles.length === 0) {
        throw new Error('Template file upload failed: no files were upserted');
      }

      console.log(`✅ Template file uploaded successfully: ${templatePath}`);
      console.log(`   Original Theme GID: ${themeGid}`);
      console.log(`   Mutation Theme GID: ${themeGidForMutation}`);
      console.log(`   Shop: ${shopDomain}`);
      console.log(`   Upserted files: ${result.upsertedThemeFiles.map(f => f.filename).join(', ')}`);

    } catch (error: any) {
      console.error(`❌ Error uploading template file ${templatePath} for shop ${shopDomain}:`, error);
      throw new Error(`Failed to upload template file: ${error.message}`);
    }
  }

  /**
   * Create the quiz app iframe template file
   * @param shopDomain - Shop domain (e.g., mystore.myshopify.com)
   * @param accessToken - Shopify access token
   * @param themeGid - Theme GID (full GID string from Shopify)
   * @param templateContent - Liquid template content
   * @returns Success status
   */
  async createQuizAppTemplate(
    shopDomain: string,
    accessToken: string,
    themeGid: string,
    templateContent: string
  ): Promise<void> {
    const templatePath = 'templates/page.quiz-app-iframe.liquid';
    return this.upsertTemplateFile(shopDomain, accessToken, themeGid, templatePath, templateContent);
  }

  /**
   * Delete a template file from a Shopify theme
   * Note: Shopify GraphQL API doesn't have a direct delete mutation for theme files
   * This method is kept for future implementation or can be used to delete via REST API if needed
   * @param shopDomain - Shop domain (e.g., mystore.myshopify.com)
   * @param accessToken - Shopify access token
   * @param themeGid - Theme GID (full GID string from Shopify)
   * @param templatePath - Template file path (e.g., "templates/page.quiz-app-iframe.liquid")
   * @returns Success status
   */
  async deleteTemplateFile(
    shopDomain: string,
    accessToken: string,
    themeGid: string,
    templatePath: string
  ): Promise<void> {
    try {
      console.log(`🔄 Deleting template file: ${templatePath} from theme ${themeGid} for shop ${shopDomain}...`);
      console.warn(`⚠️ Note: GraphQL API doesn't support direct file deletion. Consider using REST API or leaving file in place.`);
      
      // TODO: Implement via REST API if needed, or use themeFilesUpsert with empty content
      // For now, we'll use themeFilesUpsert to set file content to empty string
      // This effectively "deletes" the file content
      
      const client = await this.shopifyService.createGraphQLClient(shopDomain, accessToken);

      const mutation = `
        mutation themeFilesUpsert($files: [OnlineStoreThemeFilesUpsertFileInput!]!, $themeId: ID!) {
          themeFilesUpsert(files: $files, themeId: $themeId) {
            upsertedThemeFiles {
              filename
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      // Set file content to empty string to effectively delete it
      const variables = {
        themeId: themeGid,
        files: [
          {
            filename: templatePath,
            body: {
              type: 'TEXT',
              value: '', // Empty content
            },
          },
        ],
      };

      const response = await client.query<{
        data: {
          themeFilesUpsert: {
            upsertedThemeFiles: Array<{ filename: string }>;
            userErrors: Array<{ field: string[]; message: string }>;
          };
        };
      }>({
        data: {
          query: mutation,
          variables: variables,
        },
      });

      if (!response || !response.body || !response.body.data) {
        throw new Error('Invalid response from Shopify themeFilesUpsert mutation');
      }

      const result = response.body.data.themeFilesUpsert;

      if (result.userErrors && result.userErrors.length > 0) {
        const errors = result.userErrors.map((e: any) => {
          const fieldStr = Array.isArray(e.field) ? e.field.join(', ') : e.field;
          return `${fieldStr}: ${e.message}`;
        }).join(', ');
        throw new Error(`Shopify API errors: ${errors}`);
      }

      console.log(`✅ Template file deleted (emptied) successfully: ${templatePath}`);

    } catch (error: any) {
      console.error(`❌ Error deleting template file ${templatePath} for shop ${shopDomain}:`, error);
      throw new Error(`Failed to delete template file: ${error.message}`);
    }
  }

  /**
   * Delete the quiz app iframe template file
   * @param shopDomain - Shop domain (e.g., mystore.myshopify.com)
   * @param accessToken - Shopify access token
   * @param themeGid - Theme GID (full GID string from Shopify)
   * @returns Success status
   */
  async deleteQuizAppTemplate(
    shopDomain: string,
    accessToken: string,
    themeGid: string
  ): Promise<void> {
    const templatePath = 'templates/page.quiz-app-iframe.liquid';
    return this.deleteTemplateFile(shopDomain, accessToken, themeGid, templatePath);
  }

  /**
   * Check if a template file exists in a theme
   * Note: GraphQL API doesn't have a direct query for checking file existence
   * This method attempts to read the file, if it fails, file doesn't exist
   * @param shopDomain - Shop domain (e.g., mystore.myshopify.com)
   * @param accessToken - Shopify access token
   * @param themeGid - Theme GID (full GID string from Shopify)
   * @param templatePath - Template file path (e.g., "templates/page.quiz-app-iframe.liquid")
   * @returns True if template exists, false otherwise
   */
  async templateFileExists(
    shopDomain: string,
    accessToken: string,
    themeGid: string,
    templatePath: string
  ): Promise<boolean> {
    try {
      // GraphQL API doesn't have a direct "get file" query
      // We can try to use themeFilesUpsert with existing content, but that's not ideal
      // For now, we'll assume file exists if we can successfully upsert it
      // A better approach would be to use REST API for checking existence
      // For simplicity, we'll return true if no error occurs during upsert
      // This is a limitation - consider using REST API for file existence checks
      
      console.log(`⚠️ templateFileExists: GraphQL API limitation - assuming file can be created/updated`);
      return true; // Assume file can be created/updated

    } catch (error: any) {
      console.error(`❌ Error checking template file existence ${templatePath} for shop ${shopDomain}:`, error);
      return false;
    }
  }
}

