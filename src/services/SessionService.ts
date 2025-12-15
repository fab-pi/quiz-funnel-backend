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
import { facebookPixelService } from './FacebookPixelService';

export class SessionService extends BaseService {
  constructor(pool: Pool) {
    super(pool);
  }

  /**
   * Start a new quiz session
   */
  async startSession(data: SessionStartRequest, req?: any): Promise<SessionStartResponse> {
    const client = await this.pool.connect();
    
    try {
      const { quiz_id, utm_params, fbp, fbc } = data;

      // Verify quiz exists and get shop_id for usage tracking
      const quizCheck = await client.query(
        'SELECT quiz_id, shop_id, facebook_pixel_id, facebook_access_token_encrypted, quiz_name FROM quizzes WHERE quiz_id = $1',
        [parseInt(quiz_id)]
      );

      if (quizCheck.rows.length === 0) {
        throw new Error('Quiz not found');
      }

      const quiz = quizCheck.rows[0];

      // Track usage for Shopify shops (check limits)
      if (quiz.shop_id) {
        try {
          // Import UsageTrackingService dynamically to avoid circular dependency
          const { UsageTrackingService } = await import('./UsageTrackingService');
          const { ShopifyBillingService } = await import('./shopify/ShopifyBillingService');
          const { ShopifyService } = await import('./shopify/ShopifyService');
          
          const shopifyService = new ShopifyService(this.pool);
          const billingService = new ShopifyBillingService(this.pool, shopifyService);
          const usageService = new UsageTrackingService(this.pool, billingService);
          
          await usageService.trackSession(quiz.shop_id);
        } catch (usageError: any) {
          // Re-throw billing errors with specific codes
          if (usageError.message === 'SESSION_LIMIT_EXCEEDED' || 
              usageError.message === 'SUBSCRIPTION_REQUIRED' ||
              usageError.message === 'SUBSCRIPTION_INACTIVE') {
            throw usageError;
          }
          // Log other errors but don't block session creation
          console.warn(`⚠️ Usage tracking error (non-blocking):`, usageError.message);
        }
      }

      // Generate session ID as UUID
      const sessionId = randomUUID();

      // Convert utm_params to JSONB for PostgreSQL
      // If utm_params is provided and not empty, stringify it; otherwise use null
      const utmParamsJsonb = utm_params && Object.keys(utm_params).length > 0 
        ? JSON.stringify(utm_params) 
        : null;

      // Insert new session with fbp and fbc
      await client.query(
        `INSERT INTO user_sessions 
         (session_id, quiz_id, start_timestamp, last_question_viewed, is_completed, utm_params, fbp, fbc)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
        [
          sessionId,
          parseInt(quiz_id),
          new Date(),
          null,
          false,
          utmParamsJsonb,
          fbp || null,
          fbc || null
        ]
      );

      console.log(`✅ Session started with ID: ${sessionId}`);

      // Send Facebook Conversions API events (async, fire and forget)
      // Only send if both Pixel ID and Access Token are configured
      if (quiz.facebook_pixel_id && quiz.facebook_access_token_encrypted) {
        try {
          const accessToken = facebookPixelService.decryptToken(quiz.facebook_access_token_encrypted);
          
          // Validate access token was decrypted successfully
          if (!accessToken || accessToken.trim().length === 0) {
            console.warn('⚠️ Failed to decrypt Facebook access token for quiz', quiz_id);
            // Continue without sending events
          } else {
            const eventTime = Math.floor(Date.now() / 1000);
            
            // Get client IP and user agent from request (with fallbacks)
            const clientIp = req?.ip || 
                           req?.headers['x-forwarded-for'] || 
                           req?.headers['x-real-ip'] ||
                           req?.connection?.remoteAddress || 
                           '';
            const userAgent = req?.headers['user-agent'] || '';
            const eventSourceUrl = req?.headers['referer'] || req?.headers['origin'] || '';

            // Normalize IP address - only include if we have a valid IP
            let normalizedIp: string | undefined = undefined;
            if (clientIp) {
              const ip = Array.isArray(clientIp) 
                ? clientIp[0] 
                : typeof clientIp === 'string' 
                  ? clientIp.split(',')[0].trim() 
                  : '';
              // Only set if we have a non-empty IP
              if (ip && ip.length > 0) {
                normalizedIp = ip;
              }
            }

            // Send PageView event (fire and forget)
            facebookPixelService.sendEventAsync({
              pixelId: quiz.facebook_pixel_id,
              accessToken,
              eventName: 'PageView',
              eventId: sessionId + '_pageview',
              eventTime,
              userData: {
                fbp: fbp || null,
                fbc: fbc || null,
                client_user_agent: userAgent || undefined,
                client_ip_address: normalizedIp,
                event_source_url: eventSourceUrl || undefined
              },
              customData: {
                content_name: quiz.quiz_name,
                content_ids: [quiz_id.toString()],
                content_type: 'quiz'
              }
            }).catch(err => {
              // Already logged in sendEventAsync, but log here for context
              console.error('❌ Failed to send PageView event for session', sessionId);
            });

            // Send ViewContent event (fire and forget)
            facebookPixelService.sendEventAsync({
              pixelId: quiz.facebook_pixel_id,
              accessToken,
              eventName: 'ViewContent',
              eventId: sessionId + '_viewcontent',
              eventTime,
              userData: {
                fbp: fbp || null,
                fbc: fbc || null,
                client_user_agent: userAgent || undefined,
                client_ip_address: normalizedIp,
                event_source_url: eventSourceUrl || undefined
              },
              customData: {
                content_name: quiz.quiz_name,
                content_ids: [quiz_id.toString()],
                content_type: 'quiz',
                content_category: 'quiz',
                value: 0,
                currency: 'USD'
              }
            }).catch(err => {
              console.error('❌ Failed to send ViewContent event for session', sessionId);
            });

            // Send custom quiz_started event (fire and forget)
            facebookPixelService.sendEventAsync({
              pixelId: quiz.facebook_pixel_id,
              accessToken,
              eventName: 'quiz_started',
              eventId: sessionId,
              eventTime,
              userData: {
                fbp: fbp || null,
                fbc: fbc || null,
                client_user_agent: userAgent || undefined,
                client_ip_address: normalizedIp,
                event_source_url: eventSourceUrl || undefined
              },
              customData: {
                quiz_id: quiz_id.toString(),
                session_id: sessionId,
                quiz_name: quiz.quiz_name,
                utm_params: utm_params || {}
              }
            }).catch(err => {
              console.error('❌ Failed to send quiz_started event for session', sessionId);
            });
          }
        } catch (error) {
          // Log error but don't block session creation
          console.error('❌ Error setting up Facebook Conversions API events:', error);
          // Session creation continues successfully
        }
      } else if (quiz.facebook_pixel_id && !quiz.facebook_access_token_encrypted) {
        // Pixel ID exists but no access token - only client-side tracking will work
        console.log('ℹ️ Facebook Pixel ID configured but no access token - only client-side tracking available');
      }

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
  async submitAnswer(data: AnswerSubmissionRequest, req?: any): Promise<AnswerSubmissionResponse> {
    const client = await this.pool.connect();
    
    try {
      const { sessionId, questionId, selectedOptionId } = data;

      // Verify session exists and get quiz info
      const sessionCheck = await client.query(
        `SELECT us.session_id, us.quiz_id, us.fbp, us.fbc, q.quiz_name, q.facebook_pixel_id, q.facebook_access_token_encrypted
         FROM user_sessions us
         JOIN quizzes q ON us.quiz_id = q.quiz_id
         WHERE us.session_id = $1`,
        [sessionId]
      );

      if (sessionCheck.rows.length === 0) {
        throw new Error('Session not found');
      }

      const session = sessionCheck.rows[0];

      // Generate answer ID as UUID
      const answerId = randomUUID();

      // Insert answer
      await client.query(
        `INSERT INTO user_answers (answer_id, session_id, question_id, selected_option_id, answer_timestamp)
         VALUES ($1, $2, $3, $4, $5)`,
        [answerId, sessionId, parseInt(questionId), parseInt(selectedOptionId), new Date()]
      );

      console.log(`✅ Answer submitted with ID: ${answerId}`);

      // Optimized progress calculation: Get total questions count (cached) and count answers
      // Total questions count doesn't change during session, so we can optimize
      const [totalQuestionsResult, answeredCountResult] = await Promise.all([
        client.query(
          `SELECT COUNT(*) as total
           FROM questions WHERE quiz_id = $1 AND (is_archived = false OR is_archived IS NULL)`,
          [session.quiz_id]
        ),
        client.query(
          `SELECT COUNT(*) as answered
           FROM user_answers WHERE session_id = $1`,
          [sessionId]
        )
      ]);

      const totalQuestions = parseInt(totalQuestionsResult.rows[0].total);
      const answeredQuestions = parseInt(answeredCountResult.rows[0].answered);
      const progressPercentage = totalQuestions > 0 ? (answeredQuestions / totalQuestions) * 100 : 0;

      // Send Facebook Conversions API event (async, fire and forget)
      if (session.facebook_pixel_id && session.facebook_access_token_encrypted) {
        try {
          const accessToken = facebookPixelService.decryptToken(session.facebook_access_token_encrypted);
          
          // Validate access token was decrypted successfully
          if (!accessToken || accessToken.trim().length === 0) {
            console.warn('⚠️ Failed to decrypt Facebook access token for answer submission');
            // Continue without sending event
          } else {
            const eventTime = Math.floor(Date.now() / 1000);
            
            // Get client IP and user agent from request (with fallbacks)
            const clientIp = req?.ip || 
                           req?.headers['x-forwarded-for'] || 
                           req?.headers['x-real-ip'] ||
                           req?.connection?.remoteAddress || 
                           '';
            const userAgent = req?.headers['user-agent'] || '';
            const eventSourceUrl = req?.headers['referer'] || req?.headers['origin'] || '';

            // Normalize IP address - only include if we have a valid IP
            let normalizedIp: string | undefined = undefined;
            if (clientIp) {
              const ip = Array.isArray(clientIp) 
                ? clientIp[0] 
                : typeof clientIp === 'string' 
                  ? clientIp.split(',')[0].trim() 
                  : '';
              // Only set if we have a non-empty IP
              if (ip && ip.length > 0) {
                normalizedIp = ip;
              }
            }

            // Send custom quiz_answer event (fire and forget)
            facebookPixelService.sendEventAsync({
              pixelId: session.facebook_pixel_id,
              accessToken,
              eventName: 'quiz_answer',
              eventId: answerId,
              eventTime,
              userData: {
                fbp: session.fbp || null,
                fbc: session.fbc || null,
                client_user_agent: userAgent || undefined,
                client_ip_address: normalizedIp,
                event_source_url: eventSourceUrl || undefined
              },
              customData: {
                quiz_id: session.quiz_id.toString(),
                session_id: sessionId,
                question_id: questionId.toString(),
                answer_id: answerId,
                selected_option_id: selectedOptionId,
                progress_percentage: Math.round(progressPercentage)
              }
            }).catch(err => {
              console.error('❌ Failed to send quiz_answer event for answer', answerId);
            });

            // Check and send progress milestone events (25%, 50%, 75%)
            // Only fire when crossing the threshold (e.g., progress goes from 24% to 25%+)
            // Use >= milestone to ensure we fire when crossing the threshold
            const milestones = [25, 50, 75];
            for (const milestone of milestones) {
              // Fire when progress >= milestone (e.g., 25% or higher)
              // We check if we've just crossed this milestone by checking if previous progress was less
              // Since we're calculating after inserting the answer, we check if current progress >= milestone
              // and previous progress (answeredQuestions - 1) would have been < milestone
              const previousProgress = totalQuestions > 0 ? ((answeredQuestions - 1) / totalQuestions) * 100 : 0;
              
              console.log(`📊 Progress check: current=${progressPercentage.toFixed(1)}%, previous=${previousProgress.toFixed(1)}%, milestone=${milestone}%`);
              
              if (progressPercentage >= milestone && previousProgress < milestone) {
                const milestoneEventId = `${sessionId}_progress_${milestone}`;
                console.log(`🎯 Milestone ${milestone}% crossed! Sending event: ${milestoneEventId}`);
                facebookPixelService.sendEventAsync({
                  pixelId: session.facebook_pixel_id,
                  accessToken,
                  eventName: `quiz_progress_${milestone}`,
                  eventId: milestoneEventId,
                  eventTime,
                  userData: {
                    fbp: session.fbp || null,
                    fbc: session.fbc || null,
                    client_user_agent: userAgent || undefined,
                    client_ip_address: normalizedIp,
                    event_source_url: eventSourceUrl || undefined
                  },
                  customData: {
                    quiz_id: session.quiz_id.toString(),
                    session_id: sessionId,
                    progress_percentage: milestone,
                    question_number: answeredQuestions,
                    total_questions: totalQuestions
                  }
                }).catch(err => {
                  console.error(`❌ Failed to send quiz_progress_${milestone} event for session`, sessionId);
                });
                break; // Only fire one milestone per answer
              }
            }
          }
        } catch (error) {
          // Log error but don't block answer submission
          console.error('❌ Error setting up Facebook Conversions API events for answer:', error);
          // Answer submission continues successfully
        }
      }

      return {
        success: true,
        answer_id: answerId,
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
  async completeSession(sessionId: string, req?: any): Promise<{ success: boolean; message: string }> {
    const client = await this.pool.connect();
    
    try {
      // Verify session exists and get quiz info
      const sessionCheck = await client.query(
        `SELECT us.session_id, us.quiz_id, us.fbp, us.fbc, q.quiz_name, q.facebook_pixel_id, q.facebook_access_token_encrypted
         FROM user_sessions us
         JOIN quizzes q ON us.quiz_id = q.quiz_id
         WHERE us.session_id = $1`,
        [sessionId]
      );

      if (sessionCheck.rows.length === 0) {
        throw new Error('Session not found');
      }

      const session = sessionCheck.rows[0];

      // Get total questions count
      const questionCountResult = await client.query(
        `SELECT COUNT(*) as total
         FROM questions WHERE quiz_id = $1 AND (is_archived = false OR is_archived IS NULL)`,
        [session.quiz_id]
      );

      const totalQuestions = parseInt(questionCountResult.rows[0].total);

      // Update session to completed
      await client.query(
        'UPDATE user_sessions SET is_completed = true, final_profile = $1 WHERE session_id = $2',
        ['Completed', sessionId]
      );

      console.log(`✅ Session ${sessionId} completed`);

      // Send Facebook Conversions API events (async, fire and forget)
      if (session.facebook_pixel_id && session.facebook_access_token_encrypted) {
        try {
          const accessToken = facebookPixelService.decryptToken(session.facebook_access_token_encrypted);
          
          // Validate access token was decrypted successfully
          if (!accessToken || accessToken.trim().length === 0) {
            console.warn('⚠️ Failed to decrypt Facebook access token for quiz completion');
            // Continue without sending events
          } else {
            const eventTime = Math.floor(Date.now() / 1000);
            const completionEventId = `${sessionId}_completed`;
            
            // Get client IP and user agent from request (with fallbacks)
            const clientIp = req?.ip || 
                           req?.headers['x-forwarded-for'] || 
                           req?.headers['x-real-ip'] ||
                           req?.connection?.remoteAddress || 
                           '';
            const userAgent = req?.headers['user-agent'] || '';
            const eventSourceUrl = req?.headers['referer'] || req?.headers['origin'] || '';

            // Normalize IP address - only include if we have a valid IP
            let normalizedIp: string | undefined = undefined;
            if (clientIp) {
              const ip = Array.isArray(clientIp) 
                ? clientIp[0] 
                : typeof clientIp === 'string' 
                  ? clientIp.split(',')[0].trim() 
                  : '';
              // Only set if we have a non-empty IP
              if (ip && ip.length > 0) {
                normalizedIp = ip;
              }
            }

            // Send custom quiz_completed event (fire and forget)
            facebookPixelService.sendEventAsync({
              pixelId: session.facebook_pixel_id,
              accessToken,
              eventName: 'quiz_completed',
              eventId: completionEventId,
              eventTime,
              userData: {
                fbp: session.fbp || null,
                fbc: session.fbc || null,
                client_user_agent: userAgent || undefined,
                client_ip_address: normalizedIp,
                event_source_url: eventSourceUrl || undefined
              },
              customData: {
                quiz_id: session.quiz_id.toString(),
                session_id: sessionId,
                quiz_name: session.quiz_name,
                total_questions: totalQuestions,
                completion_time: Date.now()
              }
            }).catch(err => {
              console.error('❌ Failed to send quiz_completed event for session', sessionId);
            });

            // Send standard Lead event (fire and forget)
            facebookPixelService.sendEventAsync({
              pixelId: session.facebook_pixel_id,
              accessToken,
              eventName: 'Lead',
              eventId: completionEventId + '_lead',
              eventTime,
              userData: {
                fbp: session.fbp || null,
                fbc: session.fbc || null,
                client_user_agent: userAgent || undefined,
                client_ip_address: normalizedIp,
                event_source_url: eventSourceUrl || undefined
              },
              customData: {
                content_name: session.quiz_name,
                content_ids: [session.quiz_id.toString()],
                content_type: 'quiz',
                value: 0,
                currency: 'USD'
              }
            }).catch(err => {
              console.error('❌ Failed to send Lead event for session', sessionId);
            });
          }
        } catch (error) {
          // Log error but don't block session completion
          console.error('❌ Error setting up Facebook Conversions API events for completion:', error);
          // Session completion continues successfully
        }
      } else if (session.facebook_pixel_id && !session.facebook_access_token_encrypted) {
        // Pixel ID exists but no access token - only client-side tracking will work
        console.log('ℹ️ Facebook Pixel ID configured but no access token - only client-side tracking available');
      }

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
