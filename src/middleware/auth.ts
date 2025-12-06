import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { TokenPayload } from '../types';
import { shopifyAuthenticate, ShopifyRequest } from './shopifyAuth';

/**
 * Extended Request interface with user property and Shopify support
 */
export interface AuthRequest extends Request {
  user?: {
    userId: number;
    email: string;
    role: 'user' | 'admin';
  };
  shop?: string;
  shopId?: number;
  authType?: 'native' | 'shopify';
}

/**
 * Authentication middleware
 * Supports both JWT (native) and Shopify session authentication
 * Automatically detects auth type and routes to appropriate handler
 */
export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Check if this is a Shopify request
    const shopDomain = 
      req.headers['x-shopify-shop-domain'] as string ||
      req.query.shop as string;

    if (shopDomain) {
      // This is a Shopify request - use Shopify authentication
      console.log(`🔄 Detected Shopify request for shop: ${shopDomain}`);
      return shopifyAuthenticate(req as ShopifyRequest, res, next);
    }

    // Otherwise, use native JWT authentication
    const authHeader = req.headers.authorization;

    // Check if Authorization header exists and has correct format
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        message: 'Authentication required. Please provide a valid token.'
      });
      return;
    }

    // Extract token from "Bearer <token>"
    const token = authHeader.split(' ')[1];

    if (!token) {
      res.status(401).json({
        success: false,
        message: 'Token missing. Please provide a valid token.'
      });
      return;
    }

    // Verify token
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error('❌ JWT_SECRET is not set in environment variables');
      res.status(500).json({
        success: false,
        message: 'Server configuration error'
      });
      return;
    }

    try {
      const decoded = jwt.verify(token, secret) as TokenPayload;

      // Log token info for debugging
      const now = Math.floor(Date.now() / 1000);
      const tokenExp = (decoded as any).exp;
      const timeUntilExpiry = tokenExp ? tokenExp - now : null;
      
      console.log(`🔐 Token verified for user ${decoded.userId} (${decoded.email})`);
      if (timeUntilExpiry !== null) {
        console.log(`   ⏰ Token expires in ${timeUntilExpiry} seconds (${Math.round(timeUntilExpiry / 60)} minutes)`);
      }

      // Add user info to request object
      req.user = {
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role
      };
      req.authType = 'native';

      // Continue to next middleware/route handler
      next();
    } catch (jwtError: any) {
      // Token verification failed
      if (jwtError.name === 'TokenExpiredError') {
        const expiredAt = (jwtError as any).expiredAt;
        const now = new Date();
        const expiredAgo = expiredAt ? Math.round((now.getTime() - expiredAt.getTime()) / 1000 / 60) : null;
        
        console.log(`❌ Token expired for request to ${req.path}`);
        if (expiredAgo !== null) {
          console.log(`   ⏰ Token expired ${expiredAgo} minutes ago`);
        }
        console.log(`   📝 Token was issued at: ${expiredAt ? new Date(expiredAt).toISOString() : 'unknown'}`);
        console.log(`   📝 Current time: ${now.toISOString()}`);
        
        res.status(403).json({
          success: false,
          message: 'Token has expired. Please refresh your token.'
        });
        return;
      }

      if (jwtError.name === 'JsonWebTokenError') {
        res.status(403).json({
          success: false,
          message: 'Invalid token. Please login again.'
        });
        return;
      }

      // Other JWT errors
      res.status(403).json({
        success: false,
        message: 'Token verification failed. Please login again.'
      });
      return;
    }
  } catch (error) {
    console.error('❌ Authentication middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication error occurred'
    });
    return;
  }
};

/**
 * Role-based authorization middleware factory
 * Returns a middleware that checks if user has required role(s)
 * 
 * @param allowedRoles - Array of roles that are allowed to access the route
 * @returns Middleware function
 * 
 * @example
 * router.get('/admin/users', authenticate, requireRole('admin'), handler);
 * router.get('/user/profile', authenticate, requireRole('user', 'admin'), handler);
 */
export const requireRole = (...allowedRoles: ('user' | 'admin')[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    // First check if user is authenticated
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }

    // Check if user's role is in allowed roles
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: 'Insufficient permissions. This action requires one of the following roles: ' + allowedRoles.join(', ')
      });
      return;
    }

    // User has required role, continue
    next();
  };
};

