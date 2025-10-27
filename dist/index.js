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
// Load environment variables
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3008;
// Middleware
app.use((0, cors_1.default)({
    origin: process.env.NODE_ENV === 'production'
        ? ['https://your-frontend-domain.com']
        : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3008'],
    credentials: true
}));
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
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error'
    });
});
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