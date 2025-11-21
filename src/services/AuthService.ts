import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { BaseService } from './BaseService';
import { TokenService } from './TokenService';
import { EmailService } from './EmailService';
import {
  RegisterRequest,
  LoginRequest,
  TokenPayload,
  User
} from '../types';

export class AuthService extends BaseService {
  private readonly JWT_SECRET: string;
  private readonly JWT_EXPIRES_IN = '15m'; // Access token: 15 minutes
  private readonly REFRESH_EXPIRES_IN = '7d'; // Refresh token: 7 days
  private tokenService: TokenService;
  private emailService: EmailService;

  constructor(pool: Pool) {
    super(pool);
    
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is not set');
    }
    if (secret.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters long');
    }
    
    this.JWT_SECRET = secret;
    this.tokenService = new TokenService(pool);
    this.emailService = new EmailService();
  }

  /**
   * Register a new user
   */
  async register(data: RegisterRequest): Promise<{ user: User; tokens: { accessToken: string; refreshToken: string; expiresIn: number } }> {
    const client = await this.pool.connect();
    
    try {
      // Check if email already exists
      const existingUser = await client.query(
        'SELECT user_id FROM users WHERE email = $1',
        [data.email.toLowerCase().trim()]
      );

      if (existingUser.rows.length > 0) {
        throw new Error('Email already registered');
      }

      // Hash password
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(data.password, saltRounds);

      // Create user
      const result = await client.query(
        `INSERT INTO users (email, password_hash, full_name, role, email_verified)
         VALUES ($1, $2, $3, 'user', false)
         RETURNING user_id, email, full_name, role, is_active, email_verified, created_at, updated_at`,
        [data.email.toLowerCase().trim(), passwordHash, data.fullName.trim()]
      );

      const dbUser = result.rows[0];
      const user: User = {
        userId: dbUser.user_id,
        email: dbUser.email,
        fullName: dbUser.full_name,
        role: dbUser.role,
        isActive: dbUser.is_active,
        emailVerified: dbUser.email_verified,
        createdAt: dbUser.created_at,
        updatedAt: dbUser.updated_at
      };

      // Generate email verification token
      const verificationToken = await this.tokenService.generateToken(
        user.userId,
        'email_verification',
        24 // 24 hours
      );

      // Send verification email
      try {
        await this.emailService.sendVerificationEmail(
          user.email,
          verificationToken,
          user.fullName
        );
      } catch (emailError) {
        console.error('⚠️ Failed to send verification email, but user was created:', emailError);
        // Don't throw - user is created, they can request verification email later
      }

      // Generate tokens
      const tokens = await this.generateTokens(user);

      console.log(`✅ User registered: ${user.email} (ID: ${user.userId})`);
      return { user, tokens };
    } catch (error: any) {
      console.error('❌ Registration error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Login user
   */
  async login(credentials: LoginRequest): Promise<{ user: User; tokens: { accessToken: string; refreshToken: string; expiresIn: number } }> {
    const client = await this.pool.connect();
    
    try {
      // Find user
      const result = await client.query(
        `SELECT user_id, email, password_hash, full_name, role, is_active, email_verified
         FROM users WHERE email = $1`,
        [credentials.email.toLowerCase().trim()]
      );

      if (result.rows.length === 0) {
        throw new Error('Invalid email or password');
      }

      const dbUser = result.rows[0];

      if (!dbUser.is_active) {
        throw new Error('Account is deactivated');
      }

      // Verify password
      const isValid = await bcrypt.compare(credentials.password, dbUser.password_hash);
      if (!isValid) {
        throw new Error('Invalid email or password');
      }

      const user: User = {
        userId: dbUser.user_id,
        email: dbUser.email,
        fullName: dbUser.full_name,
        role: dbUser.role,
        isActive: dbUser.is_active,
        emailVerified: dbUser.email_verified,
        createdAt: new Date(), // Will be fetched if needed
        updatedAt: new Date()
      };

      // Generate tokens
      const tokens = await this.generateTokens(user);

      console.log(`✅ User logged in: ${user.email} (ID: ${user.userId})`);
      return { user, tokens };
    } catch (error: any) {
      console.error('❌ Login error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Generate access and refresh tokens
   */
  private async generateTokens(user: User): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const payload: TokenPayload = {
      userId: user.userId,
      email: user.email,
      role: user.role
    };

    // Generate access token (short-lived)
    const accessToken = jwt.sign(payload, this.JWT_SECRET, {
      expiresIn: this.JWT_EXPIRES_IN
    });

    // Generate refresh token (long-lived, stored in DB)
    const refreshToken = crypto.randomBytes(64).toString('hex');
    const refreshTokenHash = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [user.userId, refreshTokenHash, expiresAt]
      );
    } finally {
      client.release();
    }

    // Calculate expiresIn in seconds (15 minutes = 900 seconds)
    const expiresIn = 15 * 60;

    return {
      accessToken,
      refreshToken,
      expiresIn
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<string> {
    const client = await this.pool.connect();
    
    try {
      console.log('🔄 Attempting to refresh access token...');
      
      // Hash the refresh token
      const tokenHash = crypto
        .createHash('sha256')
        .update(refreshToken)
        .digest('hex');

      // Verify token in database
      const result = await client.query(
        `SELECT rt.user_id, rt.expires_at, rt.revoked_at, rt.created_at,
                u.email, u.role, u.is_active
         FROM refresh_tokens rt
         JOIN users u ON rt.user_id = u.user_id
         WHERE rt.token_hash = $1`,
        [tokenHash]
      );

      if (result.rows.length === 0) {
        console.log('❌ Refresh token not found in database');
        throw new Error('Invalid refresh token');
      }

      const tokenData = result.rows[0];
      const now = new Date();
      const expiresAt = new Date(tokenData.expires_at);
      const timeUntilExpiry = Math.round((expiresAt.getTime() - now.getTime()) / 1000 / 60);

      console.log(`   📋 Refresh token found for user ${tokenData.user_id} (${tokenData.email})`);
      console.log(`   ⏰ Refresh token expires at: ${expiresAt.toISOString()}`);
      console.log(`   ⏰ Current time: ${now.toISOString()}`);
      console.log(`   ⏰ Time until expiry: ${timeUntilExpiry} minutes`);

      if (tokenData.revoked_at) {
        console.log(`   ❌ Refresh token was revoked at: ${new Date(tokenData.revoked_at).toISOString()}`);
        throw new Error('Refresh token has been revoked');
      }

      if (expiresAt < now) {
        console.log(`   ❌ Refresh token expired ${Math.abs(timeUntilExpiry)} minutes ago`);
        throw new Error('Refresh token has expired');
      }

      if (!tokenData.is_active) {
        console.log(`   ❌ User account is deactivated`);
        throw new Error('User account is deactivated');
      }

      // Generate new access token
      const payload: TokenPayload = {
        userId: tokenData.user_id,
        email: tokenData.email,
        role: tokenData.role
      };

      const accessToken = jwt.sign(payload, this.JWT_SECRET, {
        expiresIn: this.JWT_EXPIRES_IN
      });

      // Decode to get expiration info
      const decoded = jwt.decode(accessToken) as any;
      const tokenExp = decoded?.exp ? new Date(decoded.exp * 1000) : null;
      
      console.log(`✅ Access token refreshed for user ${tokenData.user_id}`);
      console.log(`   ⏰ New access token expires at: ${tokenExp ? tokenExp.toISOString() : 'unknown'}`);
      console.log(`   ⏰ New access token expires in: ${this.JWT_EXPIRES_IN} (15 minutes)`);
      
      return accessToken;
    } catch (error: any) {
      console.error('❌ Token refresh error:', error);
      console.error(`   📝 Error type: ${error.name || 'Unknown'}`);
      console.error(`   📝 Error message: ${error.message}`);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Logout user (revoke refresh token)
   */
  async logout(refreshToken: string): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      const tokenHash = crypto
        .createHash('sha256')
        .update(refreshToken)
        .digest('hex');

      const result = await client.query(
        `UPDATE refresh_tokens 
         SET revoked_at = CURRENT_TIMESTAMP
         WHERE token_hash = $1 AND revoked_at IS NULL
         RETURNING token_id`,
        [tokenHash]
      );

      if (result.rows.length > 0) {
        console.log(`✅ Refresh token revoked (logout successful)`);
      } else {
        console.log(`⚠️ Refresh token not found or already revoked`);
      }
    } catch (error) {
      console.error('❌ Logout error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Request password reset (sends email)
   */
  async requestPasswordReset(email: string): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      // Find user (don't reveal if email exists for security)
      const result = await client.query(
        'SELECT user_id, email, full_name FROM users WHERE email = $1 AND is_active = true',
        [email.toLowerCase().trim()]
      );

      // Always return success (don't reveal if email exists)
      if (result.rows.length === 0) {
        console.log(`⚠️ Password reset requested for non-existent email: ${email}`);
        return;
      }

      const user = result.rows[0];

      // Generate reset token (1 hour expiration)
      const resetToken = await this.tokenService.generateToken(
        user.user_id,
        'password_reset',
        1 // 1 hour
      );

      // Send reset email
      await this.emailService.sendPasswordResetEmail(
        user.email,
        resetToken,
        user.full_name
      );

      console.log(`✅ Password reset email sent to ${email}`);
    } catch (error) {
      console.error('❌ Password reset request error:', error);
      // Don't throw - always return success for security
    } finally {
      client.release();
    }
  }

  /**
   * Reset password using token
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      // Verify token
      const { userId, valid } = await this.tokenService.verifyAndUseToken(
        token,
        'password_reset'
      );

      if (!valid || !userId) {
        throw new Error('Invalid or expired reset token');
      }

      // Hash new password
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(newPassword, saltRounds);

      // Update password
      await client.query(
        'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
        [passwordHash, userId]
      );

      // Revoke all refresh tokens (force re-login)
      await client.query(
        `UPDATE refresh_tokens 
         SET revoked_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId]
      );

      console.log(`✅ Password reset successful for user ${userId}`);
    } catch (error: any) {
      console.error('❌ Password reset error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Verify email using token
   */
  async verifyEmail(token: string): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      const { userId, valid } = await this.tokenService.verifyAndUseToken(
        token,
        'email_verification'
      );

      if (!valid || !userId) {
        throw new Error('Invalid or expired verification token');
      }

      // Mark email as verified
      await client.query(
        'UPDATE users SET email_verified = true, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1',
        [userId]
      );

      console.log(`✅ Email verified for user ${userId}`);
    } catch (error: any) {
      console.error('❌ Email verification error:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

