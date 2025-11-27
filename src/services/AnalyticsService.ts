import { Pool } from 'pg';
import { BaseService } from './BaseService';

export class AnalyticsService extends BaseService {
  constructor(pool: Pool) {
    super(pool);
  }

  /**
   * Validate quiz access and ownership
   * @param client - Database client
   * @param quizId - Quiz ID
   * @param userId - ID of the user requesting
   * @param userRole - Role of the user ('user' or 'admin')
   * @throws Error if quiz not found or unauthorized
   */
  private async validateQuizAccess(
    client: any,
    quizId: string,
    userId: number,
    userRole: 'user' | 'admin'
  ): Promise<void> {
    const quizCheck = await client.query(
      'SELECT user_id FROM quizzes WHERE quiz_id = $1',
      [parseInt(quizId)]
    );

    if (quizCheck.rows.length === 0) {
      throw new Error('Quiz not found');
    }

    const quiz = quizCheck.rows[0];

    // Check ownership (admin can access any quiz, users can only access their own)
    if (userRole !== 'admin' && quiz.user_id !== userId) {
      throw new Error('Unauthorized: You do not own this quiz');
    }
  }

  /**
   * Build date filter SQL clause and parameters
   * @param startDate - Optional start date
   * @param endDate - Optional end date
   * @param paramOffset - Offset for parameter numbering (default: 0)
   * @returns Object with SQL clause and parameters array
   */
  private buildDateFilter(
    startDate?: Date,
    endDate?: Date,
    paramOffset: number = 0
  ): { sql: string; params: any[] } {
    const conditions: string[] = [];
    const params: any[] = [];

    if (startDate) {
      conditions.push(`start_timestamp >= $${paramOffset + params.length + 1}`);
      params.push(startDate);
    }

    if (endDate) {
      // Add one day to endDate to include the entire end date
      const endDateInclusive = new Date(endDate);
      endDateInclusive.setHours(23, 59, 59, 999);
      conditions.push(`start_timestamp <= $${paramOffset + params.length + 1}`);
      params.push(endDateInclusive);
    }

    const sql = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';
    return { sql, params };
  }

