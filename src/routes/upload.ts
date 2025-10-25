import { Router, Request, Response } from 'express';
import { CloudinaryService } from '../services/CloudinaryService';

const router = Router();
const cloudinaryService = new CloudinaryService();

// GET /api/upload/signature - Generate upload signature for direct client uploads
router.get('/upload/signature', async (req: Request, res: Response) => {
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
