"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const QuizContentService_1 = require("../services/QuizContentService");
const db_1 = __importDefault(require("../config/db"));
const router = (0, express_1.Router)();
const quizContentService = new QuizContentService_1.QuizContentService(db_1.default);
// Debug: Log route definitions
console.log('🔧 Defining content routes:');
console.log('  - GET /content/quiz/:quizId');
// GET /content/quiz/:quizId
router.get('/content/quiz/:quizId', async (req, res) => {
    try {
        const { quizId } = req.params;
        // Validate quiz ID
        if (!quizId || isNaN(parseInt(quizId))) {
            return res.status(400).json({
                success: false,
                message: 'Valid quiz ID is required'
            });
        }
        const result = await quizContentService.getQuizContent(quizId);
        res.status(200).json({
            success: true,
            data: result
        });
    }
    catch (error) {
        console.error('❌ Error fetching quiz content:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
});
exports.default = router;
//# sourceMappingURL=content.js.map