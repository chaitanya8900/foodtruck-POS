import { EventEmitter } from 'events';
import {
  PrintJob,
  PrintJobStatus,
  PrintJobStatusUpdatePayload,
  GeneratedPrintOutput,
  IPrinter,
} from './types';
import { AppConfig } from './config';
import { createChildLogger } from './logger';
import { generateCustomerReceipt } from './templates/receipt';
import { generateKitchenOrderTicket } from './templates/kot';

const log = createChildLogger('JobProcessor');

export interface JobProcessorCallbacks {
  onStatusUpdate: (payload: PrintJobStatusUpdatePayload) => void;
  onPartialPrintWarning?: (orderId: string, printedType: string, failedType: string) => void;
}

export class JobProcessor extends EventEmitter {
  private queue: PrintJob[] = [];
  private activeJob: PrintJob | null = null;
  private isProcessing = false;
  private recentHistory = new Map<string, { status: PrintJobStatus; timestamp: number }>();
  private orderSlipsTracker = new Map<string, { receiptStatus?: PrintJobStatus; kotStatus?: PrintJobStatus }>();

  constructor(
    private readonly printer: IPrinter,
    private readonly config: AppConfig,
    private readonly callbacks: JobProcessorCallbacks
  ) {
    super();
  }

  /**
   * Enqueue a new print job or multiple jobs
   */
  public enqueue(jobOrJobs: PrintJob | PrintJob[]): void {
    const jobs = Array.isArray(jobOrJobs) ? jobOrJobs : [jobOrJobs];

    for (const job of jobs) {
      if (!job || !job.id) {
        log.warn('Skipping invalid print job (missing id)');
        continue;
      }

      // Check if job already in queue
      const existsInQueue = this.queue.some((j) => j.id === job.id);
      if (existsInQueue) {
        log.warn({ jobId: job.id }, 'Print job is already queued. Skipping duplicate.');
        continue;
      }

      // Check if job is currently active
      if (this.activeJob && this.activeJob.id === job.id) {
        log.warn({ jobId: job.id }, 'Print job is currently actively printing. Skipping duplicate.');
        continue;
      }

      // Check if job was completed very recently (within 10 seconds) to prevent duplicate prints
      const recent = this.recentHistory.get(job.id);
      if (recent && recent.status === 'PRINTED' && Date.now() - recent.timestamp < 10000) {
        log.warn({ jobId: job.id }, 'Print job was recently printed within the last 10s. Skipping duplicate.');
        continue;
      }

      // Normalize job properties
      const normalizedJob: PrintJob = {
        id: job.id,
        orderId: job.orderId || job.data?.orderId || job.id,
        documentType: (job.documentType || 'CUSTOMER_RECEIPT').toUpperCase() as any,
        status: 'PENDING',
        attempts: job.attempts || 0,
        maxAttempts: job.maxAttempts || this.config.maxRetryAttempts,
        data: job.data,
        createdAt: job.createdAt || new Date().toISOString(),
      };

      this.queue.push(normalizedJob);
      log.info(
        {
          jobId: normalizedJob.id,
          orderId: normalizedJob.orderId,
          docType: normalizedJob.documentType,
          queueLength: this.queue.length,
        },
        'Enqueued print job'
      );
    }

    this.processQueue();
  }

  /**
   * Get current queue length
   */
  public getQueueLength(): number {
    return this.queue.length + (this.activeJob ? 1 : 0);
  }

