import { Router, Response } from 'express';
import { QuizCreationService } from '../services/QuizCreationService';
import { AdminService } from '../services/AdminService';
import { CloudinaryService } from '../services/CloudinaryService';
import pool from '../config/db';
import { QuizCreationRequest } from '../types';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();
const quizCreationService = new QuizCreationService(pool);
const adminService = new AdminService(pool);
const cloudinaryService = new CloudinaryService();

// Debug: Log route definitions
console.log('🔧 Defining admin routes:');
console.log('  - POST /admin/quiz');
console.log('  - PUT /admin/quiz/:quizId');
console.log('  - GET /admin/quiz/:quizId');
console.log('  - GET /admin/quiz-summary');

// POST /admin/quiz - Create new quiz with full structure
// Protected: Requires authentication (user or admin can create quizzes)
router.post('/admin/quiz', authenticate, async (req: AuthRequest, res: Response) => {
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
      // Validate interaction_type (required for all)
      if (!question.interaction_type) {
        return res.status(400).json({
          success: false,
          message: 'Each question must have interaction_type'
        });
      }

      // Validate question_text (required for all except info_screen)
      if (question.interaction_type !== 'info_screen' && (!question.question_text || question.question_text.trim().length === 0)) {
        return res.status(400).json({
          success: false,
          message: 'Each question must have question_text (except info_screen)'
        });
      }

      // Helper for question label in error messages
      const questionLabel = question.question_text || `Question (${question.interaction_type})`;

      // Validate question image URL if provided
      if (question.image_url && !cloudinaryService.isValidCloudinaryUrl(question.image_url)) {
        return res.status(400).json({
          success: false,
          message: `Invalid image_url format for question "${questionLabel}". Must be a valid Cloudinary URL.`
        });
      }

      // Options validation (skip for fake_loader, info_screen, result_page, and timeline_projection)
      if (question.interaction_type !== 'fake_loader' && question.interaction_type !== 'info_screen' && question.interaction_type !== 'result_page' && question.interaction_type !== 'timeline_projection') {
        if (!question.options || !Array.isArray(question.options)) {
          return res.status(400).json({
            success: false,
            message: `Question "${questionLabel}" must have an options array`
          });
        }

        // Validate options structure
        for (const option of question.options) {
        if (!option.option_text) {
          return res.status(400).json({
            success: false,
            message: 'Each option must have option_text'
          });
        }
        
        // Auto-generate associated_value if not provided (deprecated field)
        if (!option.associated_value || option.associated_value.trim() === '') {
          option.associated_value = option.option_text
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '_')
            .replace(/[^a-z0-9_]/g, '');
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

      // Validate timeline_projection_config if interaction_type is timeline_projection
      if (question.interaction_type === 'timeline_projection') {
        if (!question.timeline_projection_config) {
          return res.status(400).json({
            success: false,
            message: `Question "${questionLabel}" must have timeline_projection_config`
          });
        }

        const config = question.timeline_projection_config;
        if (config.direction !== 'ascendent' && config.direction !== 'descendent') {
          return res.status(400).json({
            success: false,
            message: `Question "${questionLabel}": timeline_projection_config.direction must be "ascendent" or "descendent"`
          });
        }

        if (typeof config.months_count !== 'number' || config.months_count < 1 || config.months_count > 60) {
          return res.status(400).json({
            success: false,
            message: `Question "${questionLabel}": timeline_projection_config.months_count must be a number between 1 and 60`
          });
        }
      }
    }

    // Get user info from authenticated request
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const result = await quizCreationService.createQuiz(data, req.user.userId);
    res.status(201).json(result);

  } catch (error: any) {
    console.error('❌ Error creating quiz:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create quiz. Transaction rolled back.'
    });
  }
});

