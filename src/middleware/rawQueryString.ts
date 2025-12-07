import { Request, Response, NextFunction } from 'express';

/**
 * Extended Request interface with raw query string property
 */
export interface RawQueryRequest extends Request {
  rawQueryString?: string;
}

/**
 * Middleware to capture raw query string before Express processes it
 * This is essential for Shopify App Proxy signature validation,
 * which requires the exact raw query string as sent by Shopify
 */
export const captureRawQueryString = (
  req: RawQueryRequest,
  res: Response,
  next: NextFunction
): void => {
  // Capture the raw query string from the original URL
  // req.originalUrl contains the full path + query string before any rewriting
  // req.url contains the path + query string (may be modified by middleware)
  // We need the query string part (everything after '?')
  
  // Try originalUrl first (set by Express), then fall back to url
  const originalUrl = req.originalUrl || req.url || '';
  const queryIndex = originalUrl.indexOf('?');
  
  if (queryIndex !== -1) {
    // Extract the raw query string (everything after '?')
    // This preserves the exact URL encoding that Shopify used
    req.rawQueryString = originalUrl.substring(queryIndex + 1);
  } else {
    // No query string present
    req.rawQueryString = '';
  }
  
  // Continue to next middleware/route handler
  next();
};

