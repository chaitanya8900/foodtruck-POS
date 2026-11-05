import { Socket, Server } from 'socket.io';
import logger from '../utils/logger';
import * as printService from '../services/print.service';
import { PrintJobStatus } from '@prisma/client';

import prisma from '../prisma';

export function registerPrintAgentHandlers(io: Server, socket: Socket) {
  let authenticatedBusinessId: string | null =
    socket.handshake.auth?.businessId || socket.handshake.query?.businessId || null;
  let printerName: string = 'Thermal-Printer';

  const resolveBusinessId = async (providedId?: string | null): Promise<string | null> => {
    try {
      let id = providedId || authenticatedBusinessId;
      if (!id || id === 'foodtruck-biz-01') {
        const defaultBiz = await prisma.business.findFirst({ where: { is_active: true } });
        if (defaultBiz) id = defaultBiz.id;
      }
      return id;
    } catch (err: any) {
      logger.error({ err }, 'Error resolving businessId for print agent');
      return null;
    }
  };

  // Auto-join on connection if businessId is provided in handshake
  resolveBusinessId()
    .then((bizId) => {
      if (bizId) {
        authenticatedBusinessId = bizId;
        socket.join(`business:${bizId}`);
        socket.join(`printer:${bizId}`);
        logger.info({ businessId: bizId, socketId: socket.id }, 'Print agent auto-joined rooms');
      }
    })
    .catch((err) => {
      logger.error({ err }, 'Error in auto-joining print agent room');
    });

  // Handle Authenticate
  const handleAuthenticate = async (data: any, callback?: any) => {
    try {
      const bizId = await resolveBusinessId(data?.businessId);
      if (!bizId) {
        if (callback) callback({ success: false, error: 'businessId is required' });
        return;
      }

      authenticatedBusinessId = bizId;
      if (data?.printerName) printerName = data.printerName;

      socket.join(`business:${authenticatedBusinessId}`);
      socket.join(`printer:${authenticatedBusinessId}`);

      logger.info(
        { businessId: authenticatedBusinessId, printerName, socketId: socket.id },
        'Print agent authenticated successfully'
      );

      io.to(`business:${authenticatedBusinessId}`).emit('printer-status', {
        businessId: authenticatedBusinessId,
        printerName,
        status: 'ONLINE',
        lastSeen: new Date().toISOString()
      });

      if (callback) callback({ success: true, message: 'Print agent authenticated' });
    } catch (err: any) {
      logger.error({ err }, 'Error authenticating print agent');
      if (callback) callback({ success: false, error: err.message });
    }
  };

  socket.on('print-agent:authenticate', handleAuthenticate);
  socket.on('authenticate', handleAuthenticate);

  // Handle Request Pending Jobs
  const handleRequestJobs = async (data?: any, callback?: any) => {
    try {
      const bizId = await resolveBusinessId(data?.businessId);
      if (!bizId) {
        if (callback) callback({ success: false, error: 'Not authenticated with a business' });
        return;
      }

      const jobs = await printService.getPendingPrintJobs(bizId);

      const formattedJobs = await Promise.all(
        jobs.map(async (job) => {
          let payload = null;
          if (job.document_type === 'CUSTOMER_RECEIPT') {
            payload = await printService.getReceiptData(job.order_id, job.is_reprint);
          } else if (job.document_type === 'KOT') {
            payload = await printService.getKOTData(job.order_id, job.is_reprint);
          }
          return {
            id: job.id,
            orderId: job.order_id,
            documentType: job.document_type,
            status: job.status,
            isReprint: job.is_reprint,
            attemptCount: job.attempt_count,
            createdAt: job.created_at,
            data: payload
          };
        })
      );

      logger.info(
        { businessId: bizId, jobCount: formattedJobs.length },
        'Dispatched pending print jobs to agent'
      );

      // Emit to client across all expected event signatures
      socket.emit('print-jobs-pending', formattedJobs);
      socket.emit('print-agent:jobs-batch', { jobs: formattedJobs });
      formattedJobs.forEach((job) => socket.emit('print-job', job));

      if (callback) {
        callback({ success: true, jobs: formattedJobs });
      }
    } catch (err: any) {
      logger.error({ err }, 'Error fetching print jobs for agent');
      if (callback) callback({ success: false, error: err.message });
    }
  };

  socket.on('print-agent:request-jobs', handleRequestJobs);
  socket.on('request-pending-jobs', handleRequestJobs);
  socket.on('request-jobs', handleRequestJobs);

  // Handle Job Status Update
  const handleJobStatus = async (data: any, callback?: any) => {
    try {
      const jobId = data?.jobId || data?.id;
      const status = data?.status as PrintJobStatus;
      const failureReason = data?.failureReason || data?.error;

      if (!jobId || !status) return;

      const updatedJob = await printService.updatePrintJobStatus(jobId, status, failureReason);

      if (authenticatedBusinessId) {
        io.to(`business:${authenticatedBusinessId}`).emit('print-job-update', {
          jobId: updatedJob.id,
          orderId: updatedJob.order_id,
          documentType: updatedJob.document_type,
          status: updatedJob.status,
          failureReason: updatedJob.failure_reason,
          printedAt: updatedJob.printed_at
        });
      }

      if (callback) callback({ success: true, job: updatedJob });
    } catch (err: any) {
      logger.error({ err }, 'Error updating print job status from agent');
      if (callback) callback({ success: false, error: err.message });
    }
  };

  socket.on('print-agent:job-status', handleJobStatus);
  socket.on('print-job-status-update', handleJobStatus);

  // Handle Heartbeat & Printer Status
  const handleHeartbeat = (data: any) => {
    const bizId = authenticatedBusinessId || data?.businessId;
    if (!bizId) return;

    const rawStatus = (data?.printerStatus || data?.status || 'ONLINE').toUpperCase();
    const status = rawStatus === 'CONNECTED' ? 'ONLINE' : rawStatus;

    io.to(`business:${bizId}`).emit('printer-status', {
      businessId: bizId,
      printerName: data?.printerName || printerName,
      status,
      paperStatus: data?.paperStatus || 'OK',
      queueLength: data?.queueLength || 0,
      lastSeen: new Date().toISOString()
    });
  };

  socket.on('print-agent:heartbeat', handleHeartbeat);
  socket.on('heartbeat', handleHeartbeat);
  socket.on('printer-status', handleHeartbeat);

  // Disconnect
  socket.on('disconnect', () => {
    if (authenticatedBusinessId) {
      io.to(`business:${authenticatedBusinessId}`).emit('printer-status', {
        businessId: authenticatedBusinessId,
        printerName,
        status: 'OFFLINE',
        lastSeen: new Date().toISOString()
      });
      logger.info(
        { businessId: authenticatedBusinessId, socketId: socket.id },
        'Print agent disconnected'
      );
    }
  });
}
