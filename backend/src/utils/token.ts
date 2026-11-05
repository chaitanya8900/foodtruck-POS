import { Prisma, PrismaClient } from '@prisma/client';
import prisma from '../prisma';

type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * Calculates the current business date based on timezone and daily reset time (e.g., '04:00').
 * If local time is before the reset time, it belongs to the previous calendar day.
 */
export function getBusinessDate(timezone: string = 'Asia/Kolkata', resetTime: string = '04:00'): Date {
  const now = new Date();

  // Get local date and time string in the business timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(now);
  const partMap: Record<string, string> = {};
  for (const p of parts) {
    partMap[p.type] = p.value;
  }

  const year = parseInt(partMap['year'], 10);
  const month = parseInt(partMap['month'], 10) - 1; // 0-indexed
  const day = parseInt(partMap['day'], 10);
  const hour = parseInt(partMap['hour'], 10);
  const minute = parseInt(partMap['minute'], 10);

  const [resetHourStr, resetMinStr] = (resetTime || '04:00').split(':');
  const resetHour = parseInt(resetHourStr, 10) || 4;
  const resetMinute = parseInt(resetMinStr, 10) || 0;

  const localTimeInMinutes = hour * 60 + minute;
  const resetTimeInMinutes = resetHour * 60 + resetMinute;

  const dateObj = new Date(Date.UTC(year, month, day));

  // If before daily reset time, this belongs to the previous business date
  if (localTimeInMinutes < resetTimeInMinutes) {
    dateObj.setUTCDate(dateObj.getUTCDate() - 1);
  }

  return dateObj;
}

const businessSettingsCache = new Map<string, { prefix: string; timezone: string; resetTime: string; expiresAt: number }>();

export function invalidateBusinessTokenCache(businessId: string) {
  businessSettingsCache.delete(businessId);
}

/**
 * Generates the next sequential token number for the given business and business date.
 * Uses a single atomic PostgreSQL UPSERT with RETURNING inside a transaction for instant execution.
 */
export async function generateNextToken(
  businessId: string,
  tx?: PrismaTransactionClient
): Promise<string> {
  const execute = async (client: PrismaTransactionClient): Promise<string> => {
    // 1. Get business details from in-memory cache (or query if expired)
    let cached = businessSettingsCache.get(businessId);
    if (!cached || Date.now() > cached.expiresAt) {
      const business = await client.business.findUnique({
        where: { id: businessId },
        select: {
          token_prefix: true,
          timezone: true,
          token_reset_time: true
        }
      });

      cached = {
        timezone: business?.timezone || 'Asia/Kolkata',
        resetTime: business?.token_reset_time || '04:00',
        prefix: business?.token_prefix !== undefined && business.token_prefix !== null ? business.token_prefix : 'T-',
        expiresAt: Date.now() + 60 * 1000 // Cache for 60 seconds
      };
      businessSettingsCache.set(businessId, cached);
    }

    const { timezone, resetTime, prefix } = cached;
    const businessDate = getBusinessDate(timezone, resetTime);
    const dateString = businessDate.toISOString().split('T')[0];

    // 2. Single atomic PostgreSQL UPSERT (concurrency-safe, eliminates 3 separate round-trips)
    const rows = await client.$queryRaw<{ current_sequence: number }[]>`
      INSERT INTO "token_sequences" ("id", "business_id", "business_date", "current_sequence")
      VALUES (gen_random_uuid(), ${businessId}::uuid, ${dateString}::date, 1)
      ON CONFLICT ("business_id", "business_date")
      DO UPDATE SET "current_sequence" = "token_sequences"."current_sequence" + 1
      RETURNING "current_sequence";
    `;

    if (!rows || rows.length === 0) {
      throw new Error(`Failed to generate token sequence for business ${businessId}`);
    }

    const nextSeq = rows[0].current_sequence;
    const padded = String(nextSeq).padStart(3, '0');
    return `${prefix}${padded}`;
  };

  if (tx) {
    return execute(tx);
  }

  return prisma.$transaction(
    async (client) => {
      return execute(client);
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable
    }
  );
}
