import { Router, Request, Response } from 'express';
import { QuizService } from '../services/QuizService';
import { CloudinaryService } from '../services/CloudinaryService';
import pool from '../config/db';
import { QuizCreationRequest } from '../types';

const router = Router();
const quizService = new QuizService(pool);
const cloudinaryService = new CloudinaryService();

// Debug: Log route definitions
console.log('🔧 Defining admin routes:');
console.log('  - POST /admin/quiz');
console.log('  - GET /admin/quiz-summary');

// POST /admin/quiz - Create new quiz with full structure
router.post('/admin/quiz', async (req: Request, res: Response) => {
  try {
    const data: QuizCreationRequest = req.body;

    // Validate required fields
    if (!data.quiz_name || !data.product_page_url || !data.questions || !Array.isArray(data.questions)) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: quiz_name, product_page_url, and questions array are required'
      });
    }

    // Validate image URLs if provided
    if (data.brand_logo_url && !cloudinaryService.isValidCloudinaryUrl(data.brand_logo_url)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid brand_logo_url format. Must be a valid Cloudinary URL.'
      });
    }

    // Validate questions structure
    for (const question of data.questions) {
      if (!question.question_text || !question.interaction_type || !question.options || !Array.isArray(question.options)) {
        return res.status(400).json({
          success: false,
          message: 'Each question must have question_text, interaction_type, and options array'
        });
      }

      // Validate options structure
      for (const option of question.options) {
        if (!option.option_text || !option.associated_value) {
          return res.status(400).json({
            success: false,
            message: 'Each option must have option_text and associated_value'
          });
        }

        // Validate option image URLs if provided
        if (option.option_image_url && !cloudinaryService.isValidCloudinaryUrl(option.option_image_url)) {
          return res.status(400).json({
            success: false,
            message: `Invalid option_image_url format for option "${option.option_text}". Must be a valid Cloudinary URL.`
          });
        }
      }
    }

    const result = await quizService.createQuiz(data);
    res.status(201).json(result);

  } catch (error: any) {
    console.error('❌ Error creating quiz:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create quiz. Transaction rolled back.'
    });
  }
});

// GET /admin/quiz-summary - Get summary metrics for all quizzes
router.get('/admin/quiz-summary', async (req: Request, res: Response) => {
  try {
    console.log('📊 Fetching quiz summary metrics...');
    
    const summaryMetrics = await quizService.getQuizSummaryMetrics();
    
    res.json({
      success: true,
      data: summaryMetrics
    });
    
  } catch (error: any) {
    console.error('❌ Error fetching quiz summary metrics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch quiz summary metrics'
    });
  }
});

export default router;
