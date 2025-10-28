"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.asyncHandler = exports.errorHandler = exports.CustomError = void 0;
class CustomError extends Error {
    constructor(message, statusCode = 500) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.CustomError = CustomError;
const errorHandler = (err, req, res, next) => {
    let error = { ...err };
    error.message = err.message;
    // Log error
    console.error('❌ Error:', {
        message: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        timestamp: new Date().toISOString()
    });
    // PostgreSQL errors
    if (err.name === 'error') {
        const pgError = err;
        switch (pgError.code) {
            case '23505': // Unique constraint violation
                error = new CustomError('Resource already exists', 409);
                break;
            case '23503': // Foreign key constraint violation
                error = new CustomError('Referenced resource not found', 400);
                break;
            case '23502': // Not null constraint violation
                error = new CustomError('Required field is missing', 400);
                break;
            case '22P02': // Invalid input syntax
                error = new CustomError('Invalid data format', 400);
                break;
            default:
                error = new CustomError('Database error occurred', 500);
        }
    }
    // Validation errors
    if (err.name === 'ValidationError') {
        error = new CustomError('Validation failed', 400);
    }
    // Cast errors (invalid ObjectId, etc.)
    if (err.name === 'CastError') {
        error = new CustomError('Invalid ID format', 400);
    }
    // Default to 500 server error
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Internal server error';
    res.status(statusCode).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};
exports.errorHandler = errorHandler;
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};
exports.asyncHandler = asyncHandler;
//# sourceMappingURL=errorHandler.js.map