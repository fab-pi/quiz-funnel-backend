import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { AuthService } from '../services/AuthService';
import { TokenService } from '../services/TokenService';
import { EmailService } from '../services/EmailService';
import { authenticate, AuthRequest } from '../middleware/auth';
import { authLimiter, passwordResetLimiter, emailVerificationLimiter } from '../middleware/rateLimiter';
import pool from '../config/db';

const router = Router();
const authService = new AuthService(pool);
const tokenService = new TokenService(pool);
const emailService = new EmailService();

// Debug: Log route definitions
console.log('🔧 Defining auth routes:');
console.log('  - POST /auth/register');
console.log('  - POST /auth/login');
console.log('  - POST /auth/refresh');
console.log('  - POST /auth/logout');
console.log('  - POST /auth/request-password-reset');
console.log('  - POST /auth/reset-password');
console.log('  - POST /auth/verify-email');
console.log('  - POST /auth/resend-verification');

// POST /api/auth/register - Register new user
router.post('/auth/register',
  authLimiter,
  [
    body('email')
      .isEmail()
      .withMessage('Please provide a valid email address')
      .normalizeEmail()
      .trim(),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long')
      .matches(/^(?=.*[A-Za-z])(?=.*\d)/)
      .withMessage('Password must contain at least one letter and one number'),
    body('fullName')
      .trim()
      .notEmpty()
      .withMessage('Full name is required')
      .isLength({ min: 2, max: 255 })
      .withMessage('Full name must be between 2 and 255 characters')
  ],
  async (req: Request, res: Response) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const result = await authService.register(req.body);
      
      res.status(201).json({
        success: true,
        user: result.user,
        tokens: result.tokens,
        message: 'Registration successful. Please check your email to verify your account.'
      });
    } catch (error: any) {
      console.error('❌ Registration error:', error);
      
      // Handle specific errors
      if (error.message === 'Email already registered') {
        return res.status(409).json({
          success: false,
          message: 'Email already registered. Please use a different email or try logging in.'
        });
      }

      res.status(500).json({
        success: false,
        message: error.message || 'Registration failed. Please try again.'
      });
    }
  }
);

// POST /api/auth/login - Login user
router.post('/auth/login',
  authLimiter,
  [
    body('email')
      .isEmail()
      .withMessage('Please provide a valid email address')
      .normalizeEmail()
      .trim(),
    body('password')
      .notEmpty()
      .withMessage('Password is required')
  ],
  async (req: Request, res: Response) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const result = await authService.login(req.body);
      
      res.json({
        success: true,
        user: result.user,
        tokens: result.tokens,
        message: 'Login successful'
      });
    } catch (error: any) {
      console.error('❌ Login error:', error);
      
      // Handle specific errors
      if (error.message === 'Invalid email or password') {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      if (error.message === 'Account is deactivated') {
        return res.status(403).json({
          success: false,
          message: 'Your account has been deactivated. Please contact support.'
        });
      }

      res.status(500).json({
        success: false,
        message: error.message || 'Login failed. Please try again.'
      });
    }
  }
);

// POST /api/auth/refresh - Refresh access token
router.post('/auth/refresh',
  [
    body('refreshToken')
      .notEmpty()
      .withMessage('Refresh token is required')
  ],
  async (req: Request, res: Response) => {
    try {
      console.log('🔄 [Backend] Refresh token request received');
      
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.log('   ❌ [Backend] Validation failed:', errors.array());
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { refreshToken } = req.body;
      console.log('   📝 [Backend] Refresh token provided, length:', refreshToken?.length || 0);
      
      const accessToken = await authService.refreshAccessToken(refreshToken);
      
      // Get token expiration info
      const jwt = require('jsonwebtoken');
      const decoded = jwt.decode(accessToken);
      const expiresIn = decoded?.exp ? decoded.exp - Math.floor(Date.now() / 1000) : null;
      
      console.log('✅ [Backend] Token refresh successful');
      console.log(`   ⏰ [Backend] New access token expires in: ${expiresIn} seconds (${expiresIn ? Math.round(expiresIn / 60) : 'unknown'} minutes)`);
      
      res.json({
        success: true,
        tokens: {
          accessToken,
          refreshToken, // Return same refresh token (not rotating for now)
          expiresIn: expiresIn || 900
        },
        message: 'Token refreshed successfully'
      });
    } catch (error: any) {
      console.error('❌ [Backend] Token refresh error:', error);
      console.error(`   📝 [Backend] Error type: ${error.name || 'Unknown'}`);
      console.error(`   📝 [Backend] Error message: ${error.message}`);
      
      // Handle specific errors
      if (error.message.includes('Invalid') || error.message.includes('expired') || error.message.includes('revoked')) {
        return res.status(401).json({
          success: false,
          message: error.message || 'Invalid or expired refresh token. Please login again.'
        });
      }

      res.status(500).json({
        success: false,
        message: error.message || 'Token refresh failed. Please login again.'
      });
    }
  }
);

// POST /api/auth/logout - Logout user (revoke refresh token)
router.post('/auth/logout',
  [
    body('refreshToken')
      .notEmpty()
      .withMessage('Refresh token is required')
  ],
  async (req: Request, res: Response) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { refreshToken } = req.body;
      await authService.logout(refreshToken);
      
      res.json({
        success: true,
        message: 'Logout successful'
      });
    } catch (error: any) {
      console.error('❌ Logout error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Logout failed'
      });
    }
  }
);

