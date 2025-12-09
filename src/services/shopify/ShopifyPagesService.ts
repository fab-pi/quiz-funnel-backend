import { Pool } from 'pg';
import { BaseService } from '../BaseService';
import { ShopifyService } from './ShopifyService';

/**
 * Shopify Pages Service
 * Handles Shopify page CRUD operations via GraphQL Admin API
 */
export class ShopifyPagesService extends BaseService {
  private shopifyService: ShopifyService;

  constructor(pool: Pool, shopifyService: ShopifyService) {
    super(pool);
    this.shopifyService = shopifyService;
  }

  /**
   * Create a new Shopify page
   * @param shopDomain - Shop domain (e.g., mystore.myshopify.com)
   * @param accessToken - Shopify access token
   * @param pageData - Page data (title, body_html, handle)
   * @returns Created page ID and handle
   */
  async createPage(
    shopDomain: string,
    accessToken: string,
    pageData: {
      title: string;
      bodyHtml: string;
      handle?: string;
    }
  ): Promise<{ pageId: number; handle: string }> {
    try {
      const client = await this.shopifyService.createGraphQLClient(shopDomain, accessToken);

      // Generate handle from title if not provided
      const handle = pageData.handle || this.generateHandleFromTitle(pageData.title);

      const mutation = `
        mutation pageCreate($page: PageCreateInput!) {
          pageCreate(page: $page) {
            page {
              id
              handle
              title
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const variables = {
        page: {
          title: pageData.title,
          bodyHtml: pageData.bodyHtml,
          handle: handle,
        },
      };

      // GraphqlParams expects data as string or object with query/variables
      const response = await client.query<{
        data: {
          pageCreate: {
            page: {
              id: string;
              handle: string;
              title: string;
            };
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
        throw new Error('Invalid response from Shopify pageCreate mutation');
      }

      const result = response.body.data.pageCreate;

      // Check for user errors
      if (result.userErrors && result.userErrors.length > 0) {
        const errors = result.userErrors.map((e: any) => `${e.field}: ${e.message}`).join(', ');
        throw new Error(`Shopify API errors: ${errors}`);
      }

      if (!result.page) {
        throw new Error('Page creation failed: no page returned');
      }

      const pageId = this.extractIdFromGid(result.page.id);
      if (!pageId) {
        throw new Error(`Failed to extract page ID from GID: ${result.page.id}`);
      }

      console.log(`✅ Shopify page created: ${result.page.title} (ID: ${pageId}, handle: ${result.page.handle})`);

      return {
        pageId,
        handle: result.page.handle,
      };
    } catch (error: any) {
      console.error(`❌ Error creating Shopify page for shop ${shopDomain}:`, error);
      throw new Error(`Failed to create Shopify page: ${error.message}`);
    }
  }

  /**
   * Update an existing Shopify page
   * @param shopDomain - Shop domain (e.g., mystore.myshopify.com)
   * @param accessToken - Shopify access token
   * @param pageId - Shopify page ID
   * @param pageData - Page data to update (title, body_html, handle)
   * @returns Updated page ID and handle
   */
  async updatePage(
    shopDomain: string,
    accessToken: string,
    pageId: number,
    pageData: {
      title?: string;
      bodyHtml?: string;
      handle?: string;
    }
  ): Promise<{ pageId: number; handle: string }> {
    try {
      const client = await this.shopifyService.createGraphQLClient(shopDomain, accessToken);

      // Convert numeric ID to Shopify GID
      const pageGid = `gid://shopify/OnlineStorePage/${pageId}`;

      const mutation = `
        mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
          pageUpdate(id: $id, page: $page) {
            page {
              id
              handle
              title
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const variables: any = {
        id: pageGid,
        page: {},
      };

      // Only include fields that are provided
      if (pageData.title !== undefined) {
        variables.page.title = pageData.title;
      }
      if (pageData.bodyHtml !== undefined) {
        variables.page.bodyHtml = pageData.bodyHtml;
      }
      if (pageData.handle !== undefined) {
        variables.page.handle = pageData.handle;
      }

      // GraphqlParams expects data as string or object with query/variables
      const response = await client.query<{
        data: {
          pageUpdate: {
            page: {
              id: string;
              handle: string;
              title: string;
            };
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
        throw new Error('Invalid response from Shopify pageUpdate mutation');
      }

      const result = response.body.data.pageUpdate;

      // Check for user errors
      if (result.userErrors && result.userErrors.length > 0) {
        const errors = result.userErrors.map((e: any) => `${e.field}: ${e.message}`).join(', ');
        throw new Error(`Shopify API errors: ${errors}`);
      }

      if (!result.page) {
        throw new Error('Page update failed: no page returned');
      }

      const updatedPageId = this.extractIdFromGid(result.page.id);
      if (!updatedPageId) {
        throw new Error(`Failed to extract page ID from GID: ${result.page.id}`);
      }

      console.log(`✅ Shopify page updated: ${result.page.title} (ID: ${updatedPageId}, handle: ${result.page.handle})`);

      return {
        pageId: updatedPageId,
        handle: result.page.handle,
      };
    } catch (error: any) {
      console.error(`❌ Error updating Shopify page ${pageId} for shop ${shopDomain}:`, error);
      throw new Error(`Failed to update Shopify page: ${error.message}`);
    }
  }

  /**
   * Delete a Shopify page
   * @param shopDomain - Shop domain (e.g., mystore.myshopify.com)
   * @param accessToken - Shopify access token
   * @param pageId - Shopify page ID
   */
  async deletePage(shopDomain: string, accessToken: string, pageId: number): Promise<void> {
    try {
      const client = await this.shopifyService.createGraphQLClient(shopDomain, accessToken);

      // Convert numeric ID to Shopify GID
      const pageGid = `gid://shopify/OnlineStorePage/${pageId}`;

      const mutation = `
        mutation pageDelete($id: ID!) {
          pageDelete(id: $id) {
            deletedId
            userErrors {
              field
              message
            }
          }
        }
      `;

      const variables = {
        id: pageGid,
      };

      // GraphqlParams expects data as string or object with query/variables
      const response = await client.query<{
        data: {
          pageDelete: {
            deletedId: string;
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
        throw new Error('Invalid response from Shopify pageDelete mutation');
      }

      const result = response.body.data.pageDelete;

      // Check for user errors
      if (result.userErrors && result.userErrors.length > 0) {
        const errors = result.userErrors.map((e: any) => `${e.field}: ${e.message}`).join(', ');
        throw new Error(`Shopify API errors: ${errors}`);
      }

      console.log(`✅ Shopify page deleted: ${pageId}`);
    } catch (error: any) {
      console.error(`❌ Error deleting Shopify page ${pageId} for shop ${shopDomain}:`, error);
      throw new Error(`Failed to delete Shopify page: ${error.message}`);
    }
  }

  /**
   * Get a Shopify page by ID
   * @param shopDomain - Shop domain (e.g., mystore.myshopify.com)
   * @param accessToken - Shopify access token
   * @param pageId - Shopify page ID
   * @returns Page data or null if not found
   */
  async getPage(
    shopDomain: string,
    accessToken: string,
    pageId: number
  ): Promise<{ pageId: number; handle: string; title: string } | null> {
    try {
      const client = await this.shopifyService.createGraphQLClient(shopDomain, accessToken);

      // Convert numeric ID to Shopify GID
      const pageGid = `gid://shopify/OnlineStorePage/${pageId}`;

      const query = `
        query getPage($id: ID!) {
          page(id: $id) {
            id
            handle
            title
          }
        }
      `;

      const variables = {
        id: pageGid,
      };

      // GraphqlParams expects data as string or object with query/variables
      const response = await client.query<{
        data: {
          page: {
            id: string;
            handle: string;
            title: string;
          } | null;
        };
      }>({
        data: {
          query: query,
          variables: variables,
        },
      });

      if (!response || !response.body || !response.body.data) {
        throw new Error('Invalid response from Shopify page query');
      }

      const page = response.body.data.page;

      if (!page) {
        console.log(`⚠️ Page ${pageId} not found for shop ${shopDomain}`);
        return null;
      }

      const extractedPageId = this.extractIdFromGid(page.id);
      if (!extractedPageId) {
        throw new Error(`Failed to extract page ID from GID: ${page.id}`);
      }

      return {
        pageId: extractedPageId,
        handle: page.handle,
        title: page.title,
      };
    } catch (error: any) {
      console.error(`❌ Error getting Shopify page ${pageId} for shop ${shopDomain}:`, error);
      throw new Error(`Failed to get Shopify page: ${error.message}`);
    }
  }

  /**
   * Extract numeric ID from Shopify GID (Global ID)
   * @param gid - Shopify GID (e.g., "gid://shopify/OnlineStorePage/123456")
   * @returns Numeric ID or null if extraction fails
   */
  private extractIdFromGid(gid: string): number | null {
    try {
      // Shopify GID format: "gid://shopify/OnlineStorePage/123456"
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

  /**
   * Generate a URL-friendly handle from a title
   * @param title - Page title
   * @returns URL-friendly handle (e.g., "quiz-4" from "Quiz 4")
   */
  private generateHandleFromTitle(title: string): string {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
      .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
  }
}