  /**
   * Get drop rate analytics
   * @param quizId - Quiz ID
   * @param includeArchived - Whether to include archived questions
   * @param userId - ID of the user requesting (for ownership check)
   * @param userRole - Role of the user ('user' or 'admin')
   * @param startDate - Optional start date for filtering
   * @param endDate - Optional end date for filtering
   */
  async getDropRateAnalytics(
    quizId: string, 
    includeArchived: boolean = false,
    userId: number,
    userRole: 'user' | 'admin',
    startDate?: Date,
    endDate?: Date
  ): Promise<any[]> {
    const client = await this.pool.connect();
    
    try {
      await this.validateQuizAccess(client, quizId, userId, userRole);

      // Filter by is_archived unless explicitly including archived questions
      const archiveFilter = includeArchived 
        ? '' 
        : 'AND (q.is_archived = false OR q.is_archived IS NULL)';
      
      // Build date filter for sessions
      const dateFilter = this.buildDateFilter(startDate, endDate, 1);
      const dateFilterSql = dateFilter.sql.replace('start_timestamp', 'us.start_timestamp');
      
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
          ${dateFilterSql}
        LEFT JOIN user_answers ua ON ua.session_id = us.session_id 
          AND ua.question_id = q.question_id
        WHERE q.quiz_id = $1 ${archiveFilter}
        GROUP BY q.question_id, q.question_text, q.sequence_order
        ORDER BY q.sequence_order
      `, [parseInt(quizId), ...dateFilter.params]);

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
   * @param quizId - Quiz ID
   * @param userId - ID of the user requesting (for ownership check)
   * @param userRole - Role of the user ('user' or 'admin')
   * @param startDate - Optional start date for filtering
   * @param endDate - Optional end date for filtering
   */
  async getUTMPerformanceAnalytics(
    quizId: string,
    userId: number,
    userRole: 'user' | 'admin',
    startDate?: Date,
    endDate?: Date
  ): Promise<any[]> {
    const client = await this.pool.connect();
    
    try {
      await this.validateQuizAccess(client, quizId, userId, userRole);

      const dateFilter = this.buildDateFilter(startDate, endDate, 1);

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
        WHERE quiz_id = $1 ${dateFilter.sql}
        GROUP BY utm_params->>'utm_source', utm_params->>'utm_campaign'
        ORDER BY total_sessions DESC
      `, [parseInt(quizId), ...dateFilter.params]);

      console.log(`✅ UTM performance analytics fetched for quiz ${quizId}: ${result.rows.length} sources`);
      return result.rows;

    } catch (error) {
      console.error('❌ Error fetching UTM performance analytics:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get generic quiz statistics
   * @param quizId - Quiz ID
   * @param userId - ID of the user requesting
   * @param userRole - Role of the user ('user' or 'admin')
   * @param startDate - Optional start date for filtering
   * @param endDate - Optional end date for filtering
   */
  async getQuizStats(
    quizId: string,
    userId: number,
    userRole: 'user' | 'admin',
    startDate?: Date,
    endDate?: Date
  ): Promise<any> {
    const client = await this.pool.connect();
    
    try {
      await this.validateQuizAccess(client, quizId, userId, userRole);

      const dateFilter = this.buildDateFilter(startDate, endDate, 1);

      const result = await client.query(`
        SELECT 
          COUNT(us.session_id) as total_sessions,
          COUNT(CASE WHEN us.is_completed = true THEN 1 END) as total_completions,
          CASE 
            WHEN COUNT(us.session_id) = 0 THEN 0
            ELSE ROUND(
              COUNT(CASE WHEN us.is_completed = true THEN 1 END)::numeric / COUNT(us.session_id)::numeric * 100, 
              2
            )
          END as completion_rate,
          CASE 
            WHEN COUNT(us.session_id) = 0 THEN 0
            ELSE ROUND(
              COALESCE(AVG(answer_counts.answer_count), 0)::numeric, 
              2
            )
          END as avg_questions_answered
        FROM user_sessions us
        LEFT JOIN (
          SELECT session_id, COUNT(*) as answer_count
          FROM user_answers
          GROUP BY session_id
        ) answer_counts ON answer_counts.session_id = us.session_id
        WHERE us.quiz_id = $1 ${dateFilter.sql}
      `, [parseInt(quizId), ...dateFilter.params]);

      console.log(`✅ Quiz stats fetched for quiz ${quizId}`);
      return result.rows[0];

    } catch (error) {
      console.error('❌ Error fetching quiz stats:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get detailed analytics for each question
   * @param quizId - Quiz ID
   * @param userId - ID of the user requesting
   * @param userRole - Role of the user ('user' or 'admin')
   * @param startDate - Optional start date for filtering
   * @param endDate - Optional end date for filtering
   */
  async getQuestionDetails(
    quizId: string,
    userId: number,
    userRole: 'user' | 'admin',
    startDate?: Date,
    endDate?: Date
  ): Promise<any[]> {
    const client = await this.pool.connect();
    
    try {
      await this.validateQuizAccess(client, quizId, userId, userRole);

      const dateFilter = this.buildDateFilter(startDate, endDate, 1);
      const dateFilterSql = dateFilter.sql ? dateFilter.sql.replace('start_timestamp', 'us.start_timestamp') : '';

      const params = [parseInt(quizId), ...dateFilter.params];

      const result = await client.query(`
        WITH filtered_sessions AS (
          SELECT session_id
          FROM user_sessions
          WHERE quiz_id = $1 ${dateFilter.sql}
        ),
        question_views AS (
          SELECT 
            q.question_id,
            COUNT(DISTINCT us.session_id) as views
          FROM questions q
          LEFT JOIN user_sessions us ON us.quiz_id = q.quiz_id 
            AND us.session_id IN (SELECT session_id FROM filtered_sessions)
            AND (us.last_question_viewed >= q.question_id OR us.last_question_viewed IS NULL)
          WHERE q.quiz_id = $1 
            AND (q.is_archived = false OR q.is_archived IS NULL)
          GROUP BY q.question_id
        ),
        question_answers AS (
          SELECT 
            q.question_id,
            COUNT(ua.answer_id) as answers
          FROM questions q
          LEFT JOIN user_answers ua ON ua.question_id = q.question_id
          LEFT JOIN filtered_sessions fs ON fs.session_id = ua.session_id
          WHERE q.quiz_id = $1 
            AND (q.is_archived = false OR q.is_archived IS NULL)
          GROUP BY q.question_id
        ),
        question_times AS (
          SELECT 
            q.question_id,
            COALESCE(AVG(
              EXTRACT(EPOCH FROM (
                ua.answer_timestamp - COALESCE(
                  prev_answer.prev_timestamp,
                  us.start_timestamp
                )
              ))
            ), 0) as avg_time_seconds
          FROM questions q
          LEFT JOIN user_answers ua ON ua.question_id = q.question_id
          LEFT JOIN filtered_sessions fs ON fs.session_id = ua.session_id
          LEFT JOIN user_sessions us ON us.session_id = ua.session_id
          LEFT JOIN LATERAL (
            SELECT answer_timestamp as prev_timestamp
            FROM user_answers ua2
            JOIN questions q2 ON q2.question_id = ua2.question_id
            WHERE ua2.session_id = ua.session_id
              AND q2.sequence_order < q.sequence_order
            ORDER BY q2.sequence_order DESC
            LIMIT 1
          ) prev_answer ON true
          WHERE q.quiz_id = $1 
            AND (q.is_archived = false OR q.is_archived IS NULL)
          GROUP BY q.question_id
        )
        SELECT 
          q.question_id,
          q.question_text,
          q.interaction_type,
          COALESCE(qv.views, 0) as views,
          COALESCE(qa.answers, 0) as answers,
          CASE 
            WHEN COALESCE(qv.views, 0) = 0 THEN 0
            ELSE ROUND((COALESCE(qa.answers, 0)::numeric / qv.views::numeric * 100), 2)
          END as answer_rate,
          CASE 
            WHEN COALESCE(qv.views, 0) = 0 THEN 0
            ELSE ROUND(((qv.views - COALESCE(qa.answers, 0))::numeric / qv.views::numeric * 100), 2)
          END as drop_rate,
          COALESCE(ROUND(qt.avg_time_seconds::numeric, 2), 0) as avg_time_seconds
        FROM questions q
        LEFT JOIN question_views qv ON qv.question_id = q.question_id
        LEFT JOIN question_answers qa ON qa.question_id = q.question_id
        LEFT JOIN question_times qt ON qt.question_id = q.question_id
        WHERE q.quiz_id = $1 
          AND (q.is_archived = false OR q.is_archived IS NULL)
        ORDER BY q.sequence_order
      `, params);

      console.log(`✅ Question details fetched for quiz ${quizId}: ${result.rows.length} questions`);
      return result.rows;

    } catch (error) {
      console.error('❌ Error fetching question details:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get answer distribution for a specific question
   * @param quizId - Quiz ID
   * @param questionId - Question ID
   * @param userId - ID of the user requesting
   * @param userRole - Role of the user ('user' or 'admin')
   * @param startDate - Optional start date for filtering
   * @param endDate - Optional end date for filtering
   */
  async getAnswerDistribution(
    quizId: string,
    questionId: string,
    userId: number,
    userRole: 'user' | 'admin',
    startDate?: Date,
    endDate?: Date
  ): Promise<any[]> {
    const client = await this.pool.connect();
    
    try {
      await this.validateQuizAccess(client, quizId, userId, userRole);

      // Build date filter conditions
      const dateConditions: string[] = [];
      const params: any[] = [parseInt(quizId), parseInt(questionId)];

      if (startDate) {
        dateConditions.push(`us.start_timestamp >= $${params.length + 1}`);
        params.push(startDate);
      }

      if (endDate) {
        const endDateInclusive = new Date(endDate);
        endDateInclusive.setHours(23, 59, 59, 999);
        dateConditions.push(`us.start_timestamp <= $${params.length + 1}`);
        params.push(endDateInclusive);
      }

      const dateFilterSql = dateConditions.length > 0 
        ? `AND ${dateConditions.join(' AND ')}` 
        : '';

      const result = await client.query(`
        WITH filtered_answers AS (
          SELECT ua.answer_id, ua.selected_option_id
          FROM user_answers ua
          JOIN user_sessions us ON us.session_id = ua.session_id
          WHERE ua.question_id = $2 ${dateFilterSql}
        ),
        total_answers AS (
          SELECT COUNT(*) as total
          FROM filtered_answers
        )
        SELECT 
          ao.option_id,
          ao.option_text,
          COUNT(fa.answer_id) as selection_count,
          CASE 
            WHEN (SELECT total FROM total_answers) = 0 THEN 0
            ELSE ROUND(
              (COUNT(fa.answer_id)::numeric / (SELECT total FROM total_answers)::numeric * 100), 
              2
            )
          END as percentage
        FROM answer_options ao
        LEFT JOIN filtered_answers fa ON fa.selected_option_id = ao.option_id
        WHERE ao.question_id = $2
          AND (ao.is_archived = false OR ao.is_archived IS NULL)
        GROUP BY ao.option_id, ao.option_text
        ORDER BY selection_count DESC
      `, params);

      console.log(`✅ Answer distribution fetched for question ${questionId}: ${result.rows.length} options`);
      return result.rows;

    } catch (error) {
      console.error('❌ Error fetching answer distribution:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get daily activity (sessions and completions per day)
   * @param quizId - Quiz ID
   * @param userId - ID of the user requesting
   * @param userRole - Role of the user ('user' or 'admin')
   * @param startDate - Optional start date (defaults to 30 days ago)
   * @param endDate - Optional end date (defaults to today)
   * @param days - Number of days to show if no dates provided (default: 30)
   */
  async getDailyActivity(
    quizId: string,
    userId: number,
    userRole: 'user' | 'admin',
    startDate?: Date,
    endDate?: Date,
    days: number = 30
  ): Promise<any[]> {
    const client = await this.pool.connect();
    
    try {
      await this.validateQuizAccess(client, quizId, userId, userRole);

      // If no dates provided, default to last N days
      let finalStartDate = startDate;
      let finalEndDate = endDate;

      if (!finalStartDate || !finalEndDate) {
        finalEndDate = new Date();
        finalStartDate = new Date();
        finalStartDate.setDate(finalStartDate.getDate() - days);
        finalStartDate.setHours(0, 0, 0, 0);
        finalEndDate.setHours(23, 59, 59, 999);
      }

      const dateFilter = this.buildDateFilter(finalStartDate, finalEndDate, 1);

      const result = await client.query(`
        SELECT 
          DATE(us.start_timestamp) as date,
          COUNT(us.session_id) as sessions,
          COUNT(CASE WHEN us.is_completed = true THEN 1 END) as completions
        FROM user_sessions us
        WHERE us.quiz_id = $1 ${dateFilter.sql}
        GROUP BY DATE(us.start_timestamp)
        ORDER BY DATE(us.start_timestamp) ASC
      `, [parseInt(quizId), ...dateFilter.params]);

      console.log(`✅ Daily activity fetched for quiz ${quizId}: ${result.rows.length} days`);
      return result.rows;

    } catch (error) {
      console.error('❌ Error fetching daily activity:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}
