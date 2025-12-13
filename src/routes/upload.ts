import { Router, Response } from 'express';
import { CloudinaryService } from '../services/CloudinaryService';
import { authenticate, AuthRequest } from '../middleware/auth';
import { shopifyAuthenticate, ShopifyRequest } from '../middleware/shopifyAuth';
import { ShopifyService } from '../services/shopify/ShopifyService';
import { ShopifyFilesService } from '../services/shopify/ShopifyFilesService';
import pool from '../config/db';

const router = Router();
const cloudinaryService = new CloudinaryService();

// Initialize Shopify services
let shopifyService: ShopifyService | null = null;
let shopifyFilesService: ShopifyFilesService | null = null;

try {
  shopifyService = new ShopifyService(pool);
  if (shopifyService) {
    shopifyFilesService = new ShopifyFilesService(pool, shopifyService);
  }
} catch (error) {
  console.warn('⚠️ ShopifyService not initialized (Shopify file uploads disabled):', (error as Error).message);
}

// GET /api/upload/signature - Generate upload signature for direct client uploads
// Protected: Requires authentication (only authenticated users can upload)
router.get('/upload/signature', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    console.log('📤 Generating Cloudinary upload signature...');
    
    const { folder } = req.query;
    const uploadSignature = cloudinaryService.generateUploadSignature(
      folder as string || 'quiz-funnel'
    );
    
    res.json({
      success: true,
      data: uploadSignature
    });
    
  } catch (error: any) {
    console.error('❌ Error generating upload signature:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate upload signature'
    });
  }
});

// POST /api/upload/shopify - Upload file to Shopify Files API
// Protected: Requires Shopify authentication
// Body: { file: base64String, filename: string, mimeType: string }
router.post('/upload/shopify', shopifyAuthenticate, async (req: ShopifyRequest, res: Response) => {
  try {
    if (!shopifyFilesService) {
      return res.status(503).json({
        success: false,
        message: 'Shopify file upload service not available'
      });
    }

    const shopDomain = req.shop;
    if (!shopDomain) {
      return res.status(400).json({
        success: false,
        message: 'Shop domain is required'
      });
    }

    // Get access token from shop
    const shop = await shopifyService!.getShopByDomain(shopDomain);
    if (!shop || !shop.accessToken) {
      return res.status(401).json({
        success: false,
        message: 'Shop access token not found'
      });
    }

    // Extract file data from request body
    const { file: base64File, filename, mimeType } = req.body;

    if (!base64File || !filename || !mimeType) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: file (base64), filename, mimeType'
      });
    }

    // Convert base64 to buffer
    let fileBuffer: Buffer;
    try {
      // Remove data URL prefix if present (e.g., "data:image/jpeg;base64,")
      const base64Data = base64File.replace(/^data:[^;]+;base64,/, '');
      fileBuffer = Buffer.from(base64Data, 'base64');
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: `Invalid base64 file data: ${error.message}`
      });
    }

    // Upload file to Shopify
    const cdnUrl = await shopifyFilesService.uploadFile(
      shopDomain,
      shop.accessToken,
      fileBuffer,
      filename,
      mimeType
    );

    res.json({
      success: true,
      data: {
        url: cdnUrl
      }
    });

  } catch (error: any) {
    console.error('❌ Error uploading file to Shopify:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload file to Shopify'
    });
  }
});

export default router;
