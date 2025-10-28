import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export class CustomError extends Error implements AppError {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
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
    const pgError = err as any;
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

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
