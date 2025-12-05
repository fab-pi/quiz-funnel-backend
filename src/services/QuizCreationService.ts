import { Pool } from 'pg';
import { BaseService } from './BaseService';
import { QuizCreationRequest, QuizCreationResponse } from '../types';
import { facebookPixelService } from './FacebookPixelService';

export class QuizCreationService extends BaseService {
  constructor(pool: Pool) {
    super(pool);
  }

  /**
   * Create a new quiz with full structure
   * @param data - Quiz creation data
   * @param userId - ID of the user creating the quiz (from authenticated user)
   */
  async createQuiz(data: QuizCreationRequest, userId: number): Promise<QuizCreationResponse> {
    const client = await this.pool.connect();
    
    try {
      // Start transaction
      await client.query('BEGIN');

      console.log(`🔄 Starting quiz creation transaction for user ${userId}...`);

      // Encrypt Facebook access token if provided
      const encryptedToken = data.facebook_access_token 
        ? facebookPixelService.encryptToken(data.facebook_access_token)
        : null;

      // Insert quiz with user_id
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
          creation_date,
          user_id,
          custom_domain,
          facebook_pixel_id,
          facebook_access_token_encrypted
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
        new Date(),
        userId,
        data.custom_domain || null,
        data.facebook_pixel_id || null,
        encryptedToken
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
            popup_question,
            loader_bars,
            result_page_config,
            timeline_projection_config,
            educational_box_title,
            educational_box_text
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING question_id
        `, [
          quizId,
          question.sequence_order,
          question.question_text || null,
          question.interaction_type,
          question.image_url || null,
          question.instructions_text || null,
          question.loader_text || null,
          question.popup_question || null,
          question.loader_bars ? JSON.stringify(question.loader_bars) : null,
          question.result_page_config ? JSON.stringify(question.result_page_config) : null,
          question.timeline_projection_config ? JSON.stringify(question.timeline_projection_config) : null,
          question.educational_box_title || null,
          question.educational_box_text || null
        ]);

        const questionId = questionResult.rows[0].question_id;
        console.log(`✅ Question created with ID: ${questionId}`);

        // Insert options (all question types can have options now)
        const createdOptions = [];
        if (question.options && question.options.length > 0) {
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
            custom_domain: data.custom_domain || null,
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

  /**
   * Get quiz data for editing (includes inactive quizzes)
   * @param quizId - Quiz ID to fetch
   * @param userId - ID of the user requesting (for ownership check)
   * @param userRole - Role of the user ('user' or 'admin')
   */
  async getQuizForEditing(quizId: number, userId: number, userRole: 'user' | 'admin'): Promise<any> {
    const client = await this.pool.connect();
    
    try {
      // Get quiz info with user_id (no is_active check)
      const quizResult = await client.query(
        `SELECT 
          quiz_id, 
          quiz_name, 
          product_page_url, 
          is_active, 
          brand_logo_url, 
          color_primary, 
          color_secondary, 
          color_text_default, 
          color_text_hover,
          user_id,
          custom_domain
        FROM quizzes 
        WHERE quiz_id = $1`,
        [quizId]
      );

      if (quizResult.rows.length === 0) {
        throw new Error('Quiz not found');
      }

      const quiz = quizResult.rows[0];

      // Check ownership (admin can access any quiz, users can only access their own)
      if (userRole !== 'admin' && quiz.user_id !== userId) {
        throw new Error('Unauthorized: You do not own this quiz');
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
      `, [quizId]);

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

      console.log(`✅ Quiz data fetched for editing (quiz ${quizId}): ${questions.length} questions`);

      // Decrypt access token for editing (if present)
      const decryptedToken = quiz.facebook_access_token_encrypted
        ? facebookPixelService.decryptToken(quiz.facebook_access_token_encrypted)
        : null;

      return {
        quiz_id: quiz.quiz_id,
        quiz_name: quiz.quiz_name,
        product_page_url: quiz.product_page_url,
        is_active: quiz.is_active,
        brand_logo_url: quiz.brand_logo_url,
        color_primary: quiz.color_primary,
        color_secondary: quiz.color_secondary,
        color_text_default: quiz.color_text_default,
        color_text_hover: quiz.color_text_hover,
        custom_domain: quiz.custom_domain,
        facebook_pixel_id: quiz.facebook_pixel_id,
        facebook_access_token: decryptedToken, // Return decrypted token for editing
        questions
      };

    } catch (error) {
      console.error('❌ Error fetching quiz for editing:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update an existing quiz with full structure
   * Uses soft delete (is_archived) to preserve historical data
   * @param quizId - Quiz ID to update
   * @param data - Quiz update data
   * @param userId - ID of the user updating (for ownership check)
   * @param userRole - Role of the user ('user' or 'admin')
   */
  async updateQuiz(quizId: number, data: QuizCreationRequest, userId: number, userRole: 'user' | 'admin'): Promise<QuizCreationResponse> {
    const client = await this.pool.connect();
    
    try {
      // Start transaction
      await client.query('BEGIN');

      console.log(`🔄 Starting quiz update transaction for quiz ID: ${quizId} by user ${userId}...`);

      // Verify quiz exists and check ownership
      const quizCheckResult = await client.query(
        'SELECT quiz_id, user_id FROM quizzes WHERE quiz_id = $1',
        [quizId]
      );

      if (quizCheckResult.rows.length === 0) {
        throw new Error('Quiz not found');
      }

      const quiz = quizCheckResult.rows[0];

      // Check ownership (admin can update any quiz, users can only update their own)
      if (userRole !== 'admin' && quiz.user_id !== userId) {
        throw new Error('Unauthorized: You do not own this quiz');
      }

      // VALIDATION 1: Check that sequence_order values are unique (only among active questions)
      const sequenceOrders = new Set<number>();
      for (const question of data.questions) {
        if (sequenceOrders.has(question.sequence_order)) {
          throw new Error(`Duplicate sequence_order: ${question.sequence_order}. Each question must have a unique sequence_order.`);
        }
        sequenceOrders.add(question.sequence_order);
      }

      // Encrypt Facebook access token if provided
      const encryptedToken = data.facebook_access_token 
        ? facebookPixelService.encryptToken(data.facebook_access_token)
        : null;

      // Update quiz base info
      await client.query(`
        UPDATE quizzes SET
          quiz_name = $1,
          product_page_url = $2,
          is_active = $3,
          brand_logo_url = $4,
          color_primary = $5,
          color_secondary = $6,
          color_text_default = $7,
          color_text_hover = $8,
          custom_domain = $9,
          facebook_pixel_id = $10,
          facebook_access_token_encrypted = $11
        WHERE quiz_id = $12
      `, [
        data.quiz_name,
        data.product_page_url,
        data.is_active,
        data.brand_logo_url || null,
        data.color_primary,
        data.color_secondary,
        data.color_text_default,
        data.color_text_hover,
        data.custom_domain || null,
        data.facebook_pixel_id || null,
        encryptedToken,
        quizId
      ]);
      console.log(`✅ Quiz base info updated for quiz ID: ${quizId}`);

      // Get all existing questions for this quiz
      const existingQuestionsResult = await client.query(
        'SELECT question_id FROM questions WHERE quiz_id = $1',
        [quizId]
      );
      const existingQuestionIds = new Set(
        existingQuestionsResult.rows.map(row => row.question_id)
      );

      // Get all existing options for questions in this quiz
      const existingOptionsResult = await client.query(`
        SELECT ao.option_id, ao.question_id
        FROM answer_options ao
        JOIN questions q ON ao.question_id = q.question_id
        WHERE q.quiz_id = $1
      `, [quizId]);
      const existingOptionIds = new Set(
        existingOptionsResult.rows.map(row => row.option_id)
      );

      // Track which questions/options are in the payload
      const payloadQuestionIds = new Set<number>();
      const payloadOptionIds = new Set<number>();

      // Extract question IDs from payload first
      for (const question of data.questions) {
        if (question.question_id) {
          payloadQuestionIds.add(question.question_id);
        }
        if (question.options) {
          for (const option of question.options) {
            if (option.option_id) {
              payloadOptionIds.add(option.option_id);
            }
          }
        }
      }

      // CRITICAL: Archive questions/options NOT in payload FIRST
      // This prevents sequence_order conflicts when updating remaining questions
      const questionsToArchive = Array.from(existingQuestionIds).filter(
        id => !payloadQuestionIds.has(id)
      );

      for (const questionId of questionsToArchive) {
        await client.query(
          'UPDATE questions SET is_archived = true WHERE question_id = $1',
          [questionId]
        );
        console.log(`✅ Question ${questionId} archived (soft delete)`);
      }

      // Archive options not in payload (soft delete)
      // But only if they don't have user_answers
      const optionsToArchive = Array.from(existingOptionIds).filter(
        id => !payloadOptionIds.has(id)
      );

      for (const optionId of optionsToArchive) {
        // Check if option has user_answers
        const answerCountResult = await client.query(
          'SELECT COUNT(*) as count FROM user_answers WHERE selected_option_id = $1',
          [optionId]
        );
        const answerCount = parseInt(answerCountResult.rows[0].count);

        if (answerCount === 0) {
          // No answers - safe to archive
          await client.query(
            'UPDATE answer_options SET is_archived = true WHERE option_id = $1',
            [optionId]
          );
          console.log(`✅ Option ${optionId} archived (soft delete, no answers)`);
        } else {
          // Has answers - keep active to preserve data integrity
          console.log(`⚠️ Option ${optionId} kept active (has ${answerCount} answers, preserving for data integrity)`);
        }
      }

      // CRITICAL: Temporarily move existing questions' sequence_order to negative values
      // This prevents conflicts when inserting new questions with sequence_order that might
      // conflict with existing questions that haven't been updated yet
      const existingQuestionsToUpdate = data.questions.filter(
        q => q.question_id && existingQuestionIds.has(q.question_id)
      );
      
      for (const question of existingQuestionsToUpdate) {
        // Move to temporary negative sequence_order to free up the target sequence_order
        await client.query(
          'UPDATE questions SET sequence_order = $1 WHERE question_id = $2',
          [-(question.question_id || 0), question.question_id]
        );
      }
      console.log(`✅ Temporarily moved ${existingQuestionsToUpdate.length} existing questions to negative sequence_order`);

      // NOW process questions from payload (after archiving removed ones and moving existing ones)
      const updatedQuestions = [];

      for (const question of data.questions) {
        let questionId: number;

        if (question.question_id && existingQuestionIds.has(question.question_id)) {
          // UPDATE existing question
          // Check if we're restoring an archived question (could cause sequence_order conflict)
          const existingQuestionCheck = await client.query(
            'SELECT is_archived, sequence_order FROM questions WHERE question_id = $1',
            [question.question_id]
          );

          if (existingQuestionCheck.rows.length > 0) {
            const wasArchived = existingQuestionCheck.rows[0].is_archived === true;
            const oldSequenceOrder = existingQuestionCheck.rows[0].sequence_order;

            // If restoring archived question, check for sequence_order conflict
            if (wasArchived && question.sequence_order !== oldSequenceOrder) {
              const conflictCheck = await client.query(
                `SELECT question_id FROM questions 
                 WHERE quiz_id = $1 
                   AND sequence_order = $2 
                   AND question_id != $3
                   AND (is_archived = false OR is_archived IS NULL)`,
                [quizId, question.sequence_order, question.question_id]
              );

              if (conflictCheck.rows.length > 0) {
                // Conflict found - we need to reorder the conflicting question
                // For now, we'll throw an error and let the admin handle it
                // In a more sophisticated implementation, we could auto-reorder
                throw new Error(
                  `Cannot restore question ${question.question_id} with sequence_order ${question.sequence_order}. ` +
                  `Another active question already has this sequence_order. Please reassign sequence_order values.`
                );
              }
            }
          }

          questionId = question.question_id;
          
          await client.query(`
            UPDATE questions SET
              sequence_order = $1,
              question_text = $2,
              interaction_type = $3,
              image_url = $4,
              instructions_text = $5,
              loader_text = $6,
              popup_question = $7,
              loader_bars = $8,
              result_page_config = $9,
              timeline_projection_config = $10,
              educational_box_title = $11,
              educational_box_text = $12,
              is_archived = false
            WHERE question_id = $13
          `, [
            question.sequence_order,
            question.question_text || null,
            question.interaction_type,
            question.image_url || null,
            question.instructions_text || null,
            question.loader_text || null,
            question.popup_question || null,
            question.loader_bars ? JSON.stringify(question.loader_bars) : null,
            question.result_page_config ? JSON.stringify(question.result_page_config) : null,
            question.timeline_projection_config ? JSON.stringify(question.timeline_projection_config) : null,
            question.educational_box_title || null,
            question.educational_box_text || null,
            questionId
          ]);
          console.log(`✅ Question ${questionId} updated`);
        } else {
          // INSERT new question
          const questionResult = await client.query(`
            INSERT INTO questions (
              quiz_id, 
              sequence_order, 
              question_text, 
              interaction_type, 
              image_url,
              instructions_text,
              loader_text,
              popup_question,
              loader_bars,
              result_page_config,
              timeline_projection_config,
              educational_box_title,
              educational_box_text,
              is_archived
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, false)
            RETURNING question_id
          `, [
            quizId,
            question.sequence_order,
            question.question_text,
            question.interaction_type,
            question.image_url || null,
            question.instructions_text || null,
            question.loader_text || null,
            question.popup_question || null,
            question.loader_bars ? JSON.stringify(question.loader_bars) : null,
            question.result_page_config ? JSON.stringify(question.result_page_config) : null,
            question.timeline_projection_config ? JSON.stringify(question.timeline_projection_config) : null,
            question.educational_box_title || null,
            question.educational_box_text || null
          ]);

          questionId = questionResult.rows[0].question_id;
          console.log(`✅ Question ${questionId} created`);
        }

        payloadQuestionIds.add(questionId);

        // Process options for this question
        const updatedOptions = [];

        if (question.options && question.options.length > 0) {
          for (const option of question.options) {
            let optionId: number;

            if (option.option_id && existingOptionIds.has(option.option_id)) {
              // UPDATE existing option
              optionId = option.option_id;

              // Check if option has user_answers (for associated_value protection)
              const answerCountResult = await client.query(
                'SELECT COUNT(*) as count FROM user_answers WHERE selected_option_id = $1',
                [optionId]
              );
              const answerCount = parseInt(answerCountResult.rows[0].count);

              if (answerCount > 0) {
                // Option has answers - only update safe fields (not associated_value)
                await client.query(`
                  UPDATE answer_options SET
                    option_text = $1,
                    option_image_url = $2,
                    is_archived = false
                  WHERE option_id = $3
                `, [
                  option.option_text,
                  option.option_image_url || null,
                  optionId
                ]);
                console.log(`✅ Option ${optionId} updated (preserved associated_value due to ${answerCount} existing answers)`);
              } else {
                // Option has no answers - safe to update all fields
                await client.query(`
                  UPDATE answer_options SET
                    option_text = $1,
                    associated_value = $2,
                    option_image_url = $3,
                    is_archived = false
                  WHERE option_id = $4
                `, [
                  option.option_text,
                  option.associated_value,
                  option.option_image_url || null,
                  optionId
                ]);
                console.log(`✅ Option ${optionId} updated`);
              }
            } else {
              // INSERT new option
              const optionResult = await client.query(`
                INSERT INTO answer_options (
                  question_id, 
                  option_text, 
                  associated_value, 
                  option_image_url,
                  is_archived
                ) VALUES ($1, $2, $3, $4, false)
                RETURNING option_id
              `, [
                questionId,
                option.option_text,
                option.associated_value,
                option.option_image_url || null
              ]);

              optionId = optionResult.rows[0].option_id;
              console.log(`✅ Option ${optionId} created`);
            }

            payloadOptionIds.add(optionId);

            updatedOptions.push({
              option_id: optionId,
              option_text: option.option_text,
              associated_value: option.associated_value,
              option_image_url: option.option_image_url
            });
          }
        }

        updatedQuestions.push({
          question_id: questionId,
          sequence_order: question.sequence_order,
          question_text: question.question_text,
          interaction_type: question.interaction_type,
          image_url: question.image_url,
          options: updatedOptions
        });
      }

      // VALIDATION 2: Verify at least one question remains active after update
      const activeQuestionsResult = await client.query(
        'SELECT COUNT(*) as count FROM questions WHERE quiz_id = $1 AND (is_archived = false OR is_archived IS NULL)',
        [quizId]
      );
      const activeQuestionCount = parseInt(activeQuestionsResult.rows[0].count);

      if (activeQuestionCount === 0) {
        throw new Error('Quiz must have at least one active question. Cannot archive all questions.');
      }

      // Commit transaction
      await client.query('COMMIT');
      console.log(`✅ Quiz update transaction completed successfully for quiz ID: ${quizId}`);

      return {
        success: true,
        message: 'Quiz updated successfully',
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
            custom_domain: data.custom_domain || null,
            questions: updatedQuestions
          }
        }
      };

    } catch (error) {
      // Rollback transaction on error
      await client.query('ROLLBACK');
      console.error(`❌ Error updating quiz ${quizId}, transaction rolled back:`, error);
      throw error;
    } finally {
      client.release();
    }
  }
}
