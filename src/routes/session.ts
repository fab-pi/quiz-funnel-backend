import { Router, Request, Response } from 'express';
import { SessionService } from '../services/SessionService';
import pool from '../config/db';
import { SessionStartRequest, SessionUpdateRequest, AnswerSubmissionRequest } from '../types';

const router = Router();
const sessionService = new SessionService(pool);

// Debug: Log route definitions
console.log('🔧 Defining session routes:');
console.log('  - POST /session/start');
console.log('  - POST /session/update');
console.log('  - POST /session/answers');
console.log('  - POST /session/complete');
console.log('  - GET /session/:sessionId/utms');

// POST /session/start
router.post('/session/start', async (req: Request, res: Response) => {
  try {
    const data: SessionStartRequest = req.body;

    // Validate required fields
    if (!data.quiz_id) {
      return res.status(400).json({
        success: false,
        message: 'quiz_id is required'
      });
    }

    const result = await sessionService.startSession(data, req);
    res.status(200).json(result);

  } catch (error: any) {
    console.error('❌ Error in session start:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
});

// POST /session/update
router.post('/session/update', async (req: Request, res: Response) => {
  try {
    const data: SessionUpdateRequest = req.body;

    // Validate required fields
    if (!data.sessionId || !data.lastQuestionId) {
      return res.status(400).json({
        success: false,
        message: 'sessionId and lastQuestionId are required'
      });
    }

    const result = await sessionService.updateSession(data);
    res.status(200).json(result);

  } catch (error: any) {
    console.error('❌ Error in session update:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
});

// POST /session/answers
router.post('/session/answers', async (req: Request, res: Response) => {
  try {
    const data: AnswerSubmissionRequest = req.body;

    // Validate required fields
    if (!data.sessionId || !data.questionId || !data.selectedOptionId) {
      return res.status(400).json({
        success: false,
        message: 'sessionId, questionId, and selectedOptionId are required'
      });
    }

    const result = await sessionService.submitAnswer(data, req);
    res.status(201).json(result);

  } catch (error: any) {
    console.error('❌ Error in answer submission:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
});

// POST /session/complete
router.post('/session/complete', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;

    // Validate required fields
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'sessionId is required'
      });
    }

    const result = await sessionService.completeSession(sessionId, req);
    res.status(200).json(result);

  } catch (error: any) {
    console.error('❌ Error in session completion:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
});

// GET /session/:sessionId/utms
router.get('/session/:sessionId/utms', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    // Validate required fields
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'sessionId is required'
      });
    }

    const utmParams = await sessionService.getSessionUTMParams(sessionId);

    if (utmParams === null) {
      return res.status(200).json({
        success: true,
        data: null,
        message: 'No UTM parameters found for this session'
      });
    }

    res.status(200).json({
      success: true,
      data: utmParams,
      message: 'UTM parameters retrieved successfully'
    });

  } catch (error: any) {
    console.error('❌ Error fetching UTM params:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
});

export default router;