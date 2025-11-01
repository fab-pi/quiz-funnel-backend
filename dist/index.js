"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const session_1 = __importDefault(require("./routes/session"));
const content_1 = __importDefault(require("./routes/content"));
const admin_1 = __importDefault(require("./routes/admin"));
const analytics_1 = __importDefault(require("./routes/analytics"));
const upload_1 = __importDefault(require("./routes/upload"));
const errorHandler_1 = require("./middleware/errorHandler");
const iframeHeaders_1 = require("./middleware/iframeHeaders");
// Load environment variables
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3008;
// Middleware
// CORS configuration - allow iframe embedding from various origins
const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) {
            return callback(null, true);
        }
        // In production, check against allowed origins
        if (process.env.NODE_ENV === 'production') {
            const allowedOrigins = process.env.ALLOWED_ORIGINS
                ? process.env.ALLOWED_ORIGINS.split(',')
                : ['https://your-frontend-domain.com'];
            if (allowedOrigins.includes(origin)) {
                callback(null, true);
            }
            else {
                // In production, be more restrictive
                callback(new Error('Not allowed by CORS'));
            }
        }
        else {
            // In development, allow all origins for easier testing
            callback(null, true);
        }
    },
    credentials: true,
    optionsSuccessStatus: 200 // For legacy browser support
};
app.use((0, cors_1.default)(corsOptions));
// Iframe-friendly headers middleware (allows embedding)
app.use(iframeHeaders_1.iframeHeaders);
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
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
app.use('/api', session_1.default); // Session management
app.use('/api', content_1.default); // Quiz content
app.use('/api', admin_1.default); // Admin operations
app.use('/api', analytics_1.default); // Analytics
app.use('/api', upload_1.default); // File uploads
console.log('✅ All modular routes registered under /api');
// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found'
    });
});
// Error handler
app.use(errorHandler_1.errorHandler);
// Start server
app.listen(PORT, () => {
    console.log(`🚀 Quiz Funnel Backend API running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
    console.log(`📝 API endpoints:`);
    console.log(`   - POST http://localhost:${PORT}/api/session/start`);
    console.log(`   - POST http://localhost:${PORT}/api/session/update`);
    console.log(`   - POST http://localhost:${PORT}/api/session/answers`);
    console.log(`   - POST http://localhost:${PORT}/api/session/complete`);
    console.log(`   - GET  http://localhost:${PORT}/api/content/quiz/:quizId`);
});
//# sourceMappingURL=index.js.map