import { Pool } from 'pg';
import { BaseService } from '../BaseService';
import { ShopifyService } from './ShopifyService';

/**
 * Shopify Files Service
 * Handles file uploads to Shopify Files API via GraphQL
 */
export class ShopifyFilesService extends BaseService {
  private shopifyService: ShopifyService;

  constructor(pool: Pool, shopifyService: ShopifyService) {
    super(pool);
    this.shopifyService = shopifyService;
  }

  /**
   * Upload a file to Shopify Files API
   * @param shopDomain - Shop domain (e.g., mystore.myshopify.com)
   * @param accessToken - Shopify access token
   * @param fileBuffer - File buffer (from multipart/form-data)
   * @param filename - Original filename
   * @param mimeType - File MIME type (e.g., 'image/jpeg', 'image/png')
   * @returns Shopify CDN URL
   */
  async uploadFile(
    shopDomain: string,
    accessToken: string,
    fileBuffer: Buffer,
    filename: string,
    mimeType: string
  ): Promise<string> {
    try {
      console.log(`🔄 Uploading file to Shopify: ${filename} (${(fileBuffer.length / 1024 / 1024).toFixed(2)}MB)`);

      // Validate file size (Shopify limit: 20MB)
      const maxSizeBytes = 20 * 1024 * 1024; // 20MB
      if (fileBuffer.length > maxSizeBytes) {
        throw new Error(`File size exceeds Shopify's 20MB limit. File size: ${(fileBuffer.length / 1024 / 1024).toFixed(2)}MB`);
      }

      // Validate file type (images only)
      const allowedMimeTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/svg+xml'
      ];
      if (!allowedMimeTypes.includes(mimeType.toLowerCase())) {
        throw new Error(`Invalid file type. Allowed types: ${allowedMimeTypes.join(', ')}. Received: ${mimeType}`);
      }

      // Create GraphQL client
      const client = await this.shopifyService.createGraphQLClient(shopDomain, accessToken);

      // Convert file buffer to base64 for GraphQL mutation
      const base64File = fileBuffer.toString('base64');

      // GraphQL mutation: fileCreate
      // According to Shopify docs, fileCreate accepts:
      // - files: [FileCreateInput!]!
      //   - FileCreateInput:
      //     - originalSource: String! (base64 encoded file)
      //     - alt: String (optional alt text)
      //     - contentType: FileContentType (IMAGE, VIDEO, etc.)
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

      // Determine content type from MIME type
      let contentType = 'IMAGE'; // Default to IMAGE
      if (mimeType.startsWith('video/')) {
        contentType = 'VIDEO';
      }

      const variables = {
        files: [
          {
            originalSource: base64File,
            alt: filename,
            contentType: contentType
          }
        ]
      };

      // Execute GraphQL mutation
      const response = await client.query<{
        data: {
          fileCreate: {
            files: Array<{
              id: string;
              fileStatus: string;
              image?: {
                url: string;
                altText: string | null;
              };
            }>;
            userErrors: Array<{ field: string[]; message: string }>;
          };
        };
      }>({
        data: {
          query: mutation,
          variables: variables
        }
      });

      // Check for user errors
      const data = response.body?.data;
      if (!data || !data.fileCreate) {
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
        throw new Error('No files returned from Shopify fileCreate mutation');
      }

      const uploadedFile = files[0];

      // Check file status
      if (uploadedFile.fileStatus !== 'READY') {
        throw new Error(`File upload not ready. Status: ${uploadedFile.fileStatus}`);
      }

      // Extract CDN URL from image object
      if (!uploadedFile.image || !uploadedFile.image.url) {
        throw new Error('No image URL returned from Shopify fileCreate mutation');
      }

      const cdnUrl = uploadedFile.image.url;
      console.log(`✅ File uploaded successfully: ${cdnUrl}`);

      return cdnUrl;
    } catch (error: any) {
      console.error(`❌ Error uploading file to Shopify:`, error);
      throw new Error(`Failed to upload file to Shopify: ${error.message || 'Unknown error'}`);
    }
  }
}

