"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const QuizCreationService_1 = require("../services/QuizCreationService");
const AdminService_1 = require("../services/AdminService");
const CloudinaryService_1 = require("../services/CloudinaryService");
const db_1 = __importDefault(require("../config/db"));
const router = (0, express_1.Router)();
const quizCreationService = new QuizCreationService_1.QuizCreationService(db_1.default);
const adminService = new AdminService_1.AdminService(db_1.default);
const cloudinaryService = new CloudinaryService_1.CloudinaryService();
// Debug: Log route definitions
console.log('🔧 Defining admin routes:');
console.log('  - POST /admin/quiz');
console.log('  - GET /admin/quiz-summary');
// POST /admin/quiz - Create new quiz with full structure
router.post('/admin/quiz', async (req, res) => {
    try {
        const data = req.body;
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
        const result = await quizCreationService.createQuiz(data);
        res.status(201).json(result);
    }
    catch (error) {
        console.error('❌ Error creating quiz:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to create quiz. Transaction rolled back.'
        });
    }
});
// GET /admin/quiz-summary - Get summary metrics for all quizzes
router.get('/admin/quiz-summary', async (req, res) => {
    try {
        console.log('📊 Fetching quiz summary metrics...');
        const summaryMetrics = await adminService.getQuizSummaryMetrics();
        res.json({
            success: true,
            data: summaryMetrics
        });
    }
    catch (error) {
        console.error('❌ Error fetching quiz summary metrics:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch quiz summary metrics'
        });
    }
});
exports.default = router;
//# sourceMappingURL=admin.js.map