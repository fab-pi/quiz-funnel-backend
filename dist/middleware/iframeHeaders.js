"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.iframeHeaders = void 0;
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
const iframeHeaders = (req, res, next) => {
    // Additional security headers for API responses
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    // Note: We don't set X-Frame-Options here because:
    // 1. This is an API, not an HTML page
    // 2. Frame embedding is controlled by the frontend Next.js app
    // 3. CORS middleware handles cross-origin API access
    next();
};
exports.iframeHeaders = iframeHeaders;
//# sourceMappingURL=iframeHeaders.js.map