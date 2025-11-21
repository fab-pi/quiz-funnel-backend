import { Router, Response } from 'express';
import { CloudinaryService } from '../services/CloudinaryService';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
const cloudinaryService = new CloudinaryService();

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

export default router;
