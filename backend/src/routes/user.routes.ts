import { Router, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import prisma from '../prisma';
import * as authService from '../services/auth.service';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { NotFoundError, ConflictError, ValidationError } from '../middleware/errorHandler';
import { AuthRequest } from '../types';

const router = Router();

const createUserSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  email: z.string().email('Valid email is required'),
  password: z.string().min(4, 'Password must be at least 4 characters'),
  role: z.nativeEnum(Role).optional(),
  is_active: z.boolean().optional(),
  isActive: z.boolean().optional()
});

const updateUserSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
  password: z.string().min(4).optional(),
  role: z.nativeEnum(Role).optional(),
  is_active: z.boolean().optional(),
  isActive: z.boolean().optional()
});

function formatUser(user: any) {
  if (!user) return user;
  return {
    ...user,
    businessId: user.business_id ?? user.businessId,
    isActive: user.is_active ?? user.isActive ?? true,
    createdAt: user.created_at ?? user.createdAt,
    updatedAt: user.updated_at ?? user.updatedAt
  };
}

router.use(authenticate);
router.use(authorize([Role.ADMIN]));

// GET /api/users (List all users for the business)
router.get('/', async (req: AuthRequest, res: Response, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { business_id: req.user!.businessId },
      select: {
        id: true,
        business_id: true,
        name: true,
        email: true,
        role: true,
        is_active: true,
        created_at: true,
        updated_at: true
      },
      orderBy: { created_at: 'desc' }
    });
    res.status(200).json({ success: true, data: users.map(formatUser) });
  } catch (err) {
    next(err);
  }
});

// GET /api/users/:id
router.get('/:id', async (req: AuthRequest, res: Response, next) => {
  try {
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, business_id: req.user!.businessId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        is_active: true,
        created_at: true,
        updated_at: true
      }
    });

    if (!user) {
      throw new NotFoundError('User not found.');
    }

    res.status(200).json({ success: true, data: formatUser(user) });
  } catch (err) {
    next(err);
  }
});

// POST /api/users (Create new staff member)
router.post(
  '/',
  validate({ body: createUserSchema }),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const newUser = await authService.register(
        req.user!.businessId,
        req.body,
        req.user!.userId
      );
      res.status(201).json({
        success: true,
        message: 'User created successfully',
        data: formatUser(newUser)
      });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/users/:id
router.put(
  '/:id',
  validate({ body: updateUserSchema }),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const user = await prisma.user.findFirst({
        where: { id: req.params.id, business_id: req.user!.businessId }
      });

      if (!user) {
        throw new NotFoundError('User not found.');
      }

      const activeState = req.body.isActive !== undefined ? req.body.isActive : req.body.is_active;

      // Prevent deactivating own account
      if (req.params.id === req.user!.userId && activeState === false) {
        throw new ValidationError('You cannot deactivate your own account.');
      }

      const updateData: any = {};
      if (req.body.name) updateData.name = req.body.name.trim();
      if (req.body.role) updateData.role = req.body.role;
      if (activeState !== undefined) updateData.is_active = activeState;

      if (req.body.email) {
        const normalized = req.body.email.trim().toLowerCase();
        if (normalized !== user.email) {
          const existing = await prisma.user.findUnique({ where: { email: normalized } });
          if (existing) {
            throw new ConflictError('A user with this email already exists.');
          }
          updateData.email = normalized;
        }
      }

      if (req.body.password) {
        updateData.password_hash = await bcrypt.hash(req.body.password, 10);
      }

      const updated = await prisma.user.update({
        where: { id: req.params.id },
        data: {
          ...updateData,
          updated_at: new Date()
        },
        select: {
          id: true,
          business_id: true,
          name: true,
          email: true,
          role: true,
          is_active: true,
          created_at: true,
          updated_at: true
        }
      });

      res.status(200).json({
        success: true,
        message: 'User updated successfully',
        data: formatUser(updated)
      });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/users/:id
router.delete('/:id', async (req: AuthRequest, res: Response, next) => {
  try {
    if (req.params.id === req.user!.userId) {
      throw new ValidationError('You cannot delete your own account.');
    }

    const user = await prisma.user.findFirst({
      where: { id: req.params.id, business_id: req.user!.businessId }
    });

    if (!user) {
      throw new NotFoundError('User not found.');
    }

    // Instead of hard deleting orders history, soft deactivate
    await prisma.user.update({
      where: { id: req.params.id },
      data: { is_active: false }
    });

    res.status(200).json({
      success: true,
      message: 'User account disabled successfully'
    });
  } catch (err) {
    next(err);
  }
});

export default router;
