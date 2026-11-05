import { DocumentType, PrintJobStatus, PrismaClient } from '@prisma/client';
import prisma from '../prisma';
import { NotFoundError } from '../middleware/errorHandler';
import { ReceiptData, KOTData } from '../types';
import { getIO } from '../socket';

type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * Creates Customer Receipt and KOT print jobs for a confirmed order.
 */
export async function createPrintJobs(
  orderId: string,
  isReprint: boolean = false,
  tx?: PrismaTransactionClient
) {
  const client = tx || prisma;

  const order = await client.order.findUnique({
    where: { id: orderId }
  });

  if (!order) {
    throw new NotFoundError(`Order ${orderId} not found.`);
  }

  // Create CUSTOMER_RECEIPT job
  const receiptJob = await client.printJob.create({
    data: {
      order_id: orderId,
      document_type: DocumentType.CUSTOMER_RECEIPT,
      status: PrintJobStatus.PENDING,
      is_reprint: isReprint,
      attempt_count: 0
    }
  });

  // Create KOT job
  const kotJob = await client.printJob.create({
    data: {
      order_id: orderId,
      document_type: DocumentType.KOT,
      status: PrintJobStatus.PENDING,
      is_reprint: isReprint,
      attempt_count: 0
    }
  });

  return { receiptJob, kotJob };
}

/**
 * Retrieves all pending print jobs for a business, sorted oldest first.
 */
export async function getPendingPrintJobs(businessId: string) {
  const jobs = await prisma.printJob.findMany({
    where: {
      status: PrintJobStatus.PENDING,
      order: {
        business_id: businessId
      }
    },
    orderBy: { created_at: 'asc' },
    include: {
      order: {
        include: {
          table: true,
          items: true,
          business: true
        }
      }
    }
  });

  return jobs;
}

/**
 * Updates print job status, recording printed_at or failure reason.
 */
export async function updatePrintJobStatus(
  jobId: string,
  status: PrintJobStatus,
  failureReason?: string
) {
  const job = await prisma.printJob.findUnique({
    where: { id: jobId },
    include: { order: true }
  });

  if (!job) {
    throw new NotFoundError(`Print job ${jobId} not found.`);
  }

  const updated = await prisma.printJob.update({
    where: { id: jobId },
    data: {
      status,
      failure_reason: status === PrintJobStatus.FAILED ? failureReason || 'Unknown printer failure' : null,
      printed_at: status === PrintJobStatus.PRINTED ? new Date() : undefined,
      attempt_count: status === PrintJobStatus.PRINTING ? job.attempt_count + 1 : undefined,
      updated_at: new Date()
    },
    include: {
      order: true
    }
  });

  return updated;
}

/**
 * Retries a failed or pending print job by incrementing attempt count and resetting status.
 */
export async function retryPrintJob(jobId: string) {
  const job = await prisma.printJob.findUnique({
    where: { id: jobId }
  });

  if (!job) {
    throw new NotFoundError(`Print job ${jobId} not found.`);
  }

  return prisma.printJob.update({
    where: { id: jobId },
    data: {
      status: PrintJobStatus.PENDING,
      failure_reason: null,
      updated_at: new Date()
    }
  });
}

/**
 * Formats full customer receipt data.
 */
