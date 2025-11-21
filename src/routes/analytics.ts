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

// GET /analytics/drop-rate/:quizId?includeArchived=true
// Protected: Requires authentication (user can view own quiz analytics, admin can view any)
router.get('/analytics/drop-rate/:quizId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { quizId } = req.params;
    const includeArchived = req.query.includeArchived === 'true';

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
      req.user.role
    );
    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error: any) {
    console.error('❌ Error fetching drop rate analytics:', error);
    
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
  }
});

// GET /analytics/utm-performance/:quizId
// Protected: Requires authentication (user can view own quiz analytics, admin can view any)
router.get('/analytics/utm-performance/:quizId', authenticate, async (req: AuthRequest, res: Response) => {
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

    const result = await analyticsService.getUTMPerformanceAnalytics(
      quizId,
      req.user.userId,
      req.user.role
    );
    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error: any) {
    console.error('❌ Error fetching UTM performance analytics:', error);
    
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
  }
});

export default router;
