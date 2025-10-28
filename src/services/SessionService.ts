import { Pool } from 'pg';
import { BaseService } from './BaseService';
import { 
  SessionStartRequest, 
  SessionStartResponse, 
  SessionUpdateRequest, 
  SessionUpdateResponse,
  AnswerSubmissionRequest,
  AnswerSubmissionResponse
} from '../types';

export class SessionService extends BaseService {
  constructor(pool: Pool) {
    super(pool);
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

      // Generate session ID using improved method
      const sessionId = this.generateUniqueId();

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

      // Generate answer ID using improved method
      const answerId = this.generateUniqueId();

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
}
