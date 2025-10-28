"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuizContentService = void 0;
const BaseService_1 = require("./BaseService");
class QuizContentService extends BaseService_1.BaseService {
    constructor(pool) {
        super(pool);
    }
    /**
     * Get quiz content
     */
    async getQuizContent(quizId) {
        const client = await this.pool.connect();
        try {
            // Get quiz info
            const quizResult = await client.query('SELECT quiz_id, quiz_name, product_page_url, is_active, brand_logo_url, color_primary, color_secondary, color_text_default, color_text_hover FROM quizzes WHERE quiz_id = $1', [parseInt(quizId)]);
            if (quizResult.rows.length === 0) {
                throw new Error('Quiz not found');
            }
            const quiz = quizResult.rows[0];
            if (!quiz.is_active) {
                throw new Error('Quiz is not active');
            }
            // Get questions and options
            const questionsResult = await client.query(`
        SELECT 
          q.question_id,
          q.sequence_order,
          q.question_text,
          q.interaction_type,
          q.image_url,
          q.instructions_text,
          q.loader_text,
          q.popup_question,
          ao.option_id,
          ao.option_text,
          ao.associated_value,
          ao.option_image_url
        FROM questions q
        LEFT JOIN answer_options ao ON q.question_id = ao.question_id
        WHERE q.quiz_id = $1
        ORDER BY q.sequence_order, ao.option_id
      `, [parseInt(quizId)]);
            // Group questions and options
            const questionsMap = new Map();
            questionsResult.rows.forEach(row => {
                if (!questionsMap.has(row.question_id)) {
                    questionsMap.set(row.question_id, {
                        question_id: row.question_id,
                        sequence_order: row.sequence_order,
                        question_text: row.question_text,
                        interaction_type: row.interaction_type,
                        image_url: row.image_url,
                        instructions_text: row.instructions_text,
                        loader_text: row.loader_text,
                        popup_question: row.popup_question,
                        options: []
                    });
                }
                if (row.option_id) {
                    questionsMap.get(row.question_id).options.push({
                        option_id: row.option_id,
                        option_text: row.option_text,
                        associated_value: row.associated_value,
                        option_image_url: row.option_image_url
                    });
                }
            });
            const questions = Array.from(questionsMap.values());
            console.log(`✅ Quiz content fetched for quiz ${quizId}: ${questions.length} questions`);
            return {
                quiz_id: quiz.quiz_id,
                quiz_name: quiz.quiz_name,
                product_page_url: quiz.product_page_url,
                brand_logo_url: quiz.brand_logo_url,
                color_primary: quiz.color_primary,
                color_secondary: quiz.color_secondary,
                color_text_default: quiz.color_text_default,
                color_text_hover: quiz.color_text_hover,
                questions
            };
        }
        catch (error) {
            console.error('❌ Error fetching quiz content:', error);
            throw error;
        }
        finally {
            client.release();
        }
    }
}
exports.QuizContentService = QuizContentService;
//# sourceMappingURL=QuizContentService.js.map