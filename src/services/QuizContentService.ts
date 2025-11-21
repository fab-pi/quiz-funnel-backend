import { Pool } from 'pg';
import { BaseService } from './BaseService';

export class QuizContentService extends BaseService {
  constructor(pool: Pool) {
    super(pool);
  }

  /**
   * Get quiz content
   */
  async getQuizContent(quizId: string): Promise<any> {
    const client = await this.pool.connect();
    
    try {
      // Get quiz info
      const quizResult = await client.query(
        'SELECT quiz_id, quiz_name, product_page_url, is_active, brand_logo_url, color_primary, color_secondary, color_text_default, color_text_hover FROM quizzes WHERE quiz_id = $1',
        [parseInt(quizId)]
      );

      if (quizResult.rows.length === 0) {
        throw new Error('Quiz not found');
      }

      const quiz = quizResult.rows[0];

      if (!quiz.is_active) {
        throw new Error('Quiz is not active');
      }

      // Get questions and options (only active, not archived)
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
          q.loader_bars,
          q.result_page_config,
          q.timeline_projection_config,
          q.educational_box_title,
          q.educational_box_text,
          ao.option_id,
          ao.option_text,
          ao.associated_value,
          ao.option_image_url
        FROM questions q
        LEFT JOIN answer_options ao ON q.question_id = ao.question_id
          AND (ao.is_archived = false OR ao.is_archived IS NULL)
        WHERE q.quiz_id = $1
          AND (q.is_archived = false OR q.is_archived IS NULL)
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
            loader_bars: row.loader_bars,
            result_page_config: row.result_page_config,
            timeline_projection_config: row.timeline_projection_config,
            educational_box_title: row.educational_box_title,
            educational_box_text: row.educational_box_text,
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

    } catch (error) {
      console.error('❌ Error fetching quiz content:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get quiz ID by custom domain
   * @param domain - Custom domain to look up
   * @returns Quiz ID if found, null otherwise
   */
  async getQuizByDomain(domain: string): Promise<number | null> {
    const client = await this.pool.connect();
    
    try {
      // Normalize domain (lowercase, trim)
      const normalizedDomain = domain.toLowerCase().trim();
      
      const result = await client.query(
        'SELECT quiz_id FROM quizzes WHERE custom_domain = $1 AND is_active = true',
        [normalizedDomain]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0].quiz_id;
    } catch (error) {
      console.error('❌ Error fetching quiz by domain:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}
