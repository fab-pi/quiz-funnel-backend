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

// GET /api/upload/shopify/staged-url - Get staged upload URL for direct client upload
// Protected: Requires Shopify authentication
// Query params: filename, mimeType, fileSize
router.get('/upload/shopify/staged-url', shopifyAuthenticate, async (req: ShopifyRequest, res: Response) => {
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

    // Extract query parameters
    const { filename, mimeType, fileSize } = req.query;

    if (!filename || !mimeType || !fileSize) {
      return res.status(400).json({
        success: false,
        message: 'Missing required query parameters: filename, mimeType, fileSize'
      });
    }

    // Validate file size (Shopify limit: 20MB)
    const fileSizeNum = parseInt(fileSize as string, 10);
    if (isNaN(fileSizeNum) || fileSizeNum <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid fileSize parameter'
      });
    }

    const maxSizeBytes = 20 * 1024 * 1024; // 20MB
    if (fileSizeNum > maxSizeBytes) {
      return res.status(400).json({
        success: false,
        message: `File size exceeds Shopify's 20MB limit. File size: ${(fileSizeNum / 1024 / 1024).toFixed(2)}MB`
      });
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
    if (!allowedMimeTypes.includes((mimeType as string).toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: `Invalid file type. Allowed types: ${allowedMimeTypes.join(', ')}. Received: ${mimeType}`
      });
    }

    // Get staged upload target
    const stagedTarget = await shopifyFilesService.createStagedUpload(
      shopDomain,
      filename as string,
      mimeType as string,
      fileSizeNum
    );

    res.json({
      success: true,
      data: stagedTarget
    });

  } catch (error: any) {
    console.error('❌ Error creating staged upload URL:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create staged upload URL'
    });
  }
});

// POST /api/upload/shopify/finalize - Finalize file upload after direct client upload
// Protected: Requires Shopify authentication
// Body: { resourceUrl: string, filename: string }
router.post('/upload/shopify/finalize', shopifyAuthenticate, async (req: ShopifyRequest, res: Response) => {
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

    // Verify shop exists
    const shop = await shopifyService!.getShopByDomain(shopDomain);
    if (!shop) {
      return res.status(401).json({
        success: false,
        message: 'Shop not found'
      });
    }

    // Extract request body
    const { resourceUrl, filename } = req.body;

    if (!resourceUrl || !filename) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: resourceUrl, filename'
      });
    }

    // Finalize file upload
    const cdnUrl = await shopifyFilesService.finalizeFileUpload(
      shopDomain,
      resourceUrl,
      filename
    );

    res.json({
      success: true,
      data: {
        url: cdnUrl
      }
    });

  } catch (error: any) {
    console.error('❌ Error finalizing file upload:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to finalize file upload'
    });
  }
});

export default router;