export async function getReceiptData(orderId: string, isReprint = false): Promise<ReceiptData> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      business: true,
      table: true,
      items: true
    }
  });

  if (!order) {
    throw new NotFoundError(`Order ${orderId} not found.`);
  }

  const mappedItems = order.items.map((item) => {
    let modifiers: { name: string; price: number }[] = [];
    if (item.customization_snapshot) {
      try {
        const parsed = typeof item.customization_snapshot === 'string'
          ? JSON.parse(item.customization_snapshot)
          : item.customization_snapshot;
        if (Array.isArray(parsed)) {
          modifiers = parsed.map((m: any) => ({
            name: m.option_name || m.name || '',
            price: Number(m.price || 0)
          }));
        }
      } catch {
        // ignore parsing error
      }
    }

    return {
      name: item.item_name_snapshot,
      quantity: item.quantity,
      price: Number(item.unit_price_snapshot),
      unitPrice: Number(item.unit_price_snapshot),
      lineTotal: Number(item.line_total),
      customizations: modifiers,
      modifiers
    };
  });

  return {
    orderId: order.id,
    orderNumber: order.order_number,
    tokenNo: order.token_number || '001',
    tokenNumber: order.token_number || '001',
    orderType: order.order_type,
    tableNo: order.table?.table_name || '',
    tableName: order.table?.table_name || '',
    businessName: order.business.name,
    subtotal: Number(order.subtotal),
    discount: Number(order.discount),
    taxRate: Number(order.business.tax_rate || 5),
    taxAmount: Number(order.tax_amount),
    total: Number(order.total_amount),
    totalAmount: Number(order.total_amount),
    paymentMethod: order.payment_method || 'CASH',
    specialInstructions: order.special_instructions || '',
    isReprint,
    reprint: isReprint,
    business: {
      name: order.business.name,
      address: order.business.address,
      phone: order.business.phone,
      gstin: order.business.gstin,
      fssai: order.business.fssai_number,
      header: order.business.receipt_header,
      footer: order.business.receipt_footer
    },
    order: {
      id: order.id,
      orderNumber: order.order_number,
      tokenNumber: order.token_number,
      orderType: order.order_type,
      source: order.source,
      tableName: order.table?.table_name || null,
      createdAt: order.created_at.toISOString(),
      confirmedAt: order.confirmed_at ? order.confirmed_at.toISOString() : null
    },
    items: mappedItems,
    billing: {
      subtotal: Number(order.subtotal),
      discount: Number(order.discount),
      taxAmount: Number(order.tax_amount),
      totalAmount: Number(order.total_amount),
      paymentMethod: order.payment_method,
      paymentStatus: order.payment_status
    }
  } as any;
}

/**
 * Formats full KOT (Kitchen Order Ticket) data.
 */
export async function getKOTData(orderId: string, isReprint = false): Promise<KOTData> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      business: true,
      table: true,
      items: true
    }
  });

  if (!order) {
    throw new NotFoundError(`Order ${orderId} not found.`);
  }

  const mappedItems = order.items.map((item) => {
    let modifiers: string[] = [];
    if (item.customization_snapshot) {
      try {
        const parsed = typeof item.customization_snapshot === 'string'
          ? JSON.parse(item.customization_snapshot)
          : item.customization_snapshot;
        if (Array.isArray(parsed)) {
          modifiers = parsed.map((m: any) => m.option_name || m.name || '');
        }
      } catch {
        // ignore
      }
    }

    return {
      name: item.item_name_snapshot,
      quantity: item.quantity,
      customizations: modifiers,
      modifiers,
      specialInstructions: item.special_instructions
    };
  });

  return {
    orderId: order.id,
    orderNumber: order.order_number,
    tokenNo: order.token_number || '001',
    tokenNumber: order.token_number || '001',
    orderType: order.order_type,
    tableNo: order.table?.table_name || '',
    tableName: order.table?.table_name || '',
    businessName: order.business.name || 'FOOD TRUCK POS',
    specialInstructions: order.special_instructions || '',
    isReprint,
    reprint: isReprint,
    order: {
      id: order.id,
      orderNumber: order.order_number,
      tokenNumber: order.token_number,
      orderType: order.order_type,
      source: order.source,
      tableName: order.table?.table_name || null,
      createdAt: order.created_at.toISOString(),
      confirmedAt: order.confirmed_at ? order.confirmed_at.toISOString() : null,
      specialInstructions: order.special_instructions
    },
    items: mappedItems
  } as any;
}

/**
 * Immediately dispatches print jobs for an order over Socket.IO to the print agent.
 */
export async function dispatchPrintJobsForOrder(orderId: string, businessId: string): Promise<void> {
  try {
    const jobs = await prisma.printJob.findMany({
      where: {
        order_id: orderId,
        status: PrintJobStatus.PENDING
      }
    });

    if (!jobs || jobs.length === 0) return;

    const formattedJobs = await Promise.all(
      jobs.map(async (job) => {
        let payload = null;
        if (job.document_type === DocumentType.CUSTOMER_RECEIPT) {
          payload = await getReceiptData(job.order_id, job.is_reprint);
        } else if (job.document_type === DocumentType.KOT) {
          payload = await getKOTData(job.order_id, job.is_reprint);
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

    const io = getIO();
    if (io) {
      io.to(`printer:${businessId}`).emit('print-jobs-pending', formattedJobs);
      io.to(`business:${businessId}`).emit('print-jobs-pending', formattedJobs);
      formattedJobs.forEach((job) => {
        io.to(`printer:${businessId}`).emit('print-job', job);
        io.to(`business:${businessId}`).emit('print-job', job);
      });
      io.to(`printer:${businessId}`).emit('print-agent:new-jobs-available', {
        orderId,
        businessId
      });
    }
  } catch {
    // Non-blocking: Socket dispatch should not break order flow
  }
}

