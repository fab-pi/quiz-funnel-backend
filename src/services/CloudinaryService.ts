import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

export class CloudinaryService {
  private cloudName: string;
  private apiKey: string;
  private apiSecret: string;

  constructor() {
    this.cloudName = process.env.CLOUDINARY_CLOUD_NAME || '';
    this.apiKey = process.env.CLOUDINARY_API_KEY || '';
    this.apiSecret = process.env.CLOUDINARY_API_SECRET || '';

    if (!this.cloudName || !this.apiKey || !this.apiSecret) {
      throw new Error('Cloudinary credentials not found in environment variables');
    }
  }

  /**
   * Generate upload signature for direct client-side uploads
   * @param folder - Optional folder path for organization
   * @returns Upload signature data for frontend
   */
  generateUploadSignature(folder: string = 'quiz-funnel'): {
    timestamp: number;
    signature: string;
    api_key: string;
    cloud_name: string;
    folder: string;
  } {
    try {
      const timestamp = Math.round(Date.now() / 1000);
      const params = {
        timestamp,
        folder,
        ...(folder && { folder })
      };

      // Create signature string
      const signatureString = Object.keys(params)
        .sort()
        .map(key => `${key}=${params[key as keyof typeof params]}`)
        .join('&');

      // Generate signature
      const signature = crypto
        .createHash('sha1')
        .update(signatureString + this.apiSecret)
        .digest('hex');

      console.log('✅ Cloudinary upload signature generated');

      return {
        timestamp,
        signature,
        api_key: this.apiKey,
        cloud_name: this.cloudName,
        folder
      };
    } catch (error) {
      console.error('❌ Error generating Cloudinary upload signature:', error);
      throw new Error('Failed to generate upload signature');
    }
  }

  /**
   * Validate Cloudinary URL format
   * @param url - URL to validate
   * @returns boolean indicating if URL is valid Cloudinary URL
   */
  isValidCloudinaryUrl(url: string): boolean {
    const cloudinaryUrlPattern = /^https:\/\/res\.cloudinary\.com\/[^\/]+\/image\/upload\/.*$/;
    return cloudinaryUrlPattern.test(url);
  }
}
