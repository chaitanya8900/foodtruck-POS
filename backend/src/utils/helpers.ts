import crypto from 'crypto';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Rounds a number to two decimal places
 */
export function roundToTwo(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Generates a concise, readable order number.
 * Format: PREFIX-XXXX (e.g. QR-4829 or POS-1048) with a 4-digit code.
 */
export function generateOrderNumber(prefix = 'ORD'): string {
  const code = Math.floor(1000 + Math.random() * 9000); // 4-digit number between 1000 and 9999
  return `${prefix}-${code}`;
}

/**
 * Formats a numeric or Decimal value into currency display
 */
export function formatCurrency(amount: number | Decimal | string, currency = 'INR'): string {
  const numericAmount = typeof amount === 'number' ? amount : Number(amount);
  const formatted = numericAmount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return currency === 'INR' ? `₹${formatted}` : `${currency} ${formatted}`;
}

/**
 * Calculates tax and total from subtotal and discount
 */
export function calculateTax(
  subtotal: number,
  discount: number = 0,
  taxRatePercent: number = 5.0
): {
  subtotal: number;
  discount: number;
  taxableAmount: number;
  taxAmount: number;
  totalAmount: number;
} {
  const safeSubtotal = roundToTwo(Math.max(0, subtotal));
  const safeDiscount = roundToTwo(Math.min(safeSubtotal, Math.max(0, discount)));
  const taxableAmount = roundToTwo(safeSubtotal - safeDiscount);
  const taxAmount = roundToTwo((taxableAmount * taxRatePercent) / 100);
  const totalAmount = roundToTwo(taxableAmount + taxAmount);

  return {
    subtotal: safeSubtotal,
    discount: safeDiscount,
    taxableAmount,
    taxAmount,
    totalAmount
  };
}

/**
 * Generates a secure, URL-safe unique token for Table QR codes
 */
export function generateQRToken(): string {
  const timestamp = Date.now().toString(36);
  const randomHex = crypto.randomBytes(8).toString('hex');
  return `tbl_${timestamp}_${randomHex}`;
}
