import { Pool } from 'pg';
import { BaseService } from '../BaseService';
import { ShopifyService } from './ShopifyService';
import FormData from 'form-data';
import fetch from 'node-fetch';

/**
 * Shopify Files Service
 * Handles file uploads to Shopify Files API using staged uploads (recommended method)
 */
export class ShopifyFilesService extends BaseService {
  private shopifyService: ShopifyService;

  constructor(pool: Pool, shopifyService: ShopifyService) {
    super(pool);
    this.shopifyService = shopifyService;
  }

  /**
   * Create staged upload target (Step 1 of Shopify's recommended flow)
   * Returns signed URL and parameters for direct client upload
   * @param shopDomain - Shop domain
   * @param accessToken - Shopify access token
   * @param filename - Original filename
   * @param mimeType - File MIME type
   * @param fileSize - File size in bytes
   * @returns Staged upload target with URL, resourceUrl, and parameters
   */
  async createStagedUpload(
    shopDomain: string,
    accessToken: string,
    filename: string,
    mimeType: string,
    fileSize: number
  ): Promise<{
    url: string;
    resourceUrl: string;
    parameters: Array<{ name: string; value: string }>;
  }> {
    // Create GraphQL client
    const client = await this.shopifyService.createGraphQLClient(shopDomain, accessToken);
    
    const result = await this.createStagedUploadInternal(client, filename, mimeType, fileSize);
    
    if (!result.stagedTargets || result.stagedTargets.length === 0) {
      throw new Error('No staged upload targets returned from Shopify');
    }
    
    return result.stagedTargets[0];
  }

