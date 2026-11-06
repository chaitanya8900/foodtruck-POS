import QRCode from 'qrcode';
import prisma from '../prisma';
import { NotFoundError, ConflictError } from '../middleware/errorHandler';
import { generateQRToken } from '../utils/helpers';

export async function getTables(businessId: string, publicOnly: boolean = false) {
  return prisma.table.findMany({
    where: {
      business_id: businessId,
      ...(publicOnly ? { is_active: true } : {})
    },
    orderBy: { table_name: 'asc' },
    include: {
      _count: {
        select: {
          orders: {
            where: {
              order_status: {
                in: ['PENDING_PAYMENT', 'CONFIRMED', 'PREPARING', 'READY']
              }
            }
          }
        }
      }
    }
  });
}

export async function getTableById(id: string, businessId: string) {
  const table = await prisma.table.findFirst({
    where: { id, business_id: businessId }
  });

  if (!table) {
    throw new NotFoundError(`Table with ID ${id} not found.`);
  }

  return table;
}

export async function getTableByQrToken(qrToken: string) {
  const table = await prisma.table.findUnique({
    where: { qr_token: qrToken },
    include: {
      business: {
        select: {
          id: true,
          name: true,
          is_dine_in_enabled: true,
          is_takeaway_enabled: true,
          tax_rate: true,
          currency: true,
          operating_hours: true,
          timezone: true
        }
      }
    }
  });

  if (!table || !table.is_active) {
    throw new NotFoundError('Invalid or inactive table QR code.');
  }

  return table;
}

export async function createTable(
  businessId: string,
  data: {
    table_name: string;
    is_active?: boolean;
  }
) {
  const existing = await prisma.table.findFirst({
    where: {
      business_id: businessId,
      table_name: data.table_name.trim()
    }
  });

  if (existing) {
    throw new ConflictError(`Table "${data.table_name}" already exists.`);
  }

  const qrToken = generateQRToken();

  return prisma.table.create({
    data: {
      business_id: businessId,
      table_name: data.table_name.trim(),
      qr_token: qrToken,
      is_active: data.is_active ?? true
    }
  });
}

export async function updateTable(
  id: string,
  businessId: string,
  data: Partial<{
    table_name: string;
    is_active: boolean;
  }>
) {
  await getTableById(id, businessId);

  if (data.table_name) {
    const existing = await prisma.table.findFirst({
      where: {
        business_id: businessId,
        table_name: data.table_name.trim(),
        NOT: { id }
      }
    });

    if (existing) {
      throw new ConflictError(`Another table with name "${data.table_name}" already exists.`);
    }
  }

  return prisma.table.update({
    where: { id },
    data: {
      ...data,
      table_name: data.table_name ? data.table_name.trim() : undefined,
      updated_at: new Date()
    }
  });
}

export async function deleteTable(id: string, businessId: string) {
  await getTableById(id, businessId);

  return prisma.table.delete({
    where: { id }
  });
}

export async function regenerateQrToken(id: string, businessId: string) {
  await getTableById(id, businessId);

  const newQrToken = generateQRToken();

  return prisma.table.update({
    where: { id },
    data: {
      qr_token: newQrToken,
      updated_at: new Date()
    }
  });
}

export async function getTableQRCodeDataUrl(
  id: string,
  businessId: string,
  frontendUrl?: string
): Promise<{ table: any; qrCodeDataUrl: string; orderUrl: string }> {
  const table = await getTableById(id, businessId);
  const defaultFrontendUrl =
    process.env.PUBLIC_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined) ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ||
    process.env.FRONTEND_URL ||
    'http://localhost:3000';
  const base = (frontendUrl || defaultFrontendUrl).replace(/\/$/, '');
  const orderUrl = `${base}/order/t/${table.qr_token}`;

  const qrCodeDataUrl = await QRCode.toDataURL(orderUrl, {
    width: 400,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#ffffff'
    }
  });

  return { table, qrCodeDataUrl, orderUrl };
}
