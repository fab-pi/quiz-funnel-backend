import { Pool } from 'pg';
import { BaseService } from '../BaseService';
import { ShopifyService } from './ShopifyService';
import { PLANS, getPlanById } from '../../config/plans';
import { ShopSubscription, ShopSubscriptionDatabaseRow, SubscriptionStatus } from '../../types/shopify';

/**
 * Shopify Billing Service
 * Handles app subscription creation, cancellation, and management
 */
export class ShopifyBillingService extends BaseService {
  private shopifyService: ShopifyService;

  constructor(pool: Pool, shopifyService: ShopifyService) {
    super(pool);
    this.shopifyService = shopifyService;
  }

  /**
   * Create a new app subscription with selected plan
   * @param shopDomain - Shop domain (e.g., mystore.myshopify.com)
   * @param planId - Plan ID (starter, advanced, scaling)
   * @returns Confirmation URL and subscription GID
   */
  async createSubscription(
    shopDomain: string,
    planId: string
  ): Promise<{ confirmationUrl: string; subscriptionGid: string; status: string; currentPeriodEnd: Date | null }> {
    const plan = getPlanById(planId);
    if (!plan) {
      throw new Error(`Invalid plan ID: ${planId}`);
    }

    const client = await this.pool.connect();
    try {
      // Check if shop already has an active subscription
      const existingSubscription = await this.getActiveSubscriptionByShopDomain(shopDomain);
      if (existingSubscription && (existingSubscription.status === 'ACTIVE' || existingSubscription.status === 'TRIAL')) {
        // If upgrading to a different plan, cancel the existing subscription first
        if (existingSubscription.planId !== planId) {
          console.log(`🔄 Upgrading from ${existingSubscription.planId} to ${planId}, canceling existing subscription...`);
          try {
            await this.cancelSubscription(shopDomain, existingSubscription.subscriptionGid);
            console.log(`✅ Existing subscription canceled, proceeding with new subscription creation`);
          } catch (cancelError: any) {
            console.error('⚠️ Error canceling existing subscription during upgrade:', cancelError);
            // Continue anyway - Shopify will handle the conflict
          }
        } else {
          // Same plan - no need to create a new subscription
          throw new Error('You are already subscribed to this plan.');
        }
      }

      // Create GraphQL client
      const graphqlClient = await this.shopifyService.createGraphQLClient(shopDomain);

      // Build return URL for confirmation
      const appUrl = process.env.SHOPIFY_APP_URL || process.env.FRONTEND_URL || 'https://quiz.try-directquiz.com';
      const returnUrl = `${appUrl}/shopify/billing/confirm`;

      // GraphQL mutation for creating subscription
      const mutation = `
        mutation appSubscriptionCreate($name: String!, $trialDays: Int!, $returnUrl: URL!, $lineItems: [AppSubscriptionLineItemInput!]!, $test: Boolean!) {
          appSubscriptionCreate(
            name: $name
            trialDays: $trialDays
            returnUrl: $returnUrl
            lineItems: $lineItems
            test: $test
          ) {
            appSubscription {
              id
              status
              currentPeriodEnd
              trialDays
            }
            confirmationUrl
            userErrors {
              field
              message
            }
          }
        }
      `;

      const variables = {
        name: `${plan.name} Plan`,
        trialDays: plan.trialDays,
        returnUrl: returnUrl,
        test: true, //process.env.NODE_ENV !== 'production',
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: {
                  amount: plan.price,
                  currencyCode: 'USD',
                },
                interval: 'EVERY_30_DAYS',
              },
            },
          },
        ],
      };

      console.log(`🔄 Creating subscription for shop ${shopDomain} with plan ${planId}...`);

      const response = await graphqlClient.query({
        data: {
          query: mutation,
          variables: variables,
        },
      }) as {
        body: {
          data: {
            appSubscriptionCreate: {
              appSubscription: {
                id: string;
                status: string;
                currentPeriodEnd: string | null;
                trialDays: number;
              } | null;
              confirmationUrl: string | null;
              userErrors: Array<{ field: string[]; message: string }>;
            };
          };
        };
      };

      if (!response || !response.body || !response.body.data) {
        throw new Error('Invalid response from Shopify appSubscriptionCreate mutation');
      }

      const result = response.body.data.appSubscriptionCreate;

      // Check for user errors
      if (result.userErrors && result.userErrors.length > 0) {
        const errorMessages = result.userErrors.map((e) => e.message).join(', ');
        throw new Error(`Failed to create subscription: ${errorMessages}`);
      }

      if (!result.appSubscription || !result.confirmationUrl) {
        throw new Error('Failed to create subscription: Missing appSubscription or confirmationUrl');
      }

      const subscriptionGid = result.appSubscription.id;
      const status = result.appSubscription.status;
      const currentPeriodEnd = result.appSubscription.currentPeriodEnd
        ? new Date(result.appSubscription.currentPeriodEnd)
        : null;

      // Calculate trial end date
      const trialEndsAt = result.appSubscription.trialDays
        ? new Date(Date.now() + result.appSubscription.trialDays * 24 * 60 * 60 * 1000)
        : null;

      // Get shop_id from database
      const shopResult = await client.query('SELECT shop_id FROM shops WHERE shop_domain = $1', [shopDomain]);
      if (shopResult.rows.length === 0) {
        throw new Error(`Shop not found: ${shopDomain}`);
      }
      const shopId = shopResult.rows[0].shop_id;

      // Store subscription in database (status will be updated via webhook when approved)
      await client.query(
        `INSERT INTO shop_subscriptions (
          shop_id, plan_id, subscription_gid, status, trial_days, trial_ends_at, 
          is_trial, current_period_end
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (subscription_gid) 
        DO UPDATE SET 
          status = EXCLUDED.status,
          trial_ends_at = EXCLUDED.trial_ends_at,
          is_trial = EXCLUDED.is_trial,
          current_period_end = EXCLUDED.current_period_end,
          updated_at = CURRENT_TIMESTAMP`,
        [
          shopId,
          planId,
          subscriptionGid,
          status,
          plan.trialDays,
          trialEndsAt,
          true, // is_trial
          currentPeriodEnd,
        ]
      );

      console.log(`✅ Subscription created for shop ${shopDomain}: ${subscriptionGid}`);
      console.log(`   Status: ${status}`);
      console.log(`   Confirmation URL: ${result.confirmationUrl}`);

      return {
        confirmationUrl: result.confirmationUrl,
        subscriptionGid: subscriptionGid,
        status: status,
        currentPeriodEnd: currentPeriodEnd,
      };
    } catch (error: any) {
      console.error(`❌ Error creating subscription for shop ${shopDomain}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Cancel an active subscription
   * @param shopDomain - Shop domain
   * @param subscriptionGid - Subscription GID
   */
  async cancelSubscription(
    shopDomain: string,
    subscriptionGid: string
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      const graphqlClient = await this.shopifyService.createGraphQLClient(shopDomain);

      const mutation = `
        mutation appSubscriptionCancel($id: ID!) {
          appSubscriptionCancel(id: $id) {
            appSubscription {
              id
              status
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const variables = {
        id: subscriptionGid,
      };

      console.log(`🔄 Cancelling subscription ${subscriptionGid} for shop ${shopDomain}...`);

      const response = await graphqlClient.query({
        data: {
          query: mutation,
          variables: variables,
        },
      }) as {
        body: {
          data: {
            appSubscriptionCancel: {
              appSubscription: {
                id: string;
                status: string;
              } | null;
              userErrors: Array<{ field: string[]; message: string }>;
            };
          };
        };
      };

      if (!response || !response.body || !response.body.data) {
        throw new Error('Invalid response from Shopify appSubscriptionCancel mutation');
      }

      const result = response.body.data.appSubscriptionCancel;

      if (result.userErrors && result.userErrors.length > 0) {
        const errorMessages = result.userErrors.map((e) => e.message).join(', ');
        throw new Error(`Failed to cancel subscription: ${errorMessages}`);
      }

      // Update subscription status in database
      await client.query(
        `UPDATE shop_subscriptions 
         SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP 
         WHERE subscription_gid = $1`,
        [subscriptionGid]
      );

      console.log(`✅ Subscription cancelled: ${subscriptionGid}`);
    } catch (error: any) {
      console.error(`❌ Error cancelling subscription ${subscriptionGid}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get active subscription for a shop
   * @param shopDomain - Shop domain
   * @returns Active subscription or null
   */
  async getActiveSubscriptionByShopDomain(shopDomain: string): Promise<ShopSubscription | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<ShopSubscriptionDatabaseRow>(
        `SELECT s.* FROM shop_subscriptions s
         JOIN shops sh ON s.shop_id = sh.shop_id
         WHERE sh.shop_domain = $1 
         AND s.status IN ('ACTIVE', 'TRIAL')
         ORDER BY s.created_at DESC
         LIMIT 1`,
        [shopDomain]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapSubscriptionFromDatabase(result.rows[0]);
    } catch (error) {
      console.error(`❌ Error getting active subscription for shop ${shopDomain}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get active subscription by shop_id
   * @param shopId - Shop ID
   * @returns Active subscription or null
   */
  async getActiveSubscriptionByShopId(shopId: number): Promise<ShopSubscription | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<ShopSubscriptionDatabaseRow>(
        `SELECT * FROM shop_subscriptions
         WHERE shop_id = $1 
         AND status IN ('ACTIVE', 'TRIAL')
         ORDER BY created_at DESC
         LIMIT 1`,
        [shopId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapSubscriptionFromDatabase(result.rows[0]);
    } catch (error) {
      console.error(`❌ Error getting active subscription for shop ${shopId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get any subscription (including PENDING) for a shop
   * @param shopDomain - Shop domain
   * @returns Subscription or null
   */
  async getSubscriptionByShopDomain(shopDomain: string): Promise<ShopSubscription | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<ShopSubscriptionDatabaseRow>(
        `SELECT s.* FROM shop_subscriptions s
         JOIN shops sh ON s.shop_id = sh.shop_id
         WHERE sh.shop_domain = $1 
         ORDER BY s.created_at DESC
         LIMIT 1`,
        [shopDomain]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapSubscriptionFromDatabase(result.rows[0]);
    } catch (error) {
      console.error(`❌ Error getting subscription for shop ${shopDomain}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Sync subscription status from Shopify GraphQL API
   * Used when DB status is PENDING but we need to verify actual status from Shopify
   * @param shopDomain - Shop domain
   * @returns Updated subscription or null if no active subscription found
   */
  async syncSubscriptionStatusFromShopify(shopDomain: string): Promise<ShopSubscription | null> {
    const client = await this.pool.connect();
    try {
      // Get shop_id
      const shopResult = await client.query(
        'SELECT shop_id FROM shops WHERE shop_domain = $1',
        [shopDomain]
      );

      if (shopResult.rows.length === 0) {
        console.error(`❌ Shop not found: ${shopDomain}`);
        return null;
      }

      const shopId = shopResult.rows[0].shop_id;

      // Query Shopify GraphQL API for current app installation subscriptions
      const graphqlClient = await this.shopifyService.createGraphQLClient(shopDomain);

      const query = `
        query currentAppInstallation {
          currentAppInstallation {
            activeSubscriptions {
              id
              status
              currentPeriodEnd
              trialDays
              createdAt
              lineItems {
                id
                plan {
                  ... on AppRecurringPricing {
                    price {
                      amount
                      currencyCode
                    }
                    interval
                  }
                }
              }
            }
          }
        }
      `;

      const response = await graphqlClient.query({
        data: {
          query: query,
        },
      }) as {
        body: {
          data: {
            currentAppInstallation: {
              activeSubscriptions: Array<{
                id: string;
                status: string;
                currentPeriodEnd: string | null;
                trialDays: number;
                createdAt: string;
                lineItems: Array<{
                  id: string;
                  plan: {
                    price: {
                      amount: number;
                      currencyCode: string;
                    };
                    interval: string;
                  };
                }>;
              }>;
            } | null;
          };
        };
      };

      if (!response || !response.body || !response.body.data) {
        console.error('❌ Invalid response from Shopify currentAppInstallation query');
        return null;
      }

      const installation = response.body.data.currentAppInstallation;
      if (!installation || !installation.activeSubscriptions || installation.activeSubscriptions.length === 0) {
        console.log(`ℹ️ No active subscriptions found in Shopify for shop ${shopDomain}`);
        return null;
      }

      // Get the most recent active subscription
      const activeSubscription = installation.activeSubscriptions[0];
      const subscriptionGid = activeSubscription.id;
      const status = activeSubscription.status; // ACTIVE, TRIAL, etc.
      const currentPeriodEnd = activeSubscription.currentPeriodEnd
        ? new Date(activeSubscription.currentPeriodEnd)
        : null;
      const trialDays = activeSubscription.trialDays || 0;

      // Calculate trial end date
      const trialEndsAt = trialDays > 0 && activeSubscription.createdAt
        ? new Date(new Date(activeSubscription.createdAt).getTime() + trialDays * 24 * 60 * 60 * 1000)
        : null;

      const isTrial = trialDays > 0 && trialEndsAt && new Date() < trialEndsAt;

      // Try to match with existing subscription in DB by subscription_gid
      const existingResult = await client.query<ShopSubscriptionDatabaseRow>(
        'SELECT * FROM shop_subscriptions WHERE subscription_gid = $1',
        [subscriptionGid]
      );

      let planId: string;
      if (existingResult.rows.length > 0) {
        // Use existing plan_id
        planId = existingResult.rows[0].plan_id;
      } else {
        // Try to determine plan_id from price (fallback)
        const price = activeSubscription.lineItems[0]?.plan?.price?.amount || 0;
        const { PLANS } = await import('../../config/plans');
        const matchingPlan = PLANS.find(p => Math.abs(p.price - price) < 0.01);
        planId = matchingPlan?.id || 'starter'; // Default to starter if can't determine
        console.log(`⚠️ Subscription ${subscriptionGid} not found in DB, inferring plan_id: ${planId} from price ${price}`);
      }

      // Update or insert subscription in database
      await client.query(
        `INSERT INTO shop_subscriptions (
          shop_id, plan_id, subscription_gid, status, trial_days, trial_ends_at, 
          is_trial, current_period_end
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (subscription_gid) 
        DO UPDATE SET 
          status = EXCLUDED.status,
          trial_days = EXCLUDED.trial_days,
          trial_ends_at = EXCLUDED.trial_ends_at,
          is_trial = EXCLUDED.is_trial,
          current_period_end = EXCLUDED.current_period_end,
          updated_at = CURRENT_TIMESTAMP`,
        [
          shopId,
          planId,
          subscriptionGid,
          status,
          trialDays,
          trialEndsAt,
          isTrial,
          currentPeriodEnd,
        ]
      );

      console.log(`✅ Subscription status synced from Shopify for shop ${shopDomain}: ${subscriptionGid} (status: ${status})`);

      // Return updated subscription
      const updatedResult = await client.query<ShopSubscriptionDatabaseRow>(
        'SELECT * FROM shop_subscriptions WHERE subscription_gid = $1',
        [subscriptionGid]
      );

      if (updatedResult.rows.length === 0) {
        return null;
      }

      return this.mapSubscriptionFromDatabase(updatedResult.rows[0]);
    } catch (error: any) {
      console.error(`❌ Error syncing subscription status from Shopify for shop ${shopDomain}:`, error);
      // Don't throw - return null so endpoint can fall back to DB status
      return null;
    } finally {
      client.release();
    }
  }

  /**
   * Map database row to ShopSubscription interface
   */
  private mapSubscriptionFromDatabase(row: ShopSubscriptionDatabaseRow): ShopSubscription {
    return {
      subscriptionId: row.subscription_id,
      shopId: row.shop_id,
      planId: row.plan_id,
      subscriptionGid: row.subscription_gid,
      status: row.status,
      trialDays: row.trial_days,
      trialEndsAt: row.trial_ends_at,
      isTrial: row.is_trial,
      currentPeriodEnd: row.current_period_end,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