  /**
   * Internal method: Create staged upload target (uses GraphQL client)
   */
  private async createStagedUploadInternal(
    client: any,
    filename: string,
    mimeType: string,
    fileSize: number
  ): Promise<{
    stagedTargets: Array<{
      url: string;
      resourceUrl: string;
      parameters: Array<{ name: string; value: string }>;
    }>;
    userErrors: Array<{ field: string[]; message: string }>;
  }> {
    const mutation = `
      mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters {
              name
              value
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    // Determine resource type from MIME type
    let resourceType = 'IMAGE';
    if (mimeType.startsWith('video/')) {
      resourceType = 'VIDEO';
    } else if (mimeType.includes('model') || mimeType.includes('3d')) {
      resourceType = 'MODEL_3D';
    }

    const variables = {
      input: [
        {
          filename: filename,
          mimeType: mimeType,
          resource: resourceType,
          httpMethod: 'POST', // Explicitly set POST method for multipart upload
          fileSize: fileSize.toString() // Include file size for signature calculation
        }
      ]
    };

    const response = await client.query({
      data: {
        query: mutation,
        variables: variables
      }
    });

    const data = response.body?.data;
    if (!data || !data.stagedUploadsCreate) {
      console.error('❌ Invalid response from stagedUploadsCreate:', JSON.stringify(response.body, null, 2));
      throw new Error('Invalid response from Shopify stagedUploadsCreate mutation');
    }

    const { stagedTargets, userErrors } = data.stagedUploadsCreate;

    if (userErrors && userErrors.length > 0) {
      const errorMessages = userErrors.map((e: any) => {
        const field = Array.isArray(e.field) ? e.field.join('.') : e.field;
        return `${field}: ${e.message}`;
      }).join(', ');
      throw new Error(`Shopify stagedUploadsCreate user errors: ${errorMessages}`);
    }

    return { stagedTargets, userErrors: [] };
  }

  /**
   * Finalize file upload (Step 3 of Shopify's recommended flow)
   * Creates file record in Shopify using resourceUrl from staged upload
   * @param shopDomain - Shop domain
   * @param accessToken - Shopify access token
   * @param resourceUrl - Resource URL from staged upload
   * @param filename - Original filename
   * @returns Shopify CDN URL
   */
  async finalizeFileUpload(
    shopDomain: string,
    accessToken: string,
    resourceUrl: string,
    filename: string
  ): Promise<string> {
    // Create GraphQL client
    const client = await this.shopifyService.createGraphQLClient(shopDomain, accessToken);
    
    return await this.createFileFromStagedUploadInternal(client, resourceUrl, filename);
  }

  /**
   * Internal method: Create file in Shopify using resourceUrl from staged upload
   */
  private async createFileFromStagedUploadInternal(
    client: any,
    resourceUrl: string,
    filename: string
  ): Promise<string> {
    const mutation = `
      mutation fileCreate($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            id
            fileStatus
            ... on MediaImage {
              image {
                url
                altText
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      files: [
        {
          originalSource: resourceUrl,
          alt: filename
        }
      ]
    };

    const response = await client.query({
      data: {
        query: mutation,
        variables: variables
      }
    });

    const data = response.body?.data;
    if (!data || !data.fileCreate) {
      console.error('❌ Invalid response from fileCreate:', JSON.stringify(response.body, null, 2));
      throw new Error('Invalid response from Shopify fileCreate mutation');
    }

    const { files, userErrors } = data.fileCreate;

    if (userErrors && userErrors.length > 0) {
      const errorMessages = userErrors.map((e: any) => {
        const field = Array.isArray(e.field) ? e.field.join('.') : e.field;
        return `${field}: ${e.message}`;
      }).join(', ');
      throw new Error(`Shopify fileCreate user errors: ${errorMessages}`);
    }

    if (!files || files.length === 0) {
      console.error('❌ No files returned from fileCreate:', JSON.stringify(response.body, null, 2));
      throw new Error('No files returned from Shopify fileCreate mutation');
    }

    const createdFile = files[0];
    const fileId = createdFile.id;

    // Log file status for debugging
    console.log(`   File status: ${createdFile.fileStatus}`);

    // If file is already READY, return URL immediately
    if (createdFile.fileStatus === 'READY' && createdFile.image?.url) {
      return createdFile.image.url;
    }

    // If file is UPLOADED, poll until it becomes READY
    if (createdFile.fileStatus === 'UPLOADED') {
      console.log(`   File is UPLOADED, polling for READY status...`);
      return await this.pollFileUntilReady(client, fileId, filename);
    }

    // If status is something else, throw error
    console.error('❌ Unexpected file status:', JSON.stringify(createdFile, null, 2));
    throw new Error(`File status is ${createdFile.fileStatus}, expected READY or UPLOADED`);
  }

  /**
   * Poll file until it becomes READY and returns image URL
   */
  private async pollFileUntilReady(
    client: any,
    fileId: string,
    filename: string,
    maxAttempts: number = 30,
    delayMs: number = 1000
  ): Promise<string> {
    const query = `
      query getFile($id: ID!) {
        node(id: $id) {
          ... on MediaImage {
            id
            fileStatus
            image {
              url
              altText
            }
          }
        }
      }
    `;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`   Polling attempt ${attempt}/${maxAttempts}...`);

      try {
        const response = await client.query({
          data: {
            query: query,
            variables: { id: fileId }
          }
        });

        const data = response.body?.data;
        if (!data || !data.node) {
          console.log(`   ⚠️ File not found, waiting...`);
          await this.sleep(delayMs);
          continue;
        }

        const file = data.node as {
          id: string;
          fileStatus: string;
          image?: {
            url: string;
            altText: string | null;
          };
        };

        console.log(`   File status: ${file.fileStatus}`);

        if (file.fileStatus === 'READY' && file.image?.url) {
          console.log(`   ✅ File is READY, URL: ${file.image.url}`);
          return file.image.url;
        }

        if (file.fileStatus === 'FAILED') {
          throw new Error(`File processing failed for ${filename}`);
        }

        // Wait before next attempt
        if (attempt < maxAttempts) {
          await this.sleep(delayMs);
        }
      } catch (error: any) {
        console.error(`   ⚠️ Error polling file (attempt ${attempt}):`, error.message);
        if (attempt < maxAttempts) {
          await this.sleep(delayMs);
        }
      }
    }

    throw new Error(`File did not become READY after ${maxAttempts} attempts (${maxAttempts * delayMs / 1000}s timeout)`);
  }

  /**
   * Sleep utility for polling
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
