import { io, Socket } from 'socket.io-client';
import { EventEmitter } from 'events';
import { AppConfig } from './config';
import {
  PrintJob,
  PrinterStatus,
  PrinterStatusPayload,
  PrintJobStatusUpdatePayload,
  HeartbeatPayload,
  RequestPendingJobsPayload,
  TestPrintPayload,
} from './types';
import { createChildLogger } from './logger';

const log = createChildLogger('Socket');

export interface SocketEvents {
  'job-received': (job: PrintJob) => void;
  'pending-jobs-received': (jobs: PrintJob[]) => void;
  'test-print-requested': (payload: TestPrintPayload) => void;
  'connected': () => void;
  'disconnected': (reason: string) => void;
}

export class SocketClient extends EventEmitter {
  private socket: Socket | null = null;
  private isConnected = false;
  private startTime = Date.now();

  constructor(private readonly config: AppConfig) {
    super();
  }

  public connect(): void {
    if (this.socket) {
      log.warn('Socket client already instantiated, disconnecting previous instance...');
      this.socket.disconnect();
    }

    log.info(
      { backendUrl: this.config.backendUrl, businessId: this.config.businessId },
      'Connecting to Food Truck backend via Socket.IO...'
    );

    this.socket = io(this.config.backendUrl, {
      auth: {
        token: this.config.agentToken,
        businessId: this.config.businessId,
        clientType: 'PRINT_AGENT',
      },
      query: {
        agentToken: this.config.agentToken,
        businessId: this.config.businessId,
        clientType: 'PRINT_AGENT',
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      randomizationFactor: 0.5,
      timeout: 10000,
    });

    this.setupListeners();
  }

  private setupListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      this.isConnected = true;
      log.info(
        { socketId: this.socket?.id, backendUrl: this.config.backendUrl },
        'Connected to backend Socket.IO server'
      );

      this.emit('connected');
      this.requestPendingJobs();
    });

    this.socket.on('disconnect', (reason) => {
      this.isConnected = false;
      log.warn({ reason }, 'Disconnected from backend Socket.IO server');
      this.emit('disconnected', reason);
    });

    this.socket.on('connect_error', (err) => {
      log.error({ error: err.message }, 'Socket.IO connection error');
    });

    // Single print job event
    this.socket.on('print-job', (job: PrintJob) => {
      log.info({ jobId: job?.id, documentType: job?.documentType, orderId: job?.orderId }, 'Received new print job from backend');
      this.emit('job-received', job);
    });

    // Batch pending print jobs event
    this.socket.on('print-jobs-pending', (jobs: PrintJob[]) => {
      const count = Array.isArray(jobs) ? jobs.length : 0;
      log.info({ count }, 'Received pending print jobs batch from backend');
      if (Array.isArray(jobs) && count > 0) {
        this.emit('pending-jobs-received', jobs);
      }
    });

    this.socket.on('print-agent:jobs-batch', (payload: { jobs: PrintJob[] }) => {
      const jobs = payload?.jobs || [];
      if (Array.isArray(jobs) && jobs.length > 0) {
        log.info({ count: jobs.length }, 'Received print-agent:jobs-batch from backend');
        this.emit('pending-jobs-received', jobs);
      }
    });

    this.socket.on('print-agent:new-jobs-available', () => {
      log.info('New print jobs available signal received. Requesting pending jobs...');
      this.requestPendingJobs();
    });

    // Cashier/Admin requested a manual test print
    this.socket.on('test-print', (payload: TestPrintPayload = {}) => {
      log.info({ payload }, 'Received test-print command from backend');
      this.emit('test-print-requested', payload);
    });
  }

  public getIsConnected(): boolean {
    return this.isConnected;
  }

  public sendPrinterStatus(
    status: PrinterStatus,
    queueLength: number,
    error?: string
  ): void {
    if (!this.socket || !this.isConnected) {
      log.debug('Cannot emit printer-status: socket is not connected');
      return;
    }

    const payload: PrinterStatusPayload = {
      businessId: this.config.businessId,
      agentToken: this.config.agentToken,
      status,
      printerType: this.config.printerType,
      ip: this.config.printerType === 'network' ? this.config.printerIp : undefined,
      port: this.config.printerType === 'network' ? this.config.printerPort : undefined,
      timestamp: new Date().toISOString(),
      queueLength,
      error,
    };

    log.debug({ status, queueLength }, 'Emitting printer-status to backend');
    this.socket.emit('printer-status', payload);
  }

  public sendJobStatusUpdate(update: PrintJobStatusUpdatePayload): void {
    if (!this.socket || !this.isConnected) {
      log.warn({ jobId: update.jobId, status: update.status }, 'Socket offline; buffering status update internally');
    }

    log.info(
      { jobId: update.jobId, status: update.status, attempt: update.attemptCount, failure: update.failureReason },
      'Emitting print-job-status-update to backend'
    );

    this.socket?.emit('print-job-status-update', update);
  }

  public requestPendingJobs(): void {
    if (!this.socket || !this.isConnected) return;

    const payload: RequestPendingJobsPayload = {
      businessId: this.config.businessId,
      agentToken: this.config.agentToken,
    };

    log.info({ businessId: payload.businessId }, 'Requesting pending print jobs from backend');
    this.socket.emit('request-pending-jobs', payload);
  }

  public sendHeartbeat(printerStatus: PrinterStatus, queueLength: number): void {
    if (!this.socket || !this.isConnected) return;

    const uptime = Math.floor((Date.now() - this.startTime) / 1000);
    const payload: HeartbeatPayload = {
      businessId: this.config.businessId,
      agentToken: this.config.agentToken,
      timestamp: new Date().toISOString(),
      printerStatus,
      queueLength,
      uptime,
    };

    log.debug({ uptime, queueLength, printerStatus }, 'Sending agent heartbeat');
    this.socket.emit('heartbeat', payload);
  }

  public disconnect(): void {
    if (this.socket) {
      log.info('Closing socket connection to backend');
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }
}

export default SocketClient;
