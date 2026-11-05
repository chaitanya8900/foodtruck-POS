import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import prisma from '../prisma';
import { supabase } from '../lib/supabase';
import { UnauthorizedError, NotFoundError, ConflictError } from '../middleware/errorHandler';
import { JwtUserPayload } from '../types';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-food-truck-pos-2024';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export interface LoginResult {
  token: string;
  supabaseSessionToken?: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
    business_id: string;
    business_name: string;
  };
  business: any;
}

export async function login(
  email: string,
  password: string,
  ipAddress?: string
): Promise<LoginResult> {
  const normalizedEmail = email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: { business: true }
  });

  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  if (!user.is_active) {
    throw new UnauthorizedError('Account is disabled. Please contact your administrator.');
  }

  // Authenticate with Supabase managed authentication if configured
  let supabaseSessionToken: string | undefined = undefined;

  if (supabase) {
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password
      });

      if (authError) {
        throw new UnauthorizedError(authError.message || 'Invalid email or password');
      }

      supabaseSessionToken = authData.session?.access_token;
    } catch (err: any) {
      if (err instanceof UnauthorizedError) {
        throw err;
      }
      // Fallback to local bcrypt verification if network/provider is temporarily unreachable
      const isPasswordValid = await bcrypt.compare(password, user.password_hash);
      if (!isPasswordValid) {
        throw new UnauthorizedError('Invalid email or password');
      }
    }
  } else {
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid email or password');
    }
  }

  const payload: JwtUserPayload = {
    userId: user.id,
    businessId: user.business_id,
    role: user.role,
    email: user.email,
    name: user.name
  };

  const token = jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn']
  });

  // Audit log for login
  await prisma.auditLog.create({
    data: {
      business_id: user.business_id,
      user_id: user.id,
      action: 'LOGIN',
      entity_type: 'USER',
      entity_id: user.id,
      new_values: {
        email: user.email,
        role: user.role,
        auth_provider: supabaseSessionToken ? 'SUPABASE_AUTH' : 'LOCAL'
      },
      ip_address: ipAddress || null
    }
  });

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      business_id: user.business_id,
      business_name: user.business.name
    },
    business: {
      id: user.business.id,
      name: user.business.name,
      address: user.business.address,
      phone: user.business.phone,
      gstin: user.business.gstin,
      fssaiNumber: user.business.fssai_number,
      taxRate: Number(user.business.tax_rate),
      currency: user.business.currency,
      dineInEnabled: user.business.is_dine_in_enabled,
      takeawayEnabled: user.business.is_takeaway_enabled
    }
  };
}

export async function register(
  businessId: string,
  data: {
    name: string;
    email: string;
    password: string;
    role?: Role;
  },
  adminUserId?: string
) {
  const normalizedEmail = data.email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail }
  });

  if (existing) {
    throw new ConflictError('A user with this email already exists.');
  }

  // Provision user in Supabase Auth if configured
  if (supabase) {
    try {
      await supabase.auth.admin.createUser({
        email: normalizedEmail,
        password: data.password,
        email_confirm: true,
        user_metadata: {
          name: data.name.trim(),
          role: data.role || Role.CASHIER,
          business_id: businessId
        }
      });
    } catch {
      // Best effort; continue if already registered in supabase
    }
  }

  const passwordHash = await bcrypt.hash(data.password, 10);

  const newUser = await prisma.user.create({
    data: {
      business_id: businessId,
      name: data.name.trim(),
      email: normalizedEmail,
      password_hash: passwordHash,
      role: data.role || Role.CASHIER,
      is_active: true
    },
    select: {
      id: true,
      business_id: true,
      name: true,
      email: true,
      role: true,
      is_active: true,
      created_at: true
    }
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      business_id: businessId,
      user_id: adminUserId || null,
      action: 'USER_CREATED',
      entity_type: 'USER',
      entity_id: newUser.id,
      new_values: { email: newUser.email, role: newUser.role, name: newUser.name }
    }
  });

  return newUser;
}

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      is_active: true,
      created_at: true,
      business: {
        select: {
          id: true,
          name: true,
          address: true,
          phone: true,
          gstin: true,
          fssai_number: true,
          currency: true,
          tax_rate: true,
          is_dine_in_enabled: true,
          is_takeaway_enabled: true,
          receipt_header: true,
          receipt_footer: true,
          timezone: true
        }
      }
    }
  });

  if (!user) {
    throw new NotFoundError('User profile not found.');
  }

  return user;
}
