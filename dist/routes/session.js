"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const SessionService_1 = require("../services/SessionService");
const db_1 = __importDefault(require("../config/db"));
const router = (0, express_1.Router)();
const sessionService = new SessionService_1.SessionService(db_1.default);
// Debug: Log route definitions
console.log('🔧 Defining session routes:');
console.log('  - POST /session/start');
console.log('  - POST /session/update');
console.log('  - POST /session/answers');
console.log('  - POST /session/complete');
console.log('  - GET /session/:sessionId/utms');
// POST /session/start
router.post('/session/start', async (req, res) => {
    try {
        const data = req.body;
        // Validate required fields
        if (!data.quiz_id) {
            return res.status(400).json({
                success: false,
                message: 'quiz_id is required'
            });
        }
        const result = await sessionService.startSession(data);
        res.status(200).json(result);
    }
    catch (error) {
        console.error('❌ Error in session start:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
});
// POST /session/update
router.post('/session/update', async (req, res) => {
    try {
        const data = req.body;
        // Validate required fields
        if (!data.sessionId || !data.lastQuestionId) {
            return res.status(400).json({
                success: false,
                message: 'sessionId and lastQuestionId are required'
            });
        }
        const result = await sessionService.updateSession(data);
        res.status(200).json(result);
    }
    catch (error) {
        console.error('❌ Error in session update:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
});
// POST /session/answers
router.post('/session/answers', async (req, res) => {
    try {
        const data = req.body;
        // Validate required fields
        if (!data.sessionId || !data.questionId || !data.selectedOptionId) {
            return res.status(400).json({
                success: false,
                message: 'sessionId, questionId, and selectedOptionId are required'
            });
        }
        const result = await sessionService.submitAnswer(data);
        res.status(201).json(result);
    }
    catch (error) {
        console.error('❌ Error in answer submission:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
});
// POST /session/complete
router.post('/session/complete', async (req, res) => {
    try {
        const { sessionId } = req.body;
        // Validate required fields
        if (!sessionId) {
            return res.status(400).json({
                success: false,
                message: 'sessionId is required'
            });
        }
        const result = await sessionService.completeSession(sessionId);
        res.status(200).json(result);
    }
    catch (error) {
        console.error('❌ Error in session completion:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
});
// GET /session/:sessionId/utms
router.get('/session/:sessionId/utms', async (req, res) => {
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
    }
    catch (error) {
        console.error('❌ Error fetching UTM params:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
});
exports.default = router;
//# sourceMappingURL=session.js.map