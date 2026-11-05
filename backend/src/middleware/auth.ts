import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { AuthRequest, JwtUserPayload } from '../types';
import { UnauthorizedError, ForbiddenError } from './errorHandler';
import prisma from '../prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-food-truck-pos-2024';

interface CachedUser {
  data: {
    id: string;
    business_id: string;
    role: Role;
    is_active: boolean;
    email: string;
    name: string;
  };
  expiresAt: number;
}

const userCache = new Map<string, CachedUser>();

export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    let token: string | undefined;

    // 1. Check Authorization Header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      // 2. Check Cookie
      token = req.cookies.token;
    }

    if (!token) {
      throw new UnauthorizedError('Authentication token is missing. Please log in.');
    }

    // 3. Verify Token
    let decoded: JwtUserPayload;
    try {
      decoded = jwt.verify(token, JWT_SECRET) as JwtUserPayload;
    } catch {
      throw new UnauthorizedError('Invalid or expired authentication token.');
    }

    // 4. Verify user exists and is active (with 60-second in-memory cache to eliminate remote DB latency)
    const now = Date.now();
    let userRecord = userCache.get(decoded.userId);

    if (!userRecord || userRecord.expiresAt < now) {
      const dbUser = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, business_id: true, role: true, is_active: true, email: true, name: true }
      });

      if (!dbUser || !dbUser.is_active) {
        userCache.delete(decoded.userId);
        throw new UnauthorizedError('User account is inactive or no longer exists.');
      }

      userRecord = { data: dbUser, expiresAt: now + 60000 };
      userCache.set(decoded.userId, userRecord);
    }

    const user = userRecord.data;

    req.user = {
      userId: user.id,
      businessId: user.business_id,
      role: user.role,
      email: user.email,
      name: user.name
    };

    next();
  } catch (err) {
    next(err);
  }
}

export function authorize(roles: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError('User is not authenticated.'));
    }

    if (!roles.includes(req.user.role)) {
      return next(
        new ForbiddenError(
          `Access forbidden: required role [${roles.join(', ')}], your role is [${req.user.role}]`
        )
      );
    }

    next();
  };
}

export async function optionalAuthenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    let token: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as JwtUserPayload;
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: { id: true, business_id: true, role: true, is_active: true, email: true, name: true }
        });
        if (user && user.is_active) {
          req.user = {
            userId: user.id,
            businessId: user.business_id,
            role: user.role,
            email: user.email,
            name: user.name
          };
        }
      } catch {
        // Silently continue for optional auth
      }
    }
    next();
  } catch (err) {
    next(err);
  }
}