// POST /api/auth/request-password-reset - Request password reset (sends email)
router.post('/auth/request-password-reset',
  passwordResetLimiter,
  [
    body('email')
      .isEmail()
      .withMessage('Please provide a valid email address')
      .normalizeEmail()
      .trim()
  ],
  async (req: Request, res: Response) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      // Always return success (security: don't reveal if email exists)
      await authService.requestPasswordReset(req.body.email);
      
      res.json({
        success: true,
        message: 'If the email exists, a password reset link has been sent.'
      });
    } catch (error: any) {
      console.error('❌ Password reset request error:', error);
      // Always return success for security
      res.json({
        success: true,
        message: 'If the email exists, a password reset link has been sent.'
      });
    }
  }
);

// POST /api/auth/reset-password - Reset password using token
router.post('/auth/reset-password',
  passwordResetLimiter,
  [
    body('token')
      .notEmpty()
      .withMessage('Reset token is required'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long')
      .matches(/^(?=.*[A-Za-z])(?=.*\d)/)
      .withMessage('Password must contain at least one letter and one number')
  ],
  async (req: Request, res: Response) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { token, password } = req.body;
      await authService.resetPassword(token, password);
      
      res.json({
        success: true,
        message: 'Password reset successful. Please login with your new password.'
      });
    } catch (error: any) {
      console.error('❌ Password reset error:', error);
      
      // Handle specific errors
      if (error.message.includes('Invalid') || error.message.includes('expired')) {
        return res.status(400).json({
          success: false,
          message: error.message || 'Invalid or expired reset token. Please request a new password reset.'
        });
      }

      res.status(500).json({
        success: false,
        message: error.message || 'Password reset failed. Please try again.'
      });
    }
  }
);

// POST /api/auth/verify-email - Verify email address using token
router.post('/auth/verify-email',
  [
    body('token')
      .notEmpty()
      .withMessage('Verification token is required')
  ],
  async (req: Request, res: Response) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { token } = req.body;
      await authService.verifyEmail(token);
      
      res.json({
        success: true,
        message: 'Email verified successfully'
      });
    } catch (error: any) {
      console.error('❌ Email verification error:', error);
      
      // Handle specific errors
      if (error.message.includes('Invalid') || error.message.includes('expired')) {
        return res.status(400).json({
          success: false,
          message: error.message || 'Invalid or expired verification token. Please request a new verification email.'
        });
      }

      res.status(500).json({
        success: false,
        message: error.message || 'Email verification failed. Please try again.'
      });
    }
  }
);

// POST /api/auth/resend-verification - Resend email verification (requires authentication)
router.post('/auth/resend-verification',
  emailVerificationLimiter,
  authenticate, // User must be logged in
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;

      // Check if email is already verified
      const client = await pool.connect();
      try {
        const result = await client.query(
          'SELECT email_verified, email, full_name FROM users WHERE user_id = $1',
          [userId]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({
            success: false,
            message: 'User not found'
          });
        }

        const user = result.rows[0];

        if (user.email_verified) {
          return res.status(400).json({
            success: false,
            message: 'Email is already verified'
          });
        }

        // Generate new verification token
        const verificationToken = await tokenService.generateToken(
          userId,
          'email_verification',
          24 // 24 hours
        );

        // Send verification email
        await emailService.sendVerificationEmail(
          user.email,
          verificationToken,
          user.full_name
        );

        res.json({
          success: true,
          message: 'Verification email sent successfully'
        });
      } finally {
        client.release();
      }
    } catch (error: any) {
      console.error('❌ Resend verification error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to send verification email. Please try again.'
      });
    }
  }
);

// POST /api/auth/resend-verification-by-email - Resend email verification by email (no auth required)
router.post('/auth/resend-verification-by-email',
  emailVerificationLimiter,
  [
    body('email')
      .isEmail()
      .withMessage('Valid email address is required')
  ],
  async (req: Request, res: Response) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { email } = req.body;

      // Find user by email
      const client = await pool.connect();
      try {
        const result = await client.query(
          'SELECT user_id, email_verified, email, full_name FROM users WHERE email = $1',
          [email.toLowerCase().trim()]
        );

        if (result.rows.length === 0) {
          // Don't reveal if email exists or not (security)
          return res.json({
            success: true,
            message: 'If an account exists with this email, a verification email has been sent.'
          });
        }

        const user = result.rows[0];

        if (user.email_verified) {
          return res.json({
            success: true,
            message: 'Email is already verified. You can login to your account.'
          });
        }

        // Generate new verification token
        const verificationToken = await tokenService.generateToken(
          user.user_id,
          'email_verification',
          24 // 24 hours
        );

        console.log(`📧 Attempting to send verification email to ${user.email} for user ${user.user_id}`);

        // Send verification email
        try {
          await emailService.sendVerificationEmail(
            user.email,
            verificationToken,
            user.full_name
          );
          console.log(`✅ Verification email sent successfully to ${user.email}`);
        } catch (emailError: any) {
          console.error(`❌ Failed to send verification email to ${user.email}:`, emailError);
          // Re-throw to be caught by outer catch block
          throw emailError;
        }

        res.json({
          success: true,
          message: 'If an account exists with this email, a verification email has been sent.'
        });
      } finally {
        client.release();
      }
    } catch (error: any) {
      console.error('❌ Resend verification by email error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to send verification email. Please try again.'
      });
    }
  }
);

export default router;

