"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const AnalyticsService_1 = require("../services/AnalyticsService");
const db_1 = __importDefault(require("../config/db"));
const router = (0, express_1.Router)();
const analyticsService = new AnalyticsService_1.AnalyticsService(db_1.default);
// Debug: Log route definitions
console.log('🔧 Defining analytics routes:');
console.log('  - GET /analytics/drop-rate/:quizId');
console.log('  - GET /analytics/utm-performance/:quizId');
// GET /analytics/drop-rate/:quizId
router.get('/analytics/drop-rate/:quizId', async (req, res) => {
    try {
        const { quizId } = req.params;
        // Validate quiz ID
        if (!quizId || isNaN(parseInt(quizId))) {
            return res.status(400).json({
                success: false,
                message: 'Valid quiz ID is required'
            });
        }
        const result = await analyticsService.getDropRateAnalytics(quizId);
        res.status(200).json({
            success: true,
            data: result
        });
    }
    catch (error) {
        console.error('❌ Error fetching drop rate analytics:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
});
// GET /analytics/utm-performance/:quizId
router.get('/analytics/utm-performance/:quizId', async (req, res) => {
    try {
        const { quizId } = req.params;
        // Validate quiz ID
        if (!quizId || isNaN(parseInt(quizId))) {
            return res.status(400).json({
                success: false,
                message: 'Valid quiz ID is required'
            });
        }
        const result = await analyticsService.getUTMPerformanceAnalytics(quizId);
        res.status(200).json({
            success: true,
            data: result
        });
    }
    catch (error) {
        console.error('❌ Error fetching UTM performance analytics:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
});
exports.default = router;
//# sourceMappingURL=analytics.js.map