import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import sessionRoutes from './routes/session';
import contentRoutes from './routes/content';
import adminRoutes from './routes/admin';
import analyticsRoutes from './routes/analytics';
import uploadRoutes from './routes/upload';
import authRoutes from './routes/auth';
import shopifyRoutes from './routes/shopify';
import { errorHandler } from './middleware/errorHandler';
import { iframeHeaders } from './middleware/iframeHeaders';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3008;

// Middleware
// CORS configuration - allow iframe embedding from various origins
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }

    // In production, allow main domain and all HTTPS origins (for custom domains)
    if (process.env.NODE_ENV === 'production') {
      const allowedOrigins = process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
        : [];
      
      // Always allow main domain
      const mainDomain = process.env.MAIN_DOMAIN || 'https://quiz.try-directquiz.com';
      if (allowedOrigins.includes(origin) || origin === mainDomain) {
        return callback(null, true);
      }
      
      // Allow all HTTPS origins (for custom domains)
      // Custom domains are validated when saved to database, so this is safe
      if (origin.startsWith('https://')) {
        return callback(null, true);
      }
      
      // Reject HTTP in production (should use HTTPS)
        callback(new Error('Not allowed by CORS'));
    } else {
      // In development, allow all origins for easier testing
      callback(null, true);
    }
  },
  credentials: true,
  optionsSuccessStatus: 200 // For legacy browser support
};

app.use(cors(corsOptions));

// Iframe-friendly headers middleware (allows embedding)
app.use(iframeHeaders);

// Increase JSON body size limit to 50MB to handle base64-encoded file uploads
// Base64 encoding increases size by ~33%, so 20MB file becomes ~27MB in base64
// 50MB limit provides comfortable margin for Shopify's 20MB file limit
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Debug: Log route registration
console.log('Registering modular routes under /api');

// Simple test route to isolate routing issues
app.get('/api/test', (req, res) => {
  console.log('✅ Test route hit: /api/test');
  res.send('Test OK');
});

// API Routes - Modular structure
app.use('/api', sessionRoutes);     // Session management
app.use('/api', contentRoutes);     // Quiz content
app.use('/api', authRoutes);        // Authentication
app.use('/api', adminRoutes);        // Admin operations
app.use('/api', analyticsRoutes);    // Analytics
app.use('/api', uploadRoutes);       // File uploads
app.use('/api', shopifyRoutes);      // Shopify OAuth and webhooks
console.log('✅ All modular routes registered under /api');

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found'
  });
});

// Error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Quiz Funnel Backend API running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
  console.log(`📝 API endpoints:`);
  console.log(`   - POST http://localhost:${PORT}/api/auth/register`);
  console.log(`   - POST http://localhost:${PORT}/api/auth/login`);
  console.log(`   - POST http://localhost:${PORT}/api/auth/refresh`);
  console.log(`   - POST http://localhost:${PORT}/api/auth/logout`);
  console.log(`   - POST http://localhost:${PORT}/api/session/start`);
  console.log(`   - POST http://localhost:${PORT}/api/session/update`);
  console.log(`   - POST http://localhost:${PORT}/api/session/answers`);
  console.log(`   - POST http://localhost:${PORT}/api/session/complete`);
  console.log(`   - GET  http://localhost:${PORT}/api/content/quiz/:quizId`);
});
