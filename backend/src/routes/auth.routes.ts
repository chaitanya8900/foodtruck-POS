import { Router, Response } from 'express';
import { z } from 'zod';
import * as authService from '../services/auth.service';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { AuthRequest } from '../types';

import rateLimit from 'express-rate-limit';

const router = Router();

// Brute-force protection: 10 login attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many login attempts. Please try again after 15 minutes.'
  }
});

const loginSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(1, 'Password is required')
});

// POST /api/auth/login
router.post(
  '/login',
  loginLimiter,
  validate({ body: loginSchema }),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const { email, password } = req.body;
      const ipAddress = req.ip || req.socket.remoteAddress;

      const result = await authService.login(email, password, ipAddress);

      // Set HTTP-only cookie
      res.cookie('token', result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      res.status(200).json({
        success: true,
        message: 'Login successful',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/auth/logout
router.post('/logout', (req: AuthRequest, res: Response) => {
  res.clearCookie('token');
  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const user = await authService.getProfile(req.user!.userId);
    res.status(200).json({
      success: true,
      data: user
    });
  } catch (err) {
    next(err);
  }
});

export default router;
