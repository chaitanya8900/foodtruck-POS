import dotenv from 'dotenv';
dotenv.config();

import path from 'path';
import fs from 'fs';
import http from 'http';
import express, { Express, Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import logger from './utils/logger';
import prisma from './prisma';
import { errorHandler } from './middleware/errorHandler';
import { initSocket } from './socket';

// Route imports
import authRoutes from './routes/auth.routes';
import menuRoutes from './routes/menu.routes';
import orderRoutes from './routes/order.routes';
import publicRoutes from './routes/public.routes';
import paymentRoutes from './routes/payment.routes';
import mobileOrderRoutes from './routes/mobileOrder.routes';
import printJobRoutes from './routes/printJob.routes';
import reportRoutes from './routes/report.routes';
import tableRoutes from './routes/table.routes';
import userRoutes from './routes/user.routes';
import settingsRoutes from './routes/settings.routes';

const app: Express = express();
const PORT = process.env.PORT || 5000;

// Security HTTP headers
app.use(
  helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
    crossOriginEmbedderPolicy: false
  })
);

// CORS configuration
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
  : ['http://localhost:3000', 'http://localhost:5173'];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-verify']
  })
);

// Rate Limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1500, // Limit each IP to 1500 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again after 15 minutes'
  }
});

const publicOrderLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100, // 100 order requests per 5 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many ordering requests from this device. Please wait a moment.'
  }
});

app.use(generalLimiter);

// Cookie & Body Parsers
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files (uploaded item pictures)
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use(
  '/uploads',
  express.static(uploadsDir, {
    dotfiles: 'ignore',
    index: false,
    fallthrough: false,
    maxAge: '7d',
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }
  })
);

// Health Check
const healthHandler = (req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
};
app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/public', publicOrderLimiter, publicRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/mobile-orders', mobileOrderRoutes);
app.use('/api/print-jobs', printJobRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/users', userRoutes);
app.use('/api/settings', settingsRoutes);

// 404 Route Handler
app.use('*', (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.originalUrl} not found`
  });
});

// Global Error Handler
app.use(errorHandler);

// HTTP Server & Socket.IO
const httpServer = http.createServer(app);
initSocket(httpServer);

// Start server
httpServer.listen(PORT, () => {
  logger.info(`Food Truck POS Backend server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);

  // Keep PostgreSQL connection pool warm (every 45s) to eliminate cold starts and idle disconnects
  setInterval(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      // Ignored
    }
  }, 45000);
});

// Graceful Shutdown
function handleShutdown(signal: string) {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  httpServer.close(() => {
    logger.info('HTTP server closed.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason }, 'Unhandled Rejection at Promise');
});

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught Exception thrown');
});

export { app, httpServer };
export default app;
