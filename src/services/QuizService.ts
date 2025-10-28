import { Pool } from 'pg';
import { 
  SessionStartRequest, 
  SessionStartResponse, 
  SessionUpdateRequest, 
  SessionUpdateResponse,
  AnswerSubmissionRequest,
  AnswerSubmissionResponse,
  QuizCreationRequest,
  QuizCreationResponse
} from '../types';

export class QuizService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Start a new quiz session
   */
  async startSession(data: SessionStartRequest): Promise<SessionStartResponse> {
    const client = await this.pool.connect();
    
    try {
      const { quiz_id, utm_source, utm_campaign, utm_medium, utm_term, utm_content } = data;

      // Verify quiz exists
      const quizCheck = await client.query(
        'SELECT quiz_id FROM quizzes WHERE quiz_id = $1',
        [parseInt(quiz_id)]
      );

      if (quizCheck.rows.length === 0) {
        throw new Error('Quiz not found');
      }

      // Generate session ID
      const sessionId = Math.floor(Math.random() * 1000000) + 1000;

      // Insert new session
      await client.query(
        `INSERT INTO user_sessions 
         (session_id, quiz_id, start_timestamp, last_question_viewed, is_completed, utm_source, utm_medium, utm_campaign)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          sessionId,
          parseInt(quiz_id),
          new Date(),
          null,
          false,
          utm_source || null,
          utm_medium || null,
          utm_campaign || null
        ]
      );

      console.log(`✅ Session started with ID: ${sessionId}`);

      return {
        session_id: sessionId.toString(),
        success: true,
        message: 'Session started successfully'
      };

    } catch (error) {
      console.error('❌ Error starting session:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update session progress
   */
  async updateSession(data: SessionUpdateRequest): Promise<SessionUpdateResponse> {
    const client = await this.pool.connect();
    
    try {
      const { sessionId, lastQuestionId } = data;

      // Verify session exists
      const sessionCheck = await client.query(
        'SELECT session_id FROM user_sessions WHERE session_id = $1',
        [parseInt(sessionId)]
      );

      if (sessionCheck.rows.length === 0) {
        throw new Error('Session not found');
      }

      // Update session
      await client.query(
        'UPDATE user_sessions SET last_question_viewed = $1 WHERE session_id = $2',
        [parseInt(lastQuestionId), parseInt(sessionId)]
      );

      console.log(`✅ Session ${sessionId} updated to question ${lastQuestionId}`);

      return {
        success: true,
        message: 'Session updated successfully'
      };

    } catch (error) {
      console.error('❌ Error updating session:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Submit an answer
   */
  async submitAnswer(data: AnswerSubmissionRequest): Promise<AnswerSubmissionResponse> {
    const client = await this.pool.connect();
    
    try {
      const { sessionId, questionId, selectedOptionId } = data;

      // Verify session exists
      const sessionCheck = await client.query(
        'SELECT session_id FROM user_sessions WHERE session_id = $1',
        [parseInt(sessionId)]
      );

      if (sessionCheck.rows.length === 0) {
        throw new Error('Session not found');
      }

      // Generate answer ID
      const answerId = Math.floor(Math.random() * 1000000) + 1000;

      // Insert answer
      await client.query(
        `INSERT INTO user_answers (answer_id, session_id, question_id, selected_option_id, answer_timestamp)
         VALUES ($1, $2, $3, $4, $5)`,
        [answerId, parseInt(sessionId), parseInt(questionId), parseInt(selectedOptionId), new Date()]
      );

      console.log(`✅ Answer submitted with ID: ${answerId}`);

      return {
        success: true,
        message: 'Answer submitted successfully'
      };

    } catch (error) {
      console.error('❌ Error submitting answer:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Complete a session
   */
  async completeSession(sessionId: string): Promise<{ success: boolean; message: string }> {
    const client = await this.pool.connect();
    
    try {
      // Verify session exists
      const sessionCheck = await client.query(
        'SELECT session_id FROM user_sessions WHERE session_id = $1',
        [parseInt(sessionId)]
      );

      if (sessionCheck.rows.length === 0) {
        throw new Error('Session not found');
      }

      // Update session to completed
      await client.query(
        'UPDATE user_sessions SET is_completed = true, final_profile = $1 WHERE session_id = $2',
        ['Completed', parseInt(sessionId)]
      );

      console.log(`✅ Session ${sessionId} completed`);

      return {
        success: true,
        message: 'Session completed successfully'
      };

    } catch (error) {
      console.error('❌ Error completing session:', error);
      throw error;
    } finally {
      client.release();
    }
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

    } catch (error) {
      console.error('❌ Error fetching quiz content:', error);
      throw error;
    } finally {
      client.release();
    }
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

  /**
   * Get drop rate analytics
   */
  async getDropRateAnalytics(quizId: string): Promise<any[]> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT 
          q.question_id,
          q.question_text,
          COUNT(us.session_id) as reached_count,
          CASE 
            WHEN COUNT(us.session_id) = 0 THEN 0
            ELSE ROUND(
              (COUNT(us.session_id) - COUNT(ua.answer_id))::numeric / COUNT(us.session_id)::numeric * 100, 
              2
            )
          END as drop_rate_percentage
        FROM questions q
        LEFT JOIN user_sessions us ON us.quiz_id = q.quiz_id 
          AND (us.last_question_viewed >= q.question_id OR us.last_question_viewed IS NULL)
        LEFT JOIN user_answers ua ON ua.session_id = us.session_id 
          AND ua.question_id = q.question_id
        WHERE q.quiz_id = $1
        GROUP BY q.question_id, q.question_text, q.sequence_order
        ORDER BY q.sequence_order
      `, [parseInt(quizId)]);

      console.log(`✅ Drop rate analytics fetched for quiz ${quizId}: ${result.rows.length} questions`);
      return result.rows;

    } catch (error) {
      console.error('❌ Error fetching drop rate analytics:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get UTM performance analytics
   */
  async getUTMPerformanceAnalytics(quizId: string): Promise<any[]> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT 
          COALESCE(utm_source, 'Direct') as utm_source,
          COALESCE(utm_campaign, 'N/A') as utm_campaign,
          COUNT(session_id) as total_sessions,
          ROUND(
            COUNT(CASE WHEN is_completed = true THEN 1 END)::numeric / COUNT(session_id)::numeric * 100, 
            2
          ) as completion_rate
        FROM user_sessions 
        WHERE quiz_id = $1
        GROUP BY utm_source, utm_campaign
        ORDER BY total_sessions DESC
      `, [parseInt(quizId)]);

      console.log(`✅ UTM performance analytics fetched for quiz ${quizId}: ${result.rows.length} sources`);
      return result.rows;

    } catch (error) {
      console.error('❌ Error fetching UTM performance analytics:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Get summary metrics for all quizzes
  async getQuizSummaryMetrics(): Promise<any[]> {
    const client = await this.pool.connect();
    
    try {
      console.log('📊 Fetching quiz summary metrics...');
      
      const result = await client.query(`
        SELECT 
          q.quiz_id,
          q.quiz_name,
          q.product_page_url,
          q.quiz_start_url,
          q.is_active,
          COUNT(DISTINCT us.session_id) as quiz_starts,
          COUNT(DISTINCT CASE WHEN us.is_completed = true THEN us.session_id END) as quiz_completions,
          CASE 
            WHEN COUNT(DISTINCT us.session_id) > 0 
            THEN ROUND(
              (COUNT(DISTINCT CASE WHEN us.is_completed = true THEN us.session_id END)::DECIMAL / 
               COUNT(DISTINCT us.session_id)) * 100, 2
            )
            ELSE 0 
          END as completion_rate,
          COUNT(DISTINCT qu.question_id) as total_questions
        FROM quizzes q
        LEFT JOIN user_sessions us ON q.quiz_id = us.quiz_id
        LEFT JOIN questions qu ON q.quiz_id = qu.quiz_id
        GROUP BY q.quiz_id, q.quiz_name, q.product_page_url, q.quiz_start_url, q.is_active
        ORDER BY q.quiz_id DESC
      `);
      
      console.log(`✅ Quiz summary metrics fetched: ${result.rows.length} quizzes`);
      return result.rows;
      
    } catch (error) {
      console.error('❌ Error fetching quiz summary metrics:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}
