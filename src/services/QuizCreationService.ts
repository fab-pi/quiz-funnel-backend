import { Pool } from 'pg';
import { BaseService } from './BaseService';
import { QuizCreationRequest, QuizCreationResponse } from '../types';

export class QuizCreationService extends BaseService {
  constructor(pool: Pool) {
    super(pool);
  }

  /**
   * Create a new quiz with full structure
   */
  async createQuiz(data: QuizCreationRequest): Promise<QuizCreationResponse> {
    const client = await this.pool.connect();
    
    try {
      // Start transaction
      await client.query('BEGIN');

      console.log('🔄 Starting quiz creation transaction...');

      // Insert quiz
      const quizResult = await client.query(`
        INSERT INTO quizzes (
          quiz_name, 
          product_page_url, 
          is_active, 
          brand_logo_url, 
          color_primary, 
          color_secondary, 
          color_text_default, 
          color_text_hover,
          creation_date
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING quiz_id
      `, [
        data.quiz_name,
        data.product_page_url,
        data.is_active,
        data.brand_logo_url || null,
        data.color_primary,
        data.color_secondary,
        data.color_text_default,
        data.color_text_hover,
        new Date()
      ]);

      const quizId = quizResult.rows[0].quiz_id;
      console.log(`✅ Quiz created with ID: ${quizId}`);

      // Generate and update quiz_start_url
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const quizStartUrl = `${frontendUrl}/quiz/${quizId}`;
      
      await client.query(`
        UPDATE quizzes 
        SET quiz_start_url = $1 
        WHERE quiz_id = $2
      `, [quizStartUrl, quizId]);
      console.log(`✅ Quiz start URL generated: ${quizStartUrl}`);

      // Insert questions and options
      const createdQuestions = [];

      for (const question of data.questions) {
        // Insert question
        const questionResult = await client.query(`
          INSERT INTO questions (
            quiz_id, 
            sequence_order, 
            question_text, 
            interaction_type, 
            image_url,
            instructions_text,
            loader_text,
            popup_question
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING question_id
        `, [
          quizId,
          question.sequence_order,
          question.question_text,
          question.interaction_type,
          question.image_url || null,
          question.instructions_text || null,
          question.loader_text || null,
          question.popup_question || null
        ]);

        const questionId = questionResult.rows[0].question_id;
        console.log(`✅ Question created with ID: ${questionId}`);

        // Insert options
        const createdOptions = [];
        for (const option of question.options) {
          const optionResult = await client.query(`
            INSERT INTO answer_options (
              question_id, 
              option_text, 
              associated_value, 
              option_image_url
            ) VALUES ($1, $2, $3, $4)
            RETURNING option_id
          `, [
            questionId,
            option.option_text,
            option.associated_value,
            option.option_image_url || null
          ]);

          const optionId = optionResult.rows[0].option_id;
          createdOptions.push({
            option_id: optionId,
            option_text: option.option_text,
            associated_value: option.associated_value,
            option_image_url: option.option_image_url
          });
        }

        createdQuestions.push({
          question_id: questionId,
          sequence_order: question.sequence_order,
          question_text: question.question_text,
          interaction_type: question.interaction_type,
          image_url: question.image_url,
          options: createdOptions
        });
      }

      // Commit transaction
      await client.query('COMMIT');
      console.log(`✅ Quiz creation transaction completed successfully for quiz ID: ${quizId}`);

      return {
        success: true,
        message: 'Quiz created successfully',
        data: {
          quiz_id: quizId,
          created_quiz: {
            quiz_id: quizId,
            quiz_name: data.quiz_name,
            product_page_url: data.product_page_url,
            is_active: data.is_active,
            brand_logo_url: data.brand_logo_url,
            color_primary: data.color_primary,
            color_secondary: data.color_secondary,
            color_text_default: data.color_text_default,
            color_text_hover: data.color_text_hover,
            questions: createdQuestions
          }
        }
      };

    } catch (error) {
      // Rollback transaction on error
      await client.query('ROLLBACK');
      console.error('❌ Error creating quiz, transaction rolled back:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}
