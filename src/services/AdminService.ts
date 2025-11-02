import { Pool } from 'pg';
import { BaseService } from './BaseService';

export class AdminService extends BaseService {
  constructor(pool: Pool) {
    super(pool);
  }

  /**
   * Get summary metrics for all quizzes
   */
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
          AND (qu.is_archived = false OR qu.is_archived IS NULL)
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
