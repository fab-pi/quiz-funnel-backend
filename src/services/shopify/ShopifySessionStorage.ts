import { Pool } from 'pg';
import { Session } from '@shopify/shopify-api';
import { SessionStorage } from '@shopify/shopify-app-session-storage';

/**
 * Custom session storage implementation for Shopify sessions
 * Stores sessions in the shops table using the session columns added in migration 022
 */
export class ShopifySessionStorage implements SessionStorage {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Store a session in the database
   * Uses session.shop for database lookup (NOT extracted from session.id)
   */
  async storeSession(session: Session): Promise<boolean> {
    const client = await this.pool.connect();
    
    try {
      // Use session.shop for database lookup (not extracted from session.id)
      const shopDomain = session.shop;
      
      // Check if shop exists
      const shopResult = await client.query(
        'SELECT shop_id FROM shops WHERE shop_domain = $1',
        [shopDomain]
      );

      if (shopResult.rows.length === 0) {
        console.warn(`⚠️ Shop not found for session storage: ${shopDomain}`);
        return false;
      }

      // Store session data in shops table
      // Use database transaction for atomicity
      await client.query('BEGIN');

      try {
        await client.query(
          `UPDATE shops 
           SET session_id = $1,
               session_expires = $2,
               session_scope = $3,
               session_state = $4,
               session_is_online = $5,
               access_token = $6,  -- Also update access_token for backward compatibility
               scope = $7,
               updated_at = CURRENT_TIMESTAMP
           WHERE shop_domain = $8`,
          [
            session.id,
            session.expires || null,
            session.scope || null,
            session.state || null,
            session.isOnline || false,
            session.accessToken,
            session.scope || null,
            shopDomain,
          ]
        );

        await client.query('COMMIT');
        console.log(`✅ Session stored for shop: ${shopDomain} (session ID: ${session.id})`);
        return true;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    } catch (error: any) {
      console.error('❌ Error storing session:', error);
      // Don't throw - return false to let Shopify API handle failures
      return false;
    } finally {
      client.release();
    }
  }

  /**
   * Load a session from the database by session ID
   */
  async loadSession(id: string): Promise<Session | undefined> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        `SELECT session_id, session_expires, session_scope, session_state, 
                session_is_online, access_token, shop_domain
         FROM shops 
         WHERE session_id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return undefined;
      }

      const row = result.rows[0];

      // Check expiration (for online sessions)
      if (row.session_expires) {
        const expires = new Date(row.session_expires);
        if (expires < new Date()) {
          console.warn(`⚠️ Session expired: ${id}`);
          return undefined;
        }
      }

      // Construct Session object
      // Note: Session constructor may require specific fields - verify with Shopify API docs
      const session = new Session({
        id: row.session_id,
        shop: row.shop_domain,
        state: row.session_state || undefined,
        isOnline: row.session_is_online || false,
        scope: row.session_scope || '',
        expires: row.session_expires ? new Date(row.session_expires) : undefined,
        accessToken: row.access_token,
      });

      return session;
    } catch (error: any) {
      console.error(`❌ Error loading session ${id}:`, error);
      return undefined;
    } finally {
      client.release();
    }
  }

  /**
   * Delete a session from the database
   * Keeps access_token column (for backward compatibility)
   */
  async deleteSession(id: string): Promise<boolean> {
    const client = await this.pool.connect();

    try {
      await client.query(
        `UPDATE shops 
         SET session_id = NULL,
             session_expires = NULL,
             session_scope = NULL,
             session_state = NULL,
             session_is_online = false,
             updated_at = CURRENT_TIMESTAMP
         WHERE session_id = $1`,
        [id]
      );

      console.log(`✅ Session deleted: ${id}`);
      return true;
    } catch (error: any) {
      console.error(`❌ Error deleting session ${id}:`, error);
      return false;
    } finally {
      client.release();
    }
  }

  /**
   * Delete multiple sessions from the database
   */
  async deleteSessions(ids: string[]): Promise<boolean> {
    if (ids.length === 0) {
      return true;
    }

    const client = await this.pool.connect();

    try {
      // Use parameterized query with array
      await client.query(
        `UPDATE shops 
         SET session_id = NULL,
             session_expires = NULL,
             session_scope = NULL,
             session_state = NULL,
             session_is_online = false,
             updated_at = CURRENT_TIMESTAMP
         WHERE session_id = ANY($1)`,
        [ids]
      );

      console.log(`✅ Deleted ${ids.length} sessions`);
      return true;
    } catch (error: any) {
      console.error(`❌ Error deleting sessions:`, error);
      return false;
    } finally {
      client.release();
    }
  }

  /**
   * Find all sessions for a given shop
   * Required by SessionStorage interface
   */
  async findSessionsByShop(shop: string): Promise<Session[]> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        `SELECT session_id, session_expires, session_scope, session_state, 
                session_is_online, access_token, shop_domain
         FROM shops 
         WHERE shop_domain = $1 AND session_id IS NOT NULL`,
        [shop]
      );

      if (result.rows.length === 0) {
        return [];
      }

      const sessions: Session[] = [];

      for (const row of result.rows) {
        // Check expiration (for online sessions)
        if (row.session_expires) {
          const expires = new Date(row.session_expires);
          if (expires < new Date()) {
            // Skip expired sessions
            continue;
          }
        }

        // Construct Session object
        const session = new Session({
          id: row.session_id,
          shop: row.shop_domain,
          state: row.session_state || undefined,
          isOnline: row.session_is_online || false,
          scope: row.session_scope || '',
          expires: row.session_expires ? new Date(row.session_expires) : undefined,
          accessToken: row.access_token,
        });

        sessions.push(session);
      }

      return sessions;
    } catch (error: any) {
      console.error(`❌ Error finding sessions for shop ${shop}:`, error);
      return [];
    } finally {
      client.release();
    }
  }
}

