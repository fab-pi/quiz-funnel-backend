import { Router, Request, Response } from 'express';
import { QuizService } from '../services/QuizService';
import pool from '../config/db';

const router = Router();
const quizService = new QuizService(pool);

// Debug: Log route definitions
console.log('🔧 Defining content routes:');
console.log('  - GET /content/quiz/:quizId');

// GET /content/quiz/:quizId
router.get('/content/quiz/:quizId', async (req: Request, res: Response) => {
  try {
    const { quizId } = req.params;

    // Validate quiz ID
    if (!quizId || isNaN(parseInt(quizId))) {
      return res.status(400).json({
        success: false,
        message: 'Valid quiz ID is required'
      });
    }

    const result = await quizService.getQuizContent(quizId);
    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error: any) {
    console.error('❌ Error fetching quiz content:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
});

export default router;
