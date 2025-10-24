"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = __importDefault(require("../config/database"));
const testSession = async () => {
    try {
        console.log('Testing session creation...');
        // Test the exact query from the route
        const sessionId = Math.floor(Math.random() * 1000000) + 1000;
        const result = await database_1.default.query(`INSERT INTO user_sessions 
       (session_id, quiz_id, start_timestamp, last_question_viewed, is_completed, utm_source, utm_medium, utm_campaign)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING session_id`, [sessionId, 1, new Date(), 1, false, 'google', 'cpc', 'fitness_quiz']);
        console.log('✅ Session created successfully:', result.rows[0].session_id);
        // Clean up
        await database_1.default.query('DELETE FROM user_sessions WHERE session_id = $1', [result.rows[0].session_id]);
        console.log('✅ Test data cleaned up');
    }
    catch (error) {
        console.error('❌ Error creating session:', error);
    }
    finally {
        await database_1.default.end();
    }
};
testSession().catch(console.error);
//# sourceMappingURL=test-session.js.map