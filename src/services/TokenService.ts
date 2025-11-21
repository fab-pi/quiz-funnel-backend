import { Pool } from 'pg';
import { BaseService } from './BaseService';
import crypto from 'crypto';

export type TokenType = 'email_verification' | 'password_reset';

export class TokenService extends BaseService {
  constructor(pool: Pool) {
    super(pool);
  }

  /**
   * Generates a secure token and saves it to the database
   * @param userId - User ID who owns the token
   * @param tokenType - Type of token (email_verification or password_reset)
   * @param expiresInHours - Hours until token expires (default: 24)
   * @returns The generated token (plain text)
   */
  async generateToken(
    userId: number,
    tokenType: TokenType,
    expiresInHours: number = 24
  ): Promise<string> {
    const client = await this.pool.connect();
    
    try {
      // Generate secure random token (64 bytes = 128 hex characters)
      const token = crypto.randomBytes(64).toString('hex');
      
      // Calculate expiration time
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + expiresInHours);

      // Save token to database
      await client.query(
        `INSERT INTO email_tokens (user_id, token, token_type, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [userId, token, tokenType, expiresAt]
      );

      console.log(`✅ Generated ${tokenType} token for user ${userId}, expires in ${expiresInHours} hours`);
      return token;
    } catch (error) {
      console.error(`❌ Error generating ${tokenType} token:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Verifies a token and marks it as used (one-time use)
   * @param token - The token to verify
   * @param tokenType - Expected token type
   * @returns Object with userId and valid flag
   */
  async verifyAndUseToken(
    token: string,
    tokenType: TokenType
  ): Promise<{ userId: number; valid: boolean }> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(
        `SELECT user_id, expires_at, used_at
         FROM email_tokens
         WHERE token = $1 AND token_type = $2`,
        [token, tokenType]
      );

      if (result.rows.length === 0) {
        console.log(`⚠️ Token not found: ${tokenType}`);
        return { userId: 0, valid: false };
      }

      const tokenData = result.rows[0];

      // Check if token is expired
      if (new Date(tokenData.expires_at) < new Date()) {
        console.log(`⚠️ Token expired: ${tokenType}`);
        return { userId: tokenData.user_id, valid: false };
      }

      // Check if token was already used
      if (tokenData.used_at) {
        console.log(`⚠️ Token already used: ${tokenType}`);
        return { userId: tokenData.user_id, valid: false };
      }

      // Mark token as used
      await client.query(
        `UPDATE email_tokens 
         SET used_at = CURRENT_TIMESTAMP
         WHERE token = $1`,
        [token]
      );

      console.log(`✅ Token verified and marked as used: ${tokenType} for user ${tokenData.user_id}`);
      return { userId: tokenData.user_id, valid: true };
    } catch (error) {
      console.error(`❌ Error verifying token:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Revokes all tokens of a specific type for a user
   * Useful when user changes password or verifies email
   * @param userId - User ID
   * @param tokenType - Type of tokens to revoke
   */
  async revokeUserTokens(userId: number, tokenType: TokenType): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(
        `UPDATE email_tokens
         SET used_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 
           AND token_type = $2 
           AND used_at IS NULL
         RETURNING token_id`,
        [userId, tokenType]
      );

      console.log(`✅ Revoked ${result.rowCount} ${tokenType} tokens for user ${userId}`);
    } catch (error) {
      console.error(`❌ Error revoking tokens:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Cleans up expired tokens from the database
   * Should be run periodically (e.g., via cron job)
   * @returns Number of tokens deleted
   */
  async cleanupExpiredTokens(): Promise<number> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(
        `DELETE FROM email_tokens
         WHERE expires_at < CURRENT_TIMESTAMP
           AND used_at IS NULL
         RETURNING token_id`
      );

      const deletedCount = result.rowCount || 0;
      console.log(`✅ Cleaned up ${deletedCount} expired email tokens`);
      return deletedCount;
    } catch (error) {
      console.error('❌ Error cleaning up expired tokens:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

