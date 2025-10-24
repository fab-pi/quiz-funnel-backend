"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = __importDefault(require("../config/db"));
const router = (0, express_1.Router)();
// POST /session/start
router.post('/start', async (req, res) => {
    try {
        const { quiz_id, utm_source, utm_campaign, utm_medium, utm_term, utm_content } = req.body;
        // Validate required fields
        if (!quiz_id) {
            return res.status(400).json({
                success: false,
                message: 'quiz_id is required'
            });
        }
        // Verify quiz exists
        const quizCheck = await db_1.default.query('SELECT quiz_id FROM quizzes WHERE quiz_id = $1', [parseInt(quiz_id)]);
        if (quizCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Quiz not found'
            });
        }
        // Generate session ID (using smaller number to fit in integer)
        const sessionId = Math.floor(Math.random() * 1000000) + 1000;
        // Insert new session
        const result = await db_1.default.query(`INSERT INTO user_sessions 
       (session_id, quiz_id, start_timestamp, last_question_viewed, is_completed, utm_source, utm_medium, utm_campaign)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING session_id`, [sessionId, parseInt(quiz_id), new Date(), 1, false, utm_source, utm_medium, utm_campaign]);
        const response = {
            session_id: result.rows[0].session_id,
            success: true,
            message: 'Session started successfully'
        };
        console.log(`✅ New session started: ${sessionId} for quiz: ${quiz_id}`);
        res.status(201).json(response);
    }
    catch (error) {
        console.error('❌ Error starting session:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});
exports.default = router;
//# sourceMappingURL=session.js.map