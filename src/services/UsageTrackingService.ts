import { Pool } from 'pg';
import { BaseService } from './BaseService';
import { ShopifyBillingService } from './shopify/ShopifyBillingService';
import { ShopSubscription } from '../types/shopify';
import { getPlanById } from '../config/plans';

/**
 * Usage Tracking Service
 * Tracks billing period usage (sessions, quizzes) and enforces plan limits
 * Usage is tracked per billing period (30 days from subscription start or renewal)
 */
export class UsageTrackingService extends BaseService {
  private billingService: ShopifyBillingService;

  constructor(pool: Pool, billingService: ShopifyBillingService) {
    super(pool);
    this.billingService = billingService;
  }

  /**
   * Calculate the billing period start date based on subscription
   * Returns the first day of the month in which the current billing period starts
   * This ensures compatibility with the shop_usage table constraint (month must be first day)
   * 
   * @param subscription - Shop subscription
   * @returns Date representing the first day of the month for the current billing period
   */
  private getBillingPeriodMonth(subscription: ShopSubscription): Date {
    const now = new Date();
    
    // If we have current_period_end, calculate the current billing period
    if (subscription.currentPeriodEnd) {
      const periodEnd = new Date(subscription.currentPeriodEnd);
      const periodStart = new Date(periodEnd);
      periodStart.setDate(periodStart.getDate() - 30); // Billing period is 30 days
      periodStart.setHours(0, 0, 0, 0);
      
      // If we're still in the current period, use this period's start
      if (now >= periodStart && now <= periodEnd) {
        // Return first day of the month in which period starts
        const monthStart = new Date(periodStart);
        monthStart.setDate(1);
        return monthStart;
      }
      
      // Otherwise, we're in the next period (after current_period_end)
      // Calculate next period start
      const nextPeriodStart = new Date(periodEnd);
      nextPeriodStart.setDate(nextPeriodStart.getDate() + 1);
      nextPeriodStart.setHours(0, 0, 0, 0);
      
      // Return first day of the month in which next period starts
      const monthStart = new Date(nextPeriodStart);
      monthStart.setDate(1);
      return monthStart;
    }
    
    // If no current_period_end, use created_at as starting point
    // Calculate which billing period we're in (each period is 30 days)
    const createdAt = new Date(subscription.createdAt);
    createdAt.setHours(0, 0, 0, 0);
    
    const daysSinceCreation = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
    const periodsSinceCreation = Math.floor(daysSinceCreation / 30);
    const currentPeriodStart = new Date(createdAt);
    currentPeriodStart.setDate(currentPeriodStart.getDate() + (periodsSinceCreation * 30));
    currentPeriodStart.setHours(0, 0, 0, 0);
    
    // Return first day of the month in which current period starts
    const monthStart = new Date(currentPeriodStart);
    monthStart.setDate(1);
    return monthStart;
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
        await this.incrementSessionCount(shopId, subscription);
        return;
      }

      // Get billing period month (first day of month for current billing period)
      const billingPeriodMonth = this.getBillingPeriodMonth(subscription);

      const usageResult = await client.query(
        `SELECT sessions_count FROM shop_usage 
         WHERE shop_id = $1 AND month = $2`,
        [shopId, billingPeriodMonth]
      );

      let currentSessions = 0;
      if (usageResult.rows.length > 0) {
        currentSessions = usageResult.rows[0].sessions_count || 0;
      } else {
        // Create new usage record for this billing period
        await client.query(
          `INSERT INTO shop_usage (shop_id, month, sessions_count, active_quizzes_count)
           VALUES ($1, $2, 0, 0)`,
          [shopId, billingPeriodMonth]
        );
      }

      // Check if limit exceeded
      if (currentSessions >= plan.maxSessions) {
        throw new Error('SESSION_LIMIT_EXCEEDED');
      }

      // Increment session count
      await this.incrementSessionCount(shopId, subscription);
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
   * Increment session count for current billing period
   */
  private async incrementSessionCount(shopId: number, subscription: ShopSubscription): Promise<void> {
    const client = await this.pool.connect();
    try {
      const billingPeriodMonth = this.getBillingPeriodMonth(subscription);

      await client.query(
        `INSERT INTO shop_usage (shop_id, month, sessions_count, active_quizzes_count)
         VALUES ($1, $2, 1, 0)
         ON CONFLICT (shop_id, month)
         DO UPDATE SET 
           sessions_count = shop_usage.sessions_count + 1,
           updated_at = CURRENT_TIMESTAMP`,
        [shopId, billingPeriodMonth]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Get current billing period usage for a shop
   */
  async getMonthlyUsage(shopId: number): Promise<{ sessions: number; activeQuizzes: number }> {
    const client = await this.pool.connect();
    try {
      // Get active subscription to calculate billing period
      const subscription = await this.billingService.getActiveSubscriptionByShopId(shopId);
      if (!subscription) {
        return { sessions: 0, activeQuizzes: 0 };
      }

      const billingPeriodMonth = this.getBillingPeriodMonth(subscription);

      const usageResult = await client.query(
        `SELECT sessions_count, active_quizzes_count 
         FROM shop_usage 
         WHERE shop_id = $1 AND month = $2`,
        [shopId, billingPeriodMonth]
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

