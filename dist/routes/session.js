"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const QuizService_1 = require("../services/QuizService");
const db_1 = __importDefault(require("../config/db"));
const router = (0, express_1.Router)();
const quizService = new QuizService_1.QuizService(db_1.default);
// Debug: Log route definitions
console.log('🔧 Defining session routes:');
console.log('  - POST /session/start');
console.log('  - POST /session/update');
console.log('  - POST /session/answers');
console.log('  - POST /session/complete');
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
        const result = await quizService.startSession(data);
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
        const result = await quizService.updateSession(data);
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
        const result = await quizService.submitAnswer(data);
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
        const result = await quizService.completeSession(sessionId);
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
exports.default = router;
//# sourceMappingURL=session.js.map