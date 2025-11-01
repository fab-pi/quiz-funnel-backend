import { Request, Response, NextFunction } from 'express';
/**
 * Security headers middleware for API endpoints
 *
 * Note: For iframe embedding, the frontend Next.js app handles frame embedding headers.
 * This middleware focuses on API security headers and ensures CORS is properly configured.
 *
 * The iframe embedding itself is handled by:
 * 1. Frontend Next.js app (sets frame-ancestors or omits X-Frame-Options)
 * 2. CORS middleware (allows API requests from various origins)
 */
export declare const iframeHeaders: (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=iframeHeaders.d.ts.map