// PUT /admin/quiz/:quizId - Update existing quiz with full structure
// Protected: Requires authentication (user can update own quizzes, admin can update any)
router.put('/admin/quiz/:quizId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { quizId } = req.params;
    const data: QuizCreationRequest = req.body;

    // Validate quiz ID
    if (!quizId || isNaN(parseInt(quizId))) {
      return res.status(400).json({
        success: false,
        message: 'Valid quiz ID is required'
      });
    }

    // Validate required fields
    if (!data.quiz_name || !data.product_page_url || !data.questions || !Array.isArray(data.questions)) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: quiz_name, product_page_url, and questions array are required'
      });
    }

    // Validate at least one question
    if (data.questions.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Quiz must have at least one question'
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
      // Validate interaction_type (required for all)
      if (!question.interaction_type) {
        return res.status(400).json({
          success: false,
          message: 'Each question must have interaction_type'
        });
      }

      // Validate question_text (required for all except info_screen)
      if (question.interaction_type !== 'info_screen' && (!question.question_text || question.question_text.trim().length === 0)) {
        return res.status(400).json({
          success: false,
          message: 'Each question must have question_text (except info_screen)'
        });
      }

      // Helper for question label in error messages
      const questionLabel = question.question_text || `Question (${question.interaction_type})`;

      // Validate question image URL if provided
      if (question.image_url && !cloudinaryService.isValidCloudinaryUrl(question.image_url)) {
        return res.status(400).json({
          success: false,
          message: `Invalid image_url format for question "${questionLabel}". Must be a valid Cloudinary URL.`
        });
      }

      // Options validation (skip for fake_loader, info_screen, result_page, and timeline_projection)
      if (question.interaction_type !== 'fake_loader' && question.interaction_type !== 'info_screen' && question.interaction_type !== 'result_page' && question.interaction_type !== 'timeline_projection') {
        if (!question.options || !Array.isArray(question.options)) {
          return res.status(400).json({
            success: false,
            message: `Question "${questionLabel}" must have an options array`
          });
        }

        // Validate options structure
        for (const option of question.options) {
          if (!option.option_text) {
            return res.status(400).json({
              success: false,
              message: 'Each option must have option_text'
            });
          }
          
          // Auto-generate associated_value if not provided (deprecated field)
          if (!option.associated_value || option.associated_value.trim() === '') {
            option.associated_value = option.option_text
              .toLowerCase()
              .trim()
              .replace(/\s+/g, '_')
              .replace(/[^a-z0-9_]/g, '');
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

      // Validate timeline_projection_config if interaction_type is timeline_projection
      if (question.interaction_type === 'timeline_projection') {
        if (!question.timeline_projection_config) {
          return res.status(400).json({
            success: false,
            message: `Question "${questionLabel}" must have timeline_projection_config`
          });
        }

        const config = question.timeline_projection_config;
        if (config.direction !== 'ascendent' && config.direction !== 'descendent') {
          return res.status(400).json({
            success: false,
            message: `Question "${questionLabel}": timeline_projection_config.direction must be "ascendent" or "descendent"`
          });
        }

        if (typeof config.months_count !== 'number' || config.months_count < 1 || config.months_count > 60) {
          return res.status(400).json({
            success: false,
            message: `Question "${questionLabel}": timeline_projection_config.months_count must be a number between 1 and 60`
          });
        }
      }
    }

    // Get user info from authenticated request
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const result = await quizCreationService.updateQuiz(
      parseInt(quizId), 
      data, 
      req.user.userId, 
      req.user.role
    );
    res.status(200).json(result);

  } catch (error: any) {
    console.error('❌ Error updating quiz:', error);
    
    if (error.message === 'Quiz not found') {
      return res.status(404).json({
        success: false,
        message: 'Quiz not found'
      });
    }

    // Handle authorization errors
    if (error.message.includes('Unauthorized')) {
      return res.status(403).json({
        success: false,
        message: error.message
      });
    }

    // Handle validation errors
    if (error.message.includes('Duplicate sequence_order') || 
        error.message.includes('at least one active question') ||
        error.message.includes('Cannot restore question')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update quiz. Transaction rolled back.'
    });
  }
});

// GET /admin/quiz/:quizId - Get quiz data for editing
// Protected: Requires authentication (user can view own quizzes, admin can view any)
router.get('/admin/quiz/:quizId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { quizId } = req.params;

    // Validate quiz ID
    if (!quizId || isNaN(parseInt(quizId))) {
      return res.status(400).json({
        success: false,
        message: 'Valid quiz ID is required'
      });
    }

    // Get user info from authenticated request
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const quizData = await quizCreationService.getQuizForEditing(
      parseInt(quizId), 
      req.user.userId, 
      req.user.role
    );
    
    res.status(200).json({
      success: true,
      data: quizData
    });

  } catch (error: any) {
    console.error('❌ Error fetching quiz for editing:', error);
    
    if (error.message === 'Quiz not found') {
      return res.status(404).json({
        success: false,
        message: 'Quiz not found'
      });
    }

    // Handle authorization errors
    if (error.message.includes('Unauthorized')) {
      return res.status(403).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch quiz data for editing'
    });
  }
});

// GET /admin/quiz-summary - Get summary metrics for quizzes
// Protected: Requires authentication (user sees own quizzes, admin can see all or own)
// Query params: ?viewMode=all|my (admin only, defaults to 'all' for admin, 'my' for users)
router.get('/admin/quiz-summary', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    // Get user info from authenticated request
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const viewMode = req.query.viewMode as string || 'all';
    
    // For regular users, always use 'my' (ignore query param for security)
    const effectiveViewMode = req.user.role === 'admin' ? viewMode : 'my';
    const showAll = req.user.role === 'admin' && effectiveViewMode === 'all';

    console.log(`📊 Fetching quiz summary metrics for user ${req.user.userId} (viewMode: ${effectiveViewMode})...`);
    
    const summaryMetrics = await adminService.getQuizSummaryMetrics(
      req.user.userId, 
      req.user.role,
      showAll
    );
    
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
