"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = __importDefault(require("../config/db"));
const seedData = async () => {
    try {
        console.log('Starting database seeding...');
        // Clear existing data (in reverse order of dependencies)
        await db_1.default.query('DELETE FROM user_answers');
        await db_1.default.query('DELETE FROM user_sessions');
        await db_1.default.query('DELETE FROM answer_options');
        await db_1.default.query('DELETE FROM questions');
        await db_1.default.query('DELETE FROM quizzes');
        // Insert minimal test quiz data
        const quizResult = await db_1.default.query('INSERT INTO quizzes (quiz_id, quiz_name, product_page_url, creation_date, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING quiz_id', [1, 'Test Setup Quiz', 'http://test-funnelish-redirect.com', new Date(), true]);
        const quizId = quizResult.rows[0].quiz_id;
        console.log('✓ Inserted quiz:', quizId);
        console.log('✅ Database seeding completed successfully!');
        console.log('📊 Summary:');
        console.log('  - 1 quiz inserted (Test Setup Quiz)');
    }
    catch (error) {
        console.error('❌ Error seeding database:', error);
        throw error;
    }
    finally {
        await db_1.default.end();
    }
};
// Run the seed function
seedData().catch(console.error);
//# sourceMappingURL=seed.js.map