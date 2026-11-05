import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import logger from '../utils/logger';

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public details?: any;

  constructor(message: string, statusCode: number = 500, details?: any) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = true;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string = 'Validation Error', details?: any) {
    super(message, 400, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized: Authentication required') {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden: Insufficient permissions') {
    super(message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Conflict: Resource already exists') {
    super(message, 409);
  }
}

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  // If it's a ZodError that leaked past validation middleware
  if (err instanceof ZodError) {
    const formattedErrors = err.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message
    }));

    const primaryMessage = err.errors[0]?.message || 'Validation failed';
    res.status(400).json({
      success: false,
      message: primaryMessage,
      error: primaryMessage,
      details: formattedErrors
    });
    return;
  }

  // If it's a custom operational AppError
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, path: req.path }, err.message);
    }

    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      error: err.message,
      ...(err.details ? { details: err.details } : {})
    });
    return;
  }

  // Prisma unique constraint error
  if (err.code === 'P2002') {
    const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : 'Field';
    const msg = `A record with this ${target} already exists.`;
    res.status(409).json({
      success: false,
      message: msg,
      error: msg
    });
    return;
  }

  // Prisma record not found
  if (err.code === 'P2025') {
    const msg = 'Record not found.';
    res.status(404).json({
      success: false,
      message: msg,
      error: msg
    });
    return;
  }

  // Fallback 500 internal server error
  logger.error({ err, path: req.path, method: req.method }, 'Unhandled Exception');

  const errorMsg = process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message || 'Internal server error';
  res.status(500).json({
    success: false,
    message: errorMsg,
    error: errorMsg
  });
}
