import { Pool } from 'pg';
import { randomUUID } from 'crypto';
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
      const { quiz_id, utm_params } = data;

      // Verify quiz exists
      const quizCheck = await client.query(
        'SELECT quiz_id FROM quizzes WHERE quiz_id = $1',
        [parseInt(quiz_id)]
      );

      if (quizCheck.rows.length === 0) {
        throw new Error('Quiz not found');
      }

      // Generate session ID as UUID
      const sessionId = randomUUID();

      // Convert utm_params to JSONB for PostgreSQL
      // If utm_params is provided and not empty, stringify it; otherwise use null
      const utmParamsJsonb = utm_params && Object.keys(utm_params).length > 0 
        ? JSON.stringify(utm_params) 
        : null;

      // Insert new session
      await client.query(
        `INSERT INTO user_sessions 
         (session_id, quiz_id, start_timestamp, last_question_viewed, is_completed, utm_params)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          sessionId,
          parseInt(quiz_id),
          new Date(),
          null,
          false,
          utmParamsJsonb
        ]
      );

      console.log(`✅ Session started with ID: ${sessionId}`);

      return {
        session_id: sessionId,
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
        [sessionId]
      );

      if (sessionCheck.rows.length === 0) {
        throw new Error('Session not found');
      }

      // Update session
      await client.query(
        'UPDATE user_sessions SET last_question_viewed = $1 WHERE session_id = $2',
        [parseInt(lastQuestionId), sessionId]
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
        [sessionId]
      );

      if (sessionCheck.rows.length === 0) {
        throw new Error('Session not found');
      }

      // Generate answer ID as UUID
      const answerId = randomUUID();

      // Insert answer
      await client.query(
        `INSERT INTO user_answers (answer_id, session_id, question_id, selected_option_id, answer_timestamp)
         VALUES ($1, $2, $3, $4, $5)`,
        [answerId, sessionId, parseInt(questionId), parseInt(selectedOptionId), new Date()]
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
        [sessionId]
      );

      if (sessionCheck.rows.length === 0) {
        throw new Error('Session not found');
      }

      // Update session to completed
      await client.query(
        'UPDATE user_sessions SET is_completed = true, final_profile = $1 WHERE session_id = $2',
        ['Completed', sessionId]
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
   * Get UTM parameters for a session
   * Used to retrieve stored UTM params for appending to redirect URLs
   */
  async getSessionUTMParams(sessionId: string): Promise<Record<string, string> | null> {
    const client = await this.pool.connect();
    
    try {
      // Query utm_params from user_sessions
      const result = await client.query(
        'SELECT utm_params FROM user_sessions WHERE session_id = $1',
        [sessionId]
      );

      if (result.rows.length === 0) {
        console.log(`⚠️ Session ${sessionId} not found`);
        return null;
      }

      const utmParams = result.rows[0].utm_params;

      // If utm_params is null or empty, return null
      if (!utmParams || typeof utmParams !== 'object') {
        return null;
      }

      // PostgreSQL JSONB is automatically parsed to object by pg driver
      // Convert to Record<string, string> format
      const utmParamsRecord: Record<string, string> = {};
      for (const [key, value] of Object.entries(utmParams)) {
        if (typeof value === 'string') {
          utmParamsRecord[key] = value;
        }
      }

      return Object.keys(utmParamsRecord).length > 0 ? utmParamsRecord : null;

    } catch (error) {
      console.error('❌ Error fetching UTM params:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}
