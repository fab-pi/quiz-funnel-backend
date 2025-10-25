import { Router, Request, Response } from 'express';
import { QuizService } from '../services/QuizService';
import pool from '../config/db';

const router = Router();
const quizService = new QuizService(pool);

// Debug: Log route definitions
console.log('🔧 Defining analytics routes:');
console.log('  - GET /analytics/drop-rate/:quizId');
console.log('  - GET /analytics/utm-performance/:quizId');

// GET /analytics/drop-rate/:quizId
router.get('/analytics/drop-rate/:quizId', async (req: Request, res: Response) => {
  try {
    const { quizId } = req.params;

    // Validate quiz ID
    if (!quizId || isNaN(parseInt(quizId))) {
      return res.status(400).json({
        success: false,
        message: 'Valid quiz ID is required'
      });
    }

    const result = await quizService.getDropRateAnalytics(quizId);
    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error: any) {
    console.error('❌ Error fetching drop rate analytics:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
});

// GET /analytics/utm-performance/:quizId
router.get('/analytics/utm-performance/:quizId', async (req: Request, res: Response) => {
  try {
    const { quizId } = req.params;

    // Validate quiz ID
    if (!quizId || isNaN(parseInt(quizId))) {
      return res.status(400).json({
        success: false,
        message: 'Valid quiz ID is required'
      });
    }

    const result = await quizService.getUTMPerformanceAnalytics(quizId);
    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error: any) {
    console.error('❌ Error fetching UTM performance analytics:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
});

export default router;
