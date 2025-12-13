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
   * Upload a file to Shopify Files API using staged uploads
   * @param shopDomain - Shop domain (e.g., mystore.myshopify.com)
   * @param accessToken - Shopify access token
   * @param fileBuffer - File buffer
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
      console.log(`🔄 Starting staged upload to Shopify: ${filename} (${(fileBuffer.length / 1024 / 1024).toFixed(2)}MB)`);

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

      // Step 1: Create staged upload target
      console.log(`   Step 1: Creating staged upload target...`);
      const stagedUploadResult = await this.createStagedUpload(client, filename, mimeType);
      
      if (!stagedUploadResult.stagedTargets || stagedUploadResult.stagedTargets.length === 0) {
        throw new Error('No staged upload targets returned from Shopify');
      }

      const stagedTarget = stagedUploadResult.stagedTargets[0];
      console.log(`   ✅ Staged upload target created: ${stagedTarget.url}`);

      // Step 2: Upload file to staged target URL
      console.log(`   Step 2: Uploading file to staged target...`);
      await this.uploadToStagedTarget(stagedTarget, fileBuffer, filename, mimeType);
      console.log(`   ✅ File uploaded to staged target`);

      // Step 3: Create file in Shopify using resourceUrl
      console.log(`   Step 3: Creating file record in Shopify...`);
      const cdnUrl = await this.createFileFromStagedUpload(client, stagedTarget.resourceUrl, filename);
      console.log(`   ✅ File created in Shopify: ${cdnUrl}`);

      return cdnUrl;
    } catch (error: any) {
      console.error(`❌ Error uploading file to Shopify:`, error);
      throw new Error(`Failed to upload file to Shopify: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Step 1: Create staged upload target
   */
  private async createStagedUpload(
    client: any,
    filename: string,
    mimeType: string
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
          resource: resourceType
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
   * Step 2: Upload file to staged target URL
   * Note: Parameters must be added BEFORE the file, and file must be last
   */
  private async uploadToStagedTarget(
    stagedTarget: {
      url: string;
      resourceUrl: string;
      parameters: Array<{ name: string; value: string }>;
    },
    fileBuffer: Buffer,
    filename: string,
    mimeType: string
  ): Promise<void> {
    // Log parameters for debugging
    console.log(`   Staged target parameters:`, JSON.stringify(stagedTarget.parameters, null, 2));
    
    // Create multipart/form-data
    const formData = new FormData();
    
    // IMPORTANT: Add parameters FIRST (order matters for signature)
    stagedTarget.parameters.forEach(param => {
      formData.append(param.name, param.value);
    });
    
    // IMPORTANT: Add file LAST (must be the last field)
    // The field name should match what Shopify expects - typically "file"
    formData.append('file', fileBuffer, {
      filename: filename,
      contentType: mimeType
    });

    // Get headers from FormData (includes Content-Type with boundary)
    const headers = formData.getHeaders();
    
    // Upload to staged target URL
    // Note: Do NOT override Content-Type - FormData sets it correctly with boundary
    const uploadResponse = await fetch(stagedTarget.url, {
      method: 'POST',
      body: formData,
      headers: headers
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error(`❌ Failed to upload to staged target: ${uploadResponse.status}`);
      console.error(`   Response: ${errorText.substring(0, 500)}`); // Log first 500 chars
      throw new Error(`Failed to upload file to staged target: ${uploadResponse.status} ${errorText.substring(0, 200)}`);
    }

    console.log(`   ✅ File uploaded to staged target successfully`);
  }

  /**
   * Step 3: Create file in Shopify using resourceUrl from staged upload
   */
  private async createFileFromStagedUpload(
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

    // Log file status for debugging
    console.log(`   File status: ${createdFile.fileStatus}`);

    // Extract CDN URL from image object
    if (!createdFile.image || !createdFile.image.url) {
      console.error('❌ No image URL in response:', JSON.stringify(createdFile, null, 2));
      throw new Error('No image URL returned from Shopify fileCreate mutation');
    }

    return createdFile.image.url;
  }
}
