import { Router, Response } from 'express';
import { AnalyticsService } from '../services/AnalyticsService';
import pool from '../config/db';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
const analyticsService = new AnalyticsService(pool);

// Debug: Log route definitions
console.log('🔧 Defining analytics routes:');
console.log('  - GET /analytics/drop-rate/:quizId');
console.log('  - GET /analytics/utm-performance/:quizId');
console.log('  - GET /analytics/quiz-stats/:quizId');
console.log('  - GET /analytics/question-details/:quizId');
console.log('  - GET /analytics/answer-distribution/:quizId/:questionId');
console.log('  - GET /analytics/daily-activity/:quizId');

// Helper function to parse date from query string
const parseDate = (dateString: string | undefined): Date | undefined => {
  if (!dateString) return undefined;
  const date = new Date(dateString);
  return isNaN(date.getTime()) ? undefined : date;
};

// Helper function to handle analytics route errors
const handleAnalyticsError = (error: any, res: Response) => {
  console.error('❌ Analytics error:', error);
  
  if (error.message === 'Quiz not found') {
    return res.status(404).json({
      success: false,
      message: 'Quiz not found'
    });
  }

  if (error.message.includes('Unauthorized')) {
    return res.status(403).json({
      success: false,
      message: error.message
    });
  }

  res.status(500).json({
    success: false,
    message: error.message || 'Internal server error'
  });
};

// GET /analytics/drop-rate/:quizId?includeArchived=true&startDate=2024-01-01&endDate=2024-01-31
// Protected: Requires authentication (user can view own quiz analytics, admin can view any)
router.get('/analytics/drop-rate/:quizId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { quizId } = req.params;
    const includeArchived = req.query.includeArchived === 'true';
    const startDate = parseDate(req.query.startDate as string);
    const endDate = parseDate(req.query.endDate as string);

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

    const result = await analyticsService.getDropRateAnalytics(
      quizId, 
      includeArchived,
      req.user.userId,
      req.user.role,
      startDate,
      endDate
    );
    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error: any) {
    handleAnalyticsError(error, res);
  }
});

// GET /analytics/utm-performance/:quizId?startDate=2024-01-01&endDate=2024-01-31
// Protected: Requires authentication (user can view own quiz analytics, admin can view any)
router.get('/analytics/utm-performance/:quizId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { quizId } = req.params;
    const startDate = parseDate(req.query.startDate as string);
    const endDate = parseDate(req.query.endDate as string);

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

    const result = await analyticsService.getUTMPerformanceAnalytics(
      quizId,
      req.user.userId,
      req.user.role,
      startDate,
      endDate
    );
    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error: any) {
    handleAnalyticsError(error, res);
  }
});

// GET /analytics/quiz-stats/:quizId?startDate=2024-01-01&endDate=2024-01-31
// Protected: Requires authentication (user can view own quiz analytics, admin can view any)
router.get('/analytics/quiz-stats/:quizId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { quizId } = req.params;
    const startDate = parseDate(req.query.startDate as string);
    const endDate = parseDate(req.query.endDate as string);

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

    const result = await analyticsService.getQuizStats(
      quizId,
      req.user.userId,
      req.user.role,
      startDate,
      endDate
    );
    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error: any) {
    handleAnalyticsError(error, res);
  }
});

// GET /analytics/question-details/:quizId?startDate=2024-01-01&endDate=2024-01-31
// Protected: Requires authentication (user can view own quiz analytics, admin can view any)
router.get('/analytics/question-details/:quizId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { quizId } = req.params;
    const startDate = parseDate(req.query.startDate as string);
    const endDate = parseDate(req.query.endDate as string);

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

    const result = await analyticsService.getQuestionDetails(
      quizId,
      req.user.userId,
      req.user.role,
      startDate,
      endDate
    );
    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error: any) {
    handleAnalyticsError(error, res);
  }
});

// GET /analytics/answer-distribution/:quizId/:questionId?startDate=2024-01-01&endDate=2024-01-31
// Protected: Requires authentication (user can view own quiz analytics, admin can view any)
router.get('/analytics/answer-distribution/:quizId/:questionId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { quizId, questionId } = req.params;
    const startDate = parseDate(req.query.startDate as string);
    const endDate = parseDate(req.query.endDate as string);

    // Validate quiz ID and question ID
    if (!quizId || isNaN(parseInt(quizId))) {
      return res.status(400).json({
        success: false,
        message: 'Valid quiz ID is required'
      });
    }

    if (!questionId || isNaN(parseInt(questionId))) {
      return res.status(400).json({
        success: false,
        message: 'Valid question ID is required'
      });
    }

    // Get user info from authenticated request
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const result = await analyticsService.getAnswerDistribution(
      quizId,
      questionId,
      req.user.userId,
      req.user.role,
      startDate,
      endDate
    );
    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error: any) {
    handleAnalyticsError(error, res);
  }
});

// GET /analytics/daily-activity/:quizId?startDate=2024-01-01&endDate=2024-01-31&days=30
// Protected: Requires authentication (user can view own quiz analytics, admin can view any)
router.get('/analytics/daily-activity/:quizId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { quizId } = req.params;
    const startDate = parseDate(req.query.startDate as string);
    const endDate = parseDate(req.query.endDate as string);
    const days = req.query.days ? parseInt(req.query.days as string) : 30;

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

    const result = await analyticsService.getDailyActivity(
      quizId,
      req.user.userId,
      req.user.role,
      startDate,
      endDate,
      days
    );
    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error: any) {
    handleAnalyticsError(error, res);
  }
});

export default router;
