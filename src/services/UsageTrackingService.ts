import { Pool } from 'pg';
import { BaseService } from './BaseService';
import { ShopifyBillingService } from './shopify/ShopifyBillingService';
import { getPlanById } from '../config/plans';

/**
 * Usage Tracking Service
 * Tracks monthly usage (sessions, quizzes) and enforces plan limits
 */
export class UsageTrackingService extends BaseService {
  private billingService: ShopifyBillingService;

  constructor(pool: Pool, billingService: ShopifyBillingService) {
    super(pool);
    this.billingService = billingService;
  }

  /**
   * Track a quiz session start
   * Checks limits and increments usage counter
   * @param shopId - Shop ID
   * @throws Error if limit exceeded
   */
  async trackSession(shopId: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Get active subscription
      const subscription = await this.billingService.getActiveSubscriptionByShopId(shopId);
      if (!subscription) {
        throw new Error('SUBSCRIPTION_REQUIRED');
      }

      // Check if subscription is active or in trial
      if (subscription.status !== 'ACTIVE' && subscription.status !== 'TRIAL') {
        throw new Error('SUBSCRIPTION_INACTIVE');
      }

      // Get plan details
      const plan = getPlanById(subscription.planId);
      if (!plan) {
        throw new Error(`Invalid plan ID: ${subscription.planId}`);
      }

      // If scaling plan (unlimited), skip limit check
      if (plan.maxSessions === null) {
        // Still track usage for analytics
        await this.incrementSessionCount(shopId);
        return;
      }

      // Get or create current month usage record
      const currentMonth = new Date();
      currentMonth.setDate(1); // First day of month
      currentMonth.setHours(0, 0, 0, 0);

      const usageResult = await client.query(
        `SELECT sessions_count FROM shop_usage 
         WHERE shop_id = $1 AND month = $2`,
        [shopId, currentMonth]
      );

      let currentSessions = 0;
      if (usageResult.rows.length > 0) {
        currentSessions = usageResult.rows[0].sessions_count || 0;
      } else {
        // Create new usage record for this month
        await client.query(
          `INSERT INTO shop_usage (shop_id, month, sessions_count, active_quizzes_count)
           VALUES ($1, $2, 0, 0)`,
          [shopId, currentMonth]
        );
      }

      // Check if limit exceeded
      if (currentSessions >= plan.maxSessions) {
        throw new Error('SESSION_LIMIT_EXCEEDED');
      }

      // Increment session count
      await this.incrementSessionCount(shopId);
    } catch (error: any) {
      // Re-throw billing-related errors
      if (error.message === 'SUBSCRIPTION_REQUIRED' || 
          error.message === 'SUBSCRIPTION_INACTIVE' ||
          error.message === 'SESSION_LIMIT_EXCEEDED') {
        throw error;
      }
      console.error(`❌ Error tracking session for shop ${shopId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check if shop can create/activate another quiz
   * @param shopId - Shop ID
   * @throws Error if limit exceeded
   */
  async checkQuizLimit(shopId: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Get active subscription
      const subscription = await this.billingService.getActiveSubscriptionByShopId(shopId);
      if (!subscription) {
        throw new Error('SUBSCRIPTION_REQUIRED');
      }

      // Check if subscription is active or in trial
      if (subscription.status !== 'ACTIVE' && subscription.status !== 'TRIAL') {
        throw new Error('SUBSCRIPTION_INACTIVE');
      }

      // Get plan details
      const plan = getPlanById(subscription.planId);
      if (!plan) {
        throw new Error(`Invalid plan ID: ${subscription.planId}`);
      }

      // If scaling plan (unlimited), skip limit check
      if (plan.maxQuizzes === null) {
        return;
      }

      // Count active quizzes
      const quizzesResult = await client.query(
        `SELECT COUNT(*) as count FROM quizzes 
         WHERE shop_id = $1 AND is_active = true`,
        [shopId]
      );

      const activeQuizzes = parseInt(quizzesResult.rows[0]?.count || '0');

      // Check if limit exceeded
      if (activeQuizzes >= plan.maxQuizzes) {
        throw new Error('QUIZ_LIMIT_EXCEEDED');
      }
    } catch (error: any) {
      // Re-throw billing-related errors
      if (error.message === 'SUBSCRIPTION_REQUIRED' || 
          error.message === 'SUBSCRIPTION_INACTIVE' ||
          error.message === 'QUIZ_LIMIT_EXCEEDED') {
        throw error;
      }
      console.error(`❌ Error checking quiz limit for shop ${shopId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Increment session count for current month
   */
  private async incrementSessionCount(shopId: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      const currentMonth = new Date();
      currentMonth.setDate(1);
      currentMonth.setHours(0, 0, 0, 0);

      await client.query(
        `INSERT INTO shop_usage (shop_id, month, sessions_count, active_quizzes_count)
         VALUES ($1, $2, 1, 0)
         ON CONFLICT (shop_id, month)
         DO UPDATE SET 
           sessions_count = shop_usage.sessions_count + 1,
           updated_at = CURRENT_TIMESTAMP`,
        [shopId, currentMonth]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Get current month usage for a shop
   */
  async getMonthlyUsage(shopId: number): Promise<{ sessions: number; activeQuizzes: number }> {
    const client = await this.pool.connect();
    try {
      const currentMonth = new Date();
      currentMonth.setDate(1);
      currentMonth.setHours(0, 0, 0, 0);

      const usageResult = await client.query(
        `SELECT sessions_count, active_quizzes_count 
         FROM shop_usage 
         WHERE shop_id = $1 AND month = $2`,
        [shopId, currentMonth]
      );

      const usage = usageResult.rows[0] || { sessions_count: 0, active_quizzes_count: 0 };

      // Get current active quizzes count
      const quizzesResult = await client.query(
        `SELECT COUNT(*) as count FROM quizzes 
         WHERE shop_id = $1 AND is_active = true`,
        [shopId]
      );

      return {
        sessions: usage.sessions_count || 0,
        activeQuizzes: parseInt(quizzesResult.rows[0]?.count || '0'),
      };
    } finally {
      client.release();
    }
  }

  /**
   * Check if shop has access (active subscription or in trial)
   */
  async checkAccess(shopId: number): Promise<boolean> {
    try {
      const subscription = await this.billingService.getActiveSubscriptionByShopId(shopId);
      if (!subscription) {
        return false;
      }

      return subscription.status === 'ACTIVE' || subscription.status === 'TRIAL';
    } catch (error) {
      console.error(`❌ Error checking access for shop ${shopId}:`, error);
      return false;
    }
  }
}

