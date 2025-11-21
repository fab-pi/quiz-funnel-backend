import { Resend } from 'resend';

export class EmailService {
  private resend: Resend;
  private fromEmail: string;
  private frontendUrl: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY environment variable is not set');
    }

    this.resend = new Resend(apiKey);
    this.fromEmail = process.env.EMAIL_FROM || 'noreply@yourdomain.com';
    this.frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  }

  /**
   * Sends email verification email to user
   * @param email - User's email address
   * @param token - Verification token
   * @param userName - User's full name
   */
  async sendVerificationEmail(email: string, token: string, userName: string): Promise<void> {
    const verificationUrl = `${this.frontendUrl}/auth/verify-email?token=${token}`;

    try {
      const result = await this.resend.emails.send({
        from: this.fromEmail,
        to: email,
        subject: 'Verify Your Email Address',
        html: this.getVerificationEmailTemplate(userName, verificationUrl),
        text: `Hello ${userName},\n\nPlease verify your email address by clicking this link: ${verificationUrl}\n\nThis link expires in 24 hours.\n\nIf you didn't create an account, please ignore this email.`,
      });

      console.log(`✅ Verification email sent to ${email}`, result);
    } catch (error: any) {
      console.error('❌ Error sending verification email:', error);
      console.error('Error details:', {
        message: error.message,
        name: error.name,
        response: error.response?.data || error.response
      });
      throw new Error(`Failed to send verification email: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Sends password reset email to user
   * @param email - User's email address
   * @param token - Reset token
   * @param userName - User's full name
   */
  async sendPasswordResetEmail(email: string, token: string, userName: string): Promise<void> {
    const resetUrl = `${this.frontendUrl}/auth/reset-password?token=${token}`;

    try {
      const result = await this.resend.emails.send({
        from: this.fromEmail,
        to: email,
        subject: 'Reset Your Password',
        html: this.getPasswordResetEmailTemplate(userName, resetUrl),
        text: `Hello ${userName},\n\nYou requested to reset your password. Click this link to reset it: ${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you didn't request a password reset, please ignore this email.`,
      });

      console.log(`✅ Password reset email sent to ${email}`, result);
    } catch (error: any) {
      console.error('❌ Error sending password reset email:', error);
      console.error('Error details:', {
        message: error.message,
        name: error.name,
        response: error.response?.data || error.response
      });
      throw new Error(`Failed to send password reset email: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * HTML template for email verification
   */
  private getVerificationEmailTemplate(name: string, url: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; 
              line-height: 1.6; 
              color: #333; 
              max-width: 600px; 
              margin: 0 auto; 
              padding: 20px;
              background-color: #f5f5f5;
            }
            .container { 
              background-color: white;
              border-radius: 8px;
              padding: 30px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            h1 { 
              color: #2563eb; 
              margin-top: 0;
            }
            .button { 
              display: inline-block; 
              padding: 12px 24px; 
              background-color: #2563eb; 
              color: white; 
              text-decoration: none; 
              border-radius: 5px; 
              margin: 20px 0;
              font-weight: 600;
            }
            .button:hover {
              background-color: #1d4ed8;
            }
            .footer { 
              margin-top: 30px; 
              font-size: 12px; 
              color: #666; 
              border-top: 1px solid #eee;
              padding-top: 20px;
            }
            .url-fallback {
              word-break: break-all;
              color: #666;
              font-size: 12px;
              margin-top: 10px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Welcome!</h1>
            <p>Hello ${name},</p>
            <p>Thank you for signing up. To complete your registration, please verify your email address by clicking the button below:</p>
            <a href="${url}" class="button">Verify Email Address</a>
            <p class="url-fallback">Or copy and paste this link into your browser:<br>${url}</p>
            <p><strong>This link expires in 24 hours.</strong></p>
            <div class="footer">
              <p>If you didn't create an account, you can safely ignore this email.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * HTML template for password reset
   */
  private getPasswordResetEmailTemplate(name: string, url: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; 
              line-height: 1.6; 
              color: #333; 
              max-width: 600px; 
              margin: 0 auto; 
              padding: 20px;
              background-color: #f5f5f5;
            }
            .container { 
              background-color: white;
              border-radius: 8px;
              padding: 30px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            h1 { 
              color: #dc2626; 
              margin-top: 0;
            }
            .button { 
              display: inline-block; 
              padding: 12px 24px; 
              background-color: #dc2626; 
              color: white; 
              text-decoration: none; 
              border-radius: 5px; 
              margin: 20px 0;
              font-weight: 600;
            }
            .button:hover {
              background-color: #b91c1c;
            }
            .warning { 
              background-color: #fef3c7; 
              padding: 15px; 
              border-radius: 5px; 
              margin: 20px 0;
              border-left: 4px solid #f59e0b;
            }
            .footer { 
              margin-top: 30px; 
              font-size: 12px; 
              color: #666; 
              border-top: 1px solid #eee;
              padding-top: 20px;
            }
            .url-fallback {
              word-break: break-all;
              color: #666;
              font-size: 12px;
              margin-top: 10px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Reset Your Password</h1>
            <p>Hello ${name},</p>
            <p>You requested to reset your password. Click the button below to create a new password:</p>
            <a href="${url}" class="button">Reset Password</a>
            <p class="url-fallback">Or copy and paste this link into your browser:<br>${url}</p>
            <div class="warning">
              <strong>⚠️ Important:</strong> This link expires in 1 hour. If you didn't request a password reset, please ignore this email and your password will remain unchanged.
            </div>
            <div class="footer">
              <p>For security reasons, never share this link with anyone.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }
}

