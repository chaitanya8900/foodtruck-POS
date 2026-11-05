import { config, validateConfig } from './config';
import { logger } from './logger';
import { PrinterManager } from './printer';
import { SocketClient } from './socket';
import { JobProcessor } from './jobProcessor';
import { PrinterStatus, PrintJob } from './types';

const log = logger.child({ module: 'Main' });

function printBanner(): void {
  console.log(`
╔════════════════════════════════════════════════════════════════════╗
║                                                                    ║
║           FOOD TRUCK POS - LOCAL THERMAL PRINTER AGENT             ║
║                                                                    ║
╚════════════════════════════════════════════════════════════════════╝
  Mode:       ${config.printerType.toUpperCase()}
  Backend:    ${config.backendUrl}
  Business:   ${config.businessId}
  Paper:      ${config.paperWidth}mm
  Heartbeat:  ${config.heartbeatInterval / 1000}s
────────────────────────────────────────────────────────────────────
`);
}

async function bootstrap() {
  printBanner();
  validateConfig();

  // 1. Initialize Printer Manager
  const printer = new PrinterManager(config);

  // 2. Initialize Socket.IO Client
  const socketClient = new SocketClient(config);

  // 3. Initialize Job Processor
  const jobProcessor = new JobProcessor(printer, config, {
    onStatusUpdate: (update) => {
      socketClient.sendJobStatusUpdate(update);
    },
    onPartialPrintWarning: (orderId, printed, failed) => {
      log.warn({ orderId, printed, failed }, 'Order partially printed! Cashier intervention may be required.');
    },
  });

  // 4. Wire Printer status changes to backend
  printer.on('status-change', (status: PrinterStatus, error?: string) => {
    log.info({ status, error }, 'Printer status event triggered');
    socketClient.sendPrinterStatus(status, jobProcessor.getQueueLength(), error);
  });

  // 5. Wire Socket events to Job Processor and Printer
  socketClient.on('connected', () => {
    log.info('Backend connection established. Syncing status and pending jobs...');
    socketClient.sendPrinterStatus(printer.getStatus(), jobProcessor.getQueueLength());
    socketClient.requestPendingJobs();
  });

  socketClient.on('job-received', (job: PrintJob) => {
    log.info({ jobId: job.id, docType: job.documentType }, 'Enqueueing job received from socket');
    jobProcessor.enqueue(job);
  });

  socketClient.on('pending-jobs-received', (jobs: PrintJob[]) => {
    log.info({ count: jobs.length }, 'Enqueueing batch pending jobs received from socket');
    jobProcessor.enqueue(jobs);
  });

  socketClient.on('test-print-requested', async () => {
    log.info('Executing requested test print...');
    try {
      await printer.testPrint();
      log.info('Test print completed successfully');
    } catch (err: any) {
      log.error({ err: err.message }, 'Test print failed');
    }
  });

  // 6. Connect to Printer Hardware / Console
  try {
    await printer.connect();
  } catch (err: any) {
    log.error({ err: err.message }, 'Initial printer connection attempt encountered an issue');
  }

  // 7. Connect to Backend
  socketClient.connect();

  // 8. Setup Periodic Heartbeat
  const heartbeatTimer = setInterval(() => {
    const status = printer.getStatus();
    const queueLen = jobProcessor.getQueueLength();
    socketClient.sendHeartbeat(status, queueLen);
    socketClient.sendPrinterStatus(status, queueLen);
  }, config.heartbeatInterval);

  // 9. Graceful Shutdown Handlers
  let isShuttingDown = false;
  const handleShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    log.info(`Received ${signal}. Starting graceful shutdown...`);

    clearInterval(heartbeatTimer);

    // Give current printing job up to 4 seconds to finish
    if (jobProcessor.getQueueLength() > 0) {
      log.info('Waiting for active print operations to finalize...');
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    try {
      socketClient.disconnect();
    } catch (err) {
      log.error({ err }, 'Error disconnecting socket client');
    }

    try {
      await printer.disconnect();
    } catch (err) {
      log.error({ err }, 'Error disconnecting printer');
    }

    log.info('Food Truck Print Agent successfully stopped.');
    process.exit(0);
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGHUP', () => handleShutdown('SIGHUP'));

  process.on('unhandledRejection', (reason, promise) => {
    log.error({ reason, promise }, 'Unhandled Promise Rejection detected');
  });

  process.on('uncaughtException', (err) => {
    log.fatal({ err: err.message, stack: err.stack }, 'Uncaught Exception in process');
    // Ensure agent keeps running or restarts safely
  });
}

bootstrap().catch((err) => {
  log.fatal({ err }, 'Fatal error during Food Truck Print Agent startup');
  process.exit(1);
});
