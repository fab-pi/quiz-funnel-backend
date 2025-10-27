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
        // Insert test questions
        const questions = [
            {
                question_id: 1,
                sequence_order: 1,
                question_text: 'What is your primary fitness goal?',
                interaction_type: 'single_choice'
            },
            {
                question_id: 2,
                sequence_order: 2,
                question_text: 'How many days per week do you exercise?',
                interaction_type: 'single_choice'
            }
        ];
        for (const question of questions) {
            await db_1.default.query('INSERT INTO questions (question_id, quiz_id, sequence_order, question_text, interaction_type) VALUES ($1, $2, $3, $4, $5)', [question.question_id, quizId, question.sequence_order, question.question_text, question.interaction_type]);
            console.log(`✓ Inserted question: ${question.question_id}`);
        }
        // Insert test answer options
        const answerOptions = [
            { option_id: 1, question_id: 1, option_text: 'Weight Loss', associated_value: 'weight_loss' },
            { option_id: 2, question_id: 1, option_text: 'Muscle Building', associated_value: 'muscle_building' },
            { option_id: 3, question_id: 2, option_text: '0-2 days', associated_value: '0_2_days' },
            { option_id: 4, question_id: 2, option_text: '3-5 days', associated_value: '3_5_days' }
        ];
        for (const option of answerOptions) {
            await db_1.default.query('INSERT INTO answer_options (option_id, question_id, option_text, associated_value) VALUES ($1, $2, $3, $4)', [option.option_id, option.question_id, option.option_text, option.associated_value]);
            console.log(`✓ Inserted answer option: ${option.option_id}`);
        }
        console.log('✅ Database seeding completed successfully!');
        console.log('📊 Summary:');
        console.log('  - 1 quiz inserted (Test Setup Quiz)');
        console.log('  - 2 questions inserted');
        console.log('  - 4 answer options inserted');
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