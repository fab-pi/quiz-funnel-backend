import { Pool } from 'pg';
import { BaseService } from './BaseService';

export class AnalyticsService extends BaseService {
  constructor(pool: Pool) {
    super(pool);
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
          COALESCE(utm_params->>'utm_source', 'Direct') as utm_source,
          COALESCE(utm_params->>'utm_campaign', 'N/A') as utm_campaign,
          COUNT(session_id) as total_sessions,
          ROUND(
            COUNT(CASE WHEN is_completed = true THEN 1 END)::numeric / COUNT(session_id)::numeric * 100, 
            2
          ) as completion_rate
        FROM user_sessions 
        WHERE quiz_id = $1
        GROUP BY utm_params->>'utm_source', utm_params->>'utm_campaign'
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
}
