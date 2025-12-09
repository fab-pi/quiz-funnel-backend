import { Pool } from 'pg';
import { BaseService } from './BaseService';

export class AdminService extends BaseService {
  constructor(pool: Pool) {
    super(pool);
  }

  /**
   * Get summary metrics for quizzes
   * @param userId - ID of the user requesting (for filtering, null for Shopify)
   * @param userRole - Role of the user ('user' or 'admin')
   * @param showAll - If true and user is admin, show all quizzes. If false, show only user's/shop's quizzes.
   * @param shopId - ID of the Shopify shop (optional, for Shopify users)
   */
  async getQuizSummaryMetrics(userId: number | null, userRole: 'user' | 'admin', showAll: boolean = false, shopId?: number | null): Promise<any[]> {
    const client = await this.pool.connect();
    
    try {
      console.log(`📊 Fetching quiz summary metrics for user ${userId || 'shopify'} (role: ${userRole}, showAll: ${showAll}, shopId: ${shopId || 'none'})...`);
      
      // Build query with optional user/shop filter
      let whereClause = '';
      let queryParams: any[] = [];

      if (userRole !== 'admin' || !showAll) {
        // Regular users/shops see their own quizzes
        // Admins see their own if showAll is false
        if (shopId !== undefined && shopId !== null) {
          // Shopify user - filter by shop_id
          whereClause = 'WHERE q.shop_id = $1';
          queryParams = [shopId];
        } else if (userId !== null) {
          // Native user - filter by user_id
        whereClause = 'WHERE q.user_id = $1';
        queryParams = [userId];
        } else {
          // No auth - shouldn't happen but handle gracefully
          whereClause = 'WHERE 1 = 0'; // Return no results
        }
      }
      // Admin sees all quizzes when showAll is true (no WHERE clause)
      
      const result = await client.query(`
        SELECT 
          q.quiz_id,
          q.quiz_name,
          q.product_page_url,
          q.quiz_start_url,
          q.is_active,
          q.user_id,
          q.shop_id,
          q.custom_domain,
          q.shopify_page_handle,
          s.shop_domain,
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
        LEFT JOIN shops s ON q.shop_id = s.shop_id AND s.uninstalled_at IS NULL
        ${whereClause}
        GROUP BY q.quiz_id, q.quiz_name, q.product_page_url, q.quiz_start_url, q.is_active, q.user_id, q.shop_id, q.custom_domain, q.shopify_page_handle, s.shop_domain
        ORDER BY q.quiz_id DESC
      `, queryParams);
      
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
