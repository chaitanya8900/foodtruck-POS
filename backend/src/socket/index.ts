import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger';
import { JwtUserPayload } from '../types';
import { registerPrintAgentHandlers } from './printAgent';

let io: Server | null = null;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-food-truck-pos-2024';

export function initSocket(server: HttpServer): Server {
  io = new Server(server, {
    cors: {
      origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
      credentials: true
    }
  });

  io.use((socket: Socket, next) => {
    // Check if it is a print agent connection (can authenticate via query/handshake)
    const clientType = socket.handshake.auth?.clientType || socket.handshake.query?.clientType;
    const isPrintAgent =
      socket.handshake.auth?.isPrintAgent ||
      clientType?.toString().toLowerCase() === 'print-agent' ||
      clientType?.toString().toLowerCase() === 'print_agent';
    if (isPrintAgent) {
      socket.data.isPrintAgent = true;
      return next();
    }

    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace('Bearer ', '') ||
      socket.handshake.query?.token;

    if (!token) {
      const orderId = socket.handshake.query?.orderId;
      if (orderId) {
        socket.data.orderId = orderId;
      }
      return next();
    }

    try {
      const decoded = jwt.verify(token as string, JWT_SECRET) as JwtUserPayload;
      socket.data.user = decoded;
      return next();
    } catch (err) {
      logger.warn({ err }, 'Socket token verification failed, allowing as unauthenticated client');
      return next();
    }
  });

  io.on('connection', (socket: Socket) => {
    logger.info({ socketId: socket.id }, 'Socket client connected');

    // Handle authenticated user
    if (socket.data.user) {
      const { businessId, role } = socket.data.user;
      socket.join(`business:${businessId}`);
      socket.join(`role:${businessId}:${role}`);
      logger.info(
        { socketId: socket.id, businessId, role },
        'Client joined business and role room'
      );
    }

    // Handle public customer tracking
    if (socket.data.orderId) {
      socket.join(`order:${socket.data.orderId}`);
      logger.info({ socketId: socket.id, orderId: socket.data.orderId }, 'Customer joined order room');
    }

    // Register print agent event handlers only for print agent sockets
    if (socket.data.isPrintAgent) {
      registerPrintAgentHandlers(io!, socket);
    }

    // Allow joining specific rooms dynamically
    socket.on('join:business', (businessId: string) => {
      socket.join(`business:${businessId}`);
    });

    socket.on('join:order', (orderId: string) => {
      socket.join(`order:${orderId}`);
    });

    socket.on('disconnect', (reason) => {
      logger.info({ socketId: socket.id, reason }, 'Socket client disconnected');
    });
  });

  logger.info('Socket.IO initialized successfully');
  return io;
}

export function getIO(): Server {
  if (!io) {
    throw new Error('Socket.IO has not been initialized. Call initSocket(server) first.');
  }
  return io;
}

function isMobileOrder(order: any): boolean {
  if (!order) return false;
  const source = (order.source || order.order_source || '').toString().toUpperCase();
  const orderNumber = (order.orderNumber || order.order_number || '').toString().toUpperCase();
  if (source === 'POS' || orderNumber.startsWith('POS-')) {
    return false;
  }
  return (
    source === 'QR' ||
    source === 'MOBILE' ||
    orderNumber.startsWith('QR-') ||
    Boolean(order.qrToken) ||
    Boolean(order.qr_token_id)
  );
}

export function emitNewOrder(businessId: string, order: any): void {
  if (!io) return;
  io.to(`business:${businessId}`).emit('new-order', order);
  io.to(`business:${businessId}`).emit('new_order', order);
  io.emit('new_order', order);

  // ONLY emit new_mobile_order if this order originated from mobile QR
  if (isMobileOrder(order)) {
    io.to(`business:${businessId}`).emit('new_mobile_order', order);
    io.emit('new_mobile_order', order);
  }

  // Also notify printer agent room to check for new print jobs
  io.to(`printer:${businessId}`).emit('print-agent:new-jobs-available', {
    orderId: order.id,
    businessId
  });
}

export function emitOrderPaymentReceived(businessId: string, order: any): void {
  if (!io) return;
  io.to(`business:${businessId}`).emit('order_payment_received', order);
  io.to(`business:${businessId}`).emit('order-payment-received', order);
  io.emit('order_payment_received', order);
}

export function emitOrderUpdate(businessId: string, order: any): void {
  if (!io) return;
  // Notify staff in business room and globally
  io.to(`business:${businessId}`).emit('order-update', order);
  io.to(`business:${businessId}`).emit('order_updated', order);
  io.emit('order_updated', order);
  // Notify customer listening on specific order room
  io.to(`order:${order.id}`).emit('order-status-update', {
    orderId: order.id,
    orderStatus: order.order_status,
    paymentStatus: order.payment_status,
    tokenNumber: order.token_number
  });
}

export function emitPrintJobUpdate(businessId: string, printJob: any): void {
  if (!io) return;
  io.to(`business:${businessId}`).emit('print-job-update', printJob);
}

export function emitPrinterStatus(businessId: string, status: any): void {
  if (!io) return;
  io.to(`business:${businessId}`).emit('printer-status', status);
}