  /**
   * Process jobs sequentially from the FIFO queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    if (this.queue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    this.activeJob = this.queue.shift()!;

    try {
      await this.executeJob(this.activeJob);
    } catch (err: any) {
      log.error({ jobId: this.activeJob.id, error: err.message }, 'Unexpected error processing print job');
    } finally {
      this.activeJob = null;
      this.isProcessing = false;

      // Continue processing next job in queue
      if (this.queue.length > 0) {
        setImmediate(() => this.processQueue());
      }
    }
  }

  /**
   * Execute single print job with error handling and retry logic
   */
  private async executeJob(job: PrintJob): Promise<void> {
    job.attempts += 1;
    job.status = 'PRINTING';

    log.info(
      { jobId: job.id, orderId: job.orderId, attempt: job.attempts, maxAttempts: job.maxAttempts },
      'Starting print execution'
    );

    // Notify backend that printing has started
    this.callbacks.onStatusUpdate({
      jobId: job.id,
      orderId: job.orderId,
      documentType: job.documentType,
      status: 'PRINTING',
      attemptCount: job.attempts,
      timestamp: new Date().toISOString(),
    });

    try {
      // 1. Generate template commands based on documentType
      const output = this.generateOutput(job);

      // 2. Send commands to printer
      await this.printer.print(output.buffer, output.plainText);

      // 3. Printing succeeded!
      job.status = 'PRINTED';
      job.printedAt = new Date().toISOString();

      log.info({ jobId: job.id, orderId: job.orderId, docType: job.documentType }, 'Print job completed successfully');

      this.recordSlipStatus(job.orderId, job.documentType, 'PRINTED');
      this.recentHistory.set(job.id, { status: 'PRINTED', timestamp: Date.now() });

      this.callbacks.onStatusUpdate({
        jobId: job.id,
        orderId: job.orderId,
        documentType: job.documentType,
        status: 'PRINTED',
        attemptCount: job.attempts,
        printedAt: job.printedAt,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      const errorMessage = err?.message || 'Unknown printer error';
      log.error(
        { jobId: job.id, attempt: job.attempts, maxAttempts: job.maxAttempts, err: errorMessage },
        'Print job failed during printing'
      );

      // 4. Retry logic
      if (job.attempts < job.maxAttempts) {
        log.warn(
          { jobId: job.id, nextAttempt: job.attempts + 1, maxAttempts: job.maxAttempts },
          'Scheduling retry for failed print job...'
        );

        // Put back at the beginning of the queue after a short backoff delay
        await new Promise((resolve) => setTimeout(resolve, 2000));
        this.queue.unshift(job);
      } else {
        // Job completely failed after exhausting all attempts
        job.status = 'FAILED';
        job.failureReason = errorMessage;

        log.error(
          { jobId: job.id, orderId: job.orderId, docType: job.documentType, reason: errorMessage },
          'Print job failed permanently after reaching max retry attempts'
        );

        this.recordSlipStatus(job.orderId, job.documentType, 'FAILED');
        this.recentHistory.set(job.id, { status: 'FAILED', timestamp: Date.now() });

        this.callbacks.onStatusUpdate({
          jobId: job.id,
          orderId: job.orderId,
          documentType: job.documentType,
          status: 'FAILED',
          attemptCount: job.attempts,
          failureReason: errorMessage,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  /**
   * Track slips per order to detect and handle partial printing
   */
  private recordSlipStatus(orderId: string, docType: string, status: PrintJobStatus): void {
    const existing = this.orderSlipsTracker.get(orderId) || {};
    if (docType === 'CUSTOMER_RECEIPT') {
      existing.receiptStatus = status;
    } else if (docType === 'KOT') {
      existing.kotStatus = status;
    }
    this.orderSlipsTracker.set(orderId, existing);

    // Detect partial printing condition
    if (existing.receiptStatus && existing.kotStatus) {
      if (existing.receiptStatus === 'PRINTED' && existing.kotStatus === 'FAILED') {
        log.warn({ orderId }, 'PARTIAL PRINT DETECTED: Receipt printed successfully but KOT failed.');
        if (this.callbacks.onPartialPrintWarning) {
          this.callbacks.onPartialPrintWarning(orderId, 'CUSTOMER_RECEIPT', 'KOT');
        }
      } else if (existing.kotStatus === 'PRINTED' && existing.receiptStatus === 'FAILED') {
        log.warn({ orderId }, 'PARTIAL PRINT DETECTED: KOT printed successfully but Receipt failed.');
        if (this.callbacks.onPartialPrintWarning) {
          this.callbacks.onPartialPrintWarning(orderId, 'KOT', 'CUSTOMER_RECEIPT');
        }
      }
    }
  }

  /**
   * Generate ESC/POS commands and plain text for the given job
   */
  private generateOutput(job: PrintJob): GeneratedPrintOutput {
    const docType = (job.documentType || 'CUSTOMER_RECEIPT').toUpperCase();

    if (docType === 'KOT' || docType.includes('KITCHEN')) {
      return generateKitchenOrderTicket(job.data);
    } else {
      return generateCustomerReceipt(job.data);
    }
  }

  /**
   * Clear all pending queued jobs
   */
  public clearQueue(): void {
    const droppedCount = this.queue.length;
    this.queue = [];
    log.info({ droppedCount }, 'Cleared print job queue');
  }
}

export default JobProcessor;
