import crypto from 'crypto';

/**
 * Facebook Pixel Service
 * Handles encryption/decryption of access tokens and sending events to Facebook Conversions API
 */
export class FacebookPixelService {
  private encryptionKey: string;
  private readonly ALGORITHM = 'aes-256-cbc';
  private readonly IV_LENGTH = 16; // 16 bytes for AES

  constructor() {
    // Get encryption key from environment variable
    const key = process.env.FACEBOOK_TOKEN_ENCRYPTION_KEY;
    if (!key) {
      console.warn('⚠️ FACEBOOK_TOKEN_ENCRYPTION_KEY not set. Token encryption will not work.');
      this.encryptionKey = '';
    } else {
      // Key should be 32 bytes (64 hex characters) for AES-256
      if (key.length !== 64) {
        throw new Error('FACEBOOK_TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
      }
      this.encryptionKey = key;
    }
  }

  /**
   * Encrypt Facebook access token
   * @param token - Plain text access token
   * @returns Encrypted token string (format: iv:encrypted)
   */
  encryptToken(token: string): string {
    if (!this.encryptionKey) {
      console.warn('⚠️ Encryption key not set, returning token as-is (not secure)');
      return token;
    }

    try {
      const iv = crypto.randomBytes(this.IV_LENGTH);
      const cipher = crypto.createCipheriv(
        this.ALGORITHM,
        Buffer.from(this.encryptionKey, 'hex'),
        iv
      );
      
      let encrypted = cipher.update(token, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Return format: iv:encrypted
      return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
      console.error('❌ Error encrypting token:', error);
      throw new Error('Failed to encrypt access token');
    }
  }

  /**
   * Decrypt Facebook access token
   * @param encryptedToken - Encrypted token string (format: iv:encrypted)
   * @returns Decrypted plain text token
   */
  decryptToken(encryptedToken: string): string {
    if (!this.encryptionKey) {
      // If no encryption key, assume token is stored in plain text (backward compatibility)
      return encryptedToken;
    }

    try {
      const parts = encryptedToken.split(':');
      if (parts.length !== 2) {
        // If format is wrong, assume it's plain text (backward compatibility)
        console.warn('⚠️ Token format incorrect, assuming plain text');
        return encryptedToken;
      }

      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      
      const decipher = crypto.createDecipheriv(
        this.ALGORITHM,
        Buffer.from(this.encryptionKey, 'hex'),
        iv
      );
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('❌ Error decrypting token:', error);
      // If decryption fails, try returning as-is (might be plain text)
      console.warn('⚠️ Decryption failed, returning token as-is');
      return encryptedToken;
    }
  }

  /**
   * Send event to Facebook Conversions API
   * @param params - Event parameters
   * @returns Promise with Facebook API response
   */
  async sendEvent(params: {
    pixelId: string;
    accessToken: string;
    eventName: string;
    eventId: string;
    eventTime: number;
    userData: {
      fbp?: string | null;
      fbc?: string | null;
      client_user_agent?: string;
      client_ip_address?: string;
      event_source_url?: string;
    };
    customData?: Record<string, any>;
  }): Promise<any> {
    const { pixelId, accessToken, eventName, eventId, eventTime, userData, customData } = params;

    // Build user_data object (only include non-null/undefined values)
    // Facebook API doesn't accept empty strings, so we omit undefined/null values
    const userDataPayload: any = {};
    
    if (userData.fbp) {
      userDataPayload.fbp = userData.fbp;
    }
    if (userData.fbc) {
      userDataPayload.fbc = userData.fbc;
    }
    if (userData.client_user_agent) {
      userDataPayload.client_user_agent = userData.client_user_agent;
    }
    // Only include IP address if it's a valid non-empty string
    if (userData.client_ip_address && userData.client_ip_address.trim().length > 0) {
      userDataPayload.client_ip_address = userData.client_ip_address;
    }
    // Note: event_source_url should NOT be in user_data, it goes at the event level

    // Build event payload
    const eventPayload: any = {
      event_name: eventName,
      event_time: eventTime,
      event_id: eventId,
      action_source: 'website',
      user_data: userDataPayload,
      custom_data: customData || {}
    };

    // Add event_source_url at the event level (not in user_data)
    if (userData.event_source_url) {
      eventPayload.event_source_url = userData.event_source_url;
    }

    const payload = {
      data: [eventPayload]
    };

    // Facebook Conversions API endpoint
    const apiUrl = `https://graph.facebook.com/v18.0/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`;

    // Retry configuration
    const maxRetries = 3;
    let lastError: any = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(`Facebook API error: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
        }

        const responseData = await response.json();
        console.log(`✅ Facebook Conversions API event sent successfully: ${eventName} (event_id: ${eventId}, pixel: ${pixelId})`);
        return responseData;
      } catch (error: any) {
        lastError = error;
        
        // Log error details
        if (error.name === 'AbortError') {
          console.error(
            `❌ Facebook Conversions API timeout (attempt ${attempt}/${maxRetries})`
          );
        } else if (error.message?.includes('Facebook API error')) {
          const statusMatch = error.message.match(/(\d{3})/);
          const status = statusMatch ? parseInt(statusMatch[1]) : 0;
          
          console.error(
            `❌ Facebook Conversions API error (attempt ${attempt}/${maxRetries}):`,
            error.message
          );

          // Don't retry on 4xx errors (client errors)
          if (status >= 400 && status < 500) {
            console.error('❌ Client error, not retrying');
            throw error;
          }
        } else {
          console.error(
            `❌ Facebook Conversions API network error (attempt ${attempt}/${maxRetries}):`,
            error.message
          );
        }

        // Wait before retry (exponential backoff)
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
          console.log(`⏳ Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed - log but don't throw (fire and forget)
    console.error(`❌ Failed to send Facebook Conversions API event after ${maxRetries} attempts:`, lastError);
    throw lastError;
  }

  /**
   * Send event asynchronously (fire and forget)
   * Doesn't throw errors, just logs them
   * This ensures quiz operations are never blocked by Facebook API issues
   */
  async sendEventAsync(params: {
    pixelId: string;
    accessToken: string;
    eventName: string;
    eventId: string;
    eventTime: number;
    userData: {
      fbp?: string | null;
      fbc?: string | null;
      client_user_agent?: string;
      client_ip_address?: string;
      event_source_url?: string;
    };
    customData?: Record<string, any>;
  }): Promise<void> {
    // Validate required parameters
    if (!params.pixelId || !params.accessToken) {
      console.warn('⚠️ Missing required parameters for Facebook Conversions API event:', {
        hasPixelId: !!params.pixelId,
        hasAccessToken: !!params.accessToken
      });
      return;
    }

    // Validate Pixel ID format
    const pixelIdRegex = /^\d+$/;
    if (!pixelIdRegex.test(params.pixelId.trim())) {
      console.warn('⚠️ Invalid Facebook Pixel ID format:', params.pixelId);
      return;
    }

    try {
      console.log(`📤 Sending Facebook Conversions API event: ${params.eventName} (event_id: ${params.eventId})`);
      await this.sendEvent(params);
      console.log(`✅ Facebook Conversions API event sent successfully: ${params.eventName} (event_id: ${params.eventId})`);
    } catch (error: any) {
      // Log error with context but don't throw (fire and forget)
      console.error('❌ Failed to send Facebook Conversions API event (async):', {
        eventName: params.eventName,
        eventId: params.eventId,
        pixelId: params.pixelId,
        error: error?.message || error
      });
      // Don't throw - quiz operations must continue
    }
  }
}

// Export singleton instance
export const facebookPixelService = new FacebookPixelService();

