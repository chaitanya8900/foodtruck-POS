import { OrderData, GeneratedPrintOutput } from '../types';
import { EscPosBuilder, WIDTH_80MM_NORMAL } from './escpos';

/**
 * Format currency amount cleanly
 */
export function formatCurrency(amount: number | undefined | null): string {
  if (amount === undefined || amount === null) return '₹0';
  const isWhole = Number.isInteger(amount);
  return `₹${isWhole ? amount.toFixed(0) : amount.toFixed(2)}`;
}

/**
 * Customer Receipt Template
 * Generates ESC/POS byte commands for 80mm thermal paper
 * Also generates structured plain text for console preview
 */
export function generateCustomerReceipt(rawOrder: any): GeneratedPrintOutput {
  const o = rawOrder || {};
  const order = o;
  const orderObj = o.order || {};
  const bizObj = o.business || {};
  const billObj = o.billing || {};

  const tokenNo = o.tokenNo || o.tokenNumber || orderObj.tokenNumber || orderObj.tokenNo || '001';
  const orderNumber = o.orderNumber || orderObj.orderNumber || o.orderId || orderObj.id || '';
  const orderType = (o.orderType || orderObj.orderType || 'DINE-IN').toUpperCase();
  const tableNo = o.tableNo || o.tableName || orderObj.tableName || '';
  const businessName = (o.businessName || bizObj.name || 'THE ROLLING GOURMET FOOD TRUCK').toUpperCase();
  const isReprint = Boolean(o.isReprint || o.reprint);

  const builder = new EscPosBuilder();
  const plainLines: string[] = [];
  const width = WIDTH_80MM_NORMAL; // 48 chars

  const separatorLine = '_'.repeat(width);

  // 1. REPRINT Header (if applicable)
  if (isReprint) {
    builder.centerAlign().bold(true).doubleSize(true).printLine('[REPRINT]').feed(1);
    plainLines.push(' '.repeat(Math.max(0, Math.floor((width - 9) / 2))) + '[REPRINT]');
  }

  // 2. Business Name
  builder.centerAlign().bold(true).doubleSize(true).printLine(businessName);
  plainLines.push(' '.repeat(Math.max(0, Math.floor((width - businessName.length) / 2))) + businessName);

  // 3. Divider
  builder.centerAlign().normalSize().bold(false).printLine(separatorLine);
  plainLines.push(separatorLine);

  // 4. Token Number
  const tokenText = `TOKEN NO: ${tokenNo}`;
  builder.centerAlign().bold(true).largeSize(true).printLine(tokenText);
  plainLines.push(' '.repeat(Math.max(0, Math.floor((width - tokenText.length) / 2))) + tokenText);

  // 5. Order Type & Table
  const isTakeaway = orderType === 'TAKEAWAY';
  const orderTypeText = `ORDER TYPE: ${isTakeaway ? 'TAKEAWAY' : 'DINE-IN'}`;
  builder.centerAlign().bold(true).normalSize().printLine(orderTypeText);
  plainLines.push(' '.repeat(Math.max(0, Math.floor((width - orderTypeText.length) / 2))) + orderTypeText);

  if (!isTakeaway && tableNo) {
    const tableText = `TABLE: ${tableNo}`;
    builder.centerAlign().bold(false).printLine(tableText);
    plainLines.push(' '.repeat(Math.max(0, Math.floor((width - tableText.length) / 2))) + tableText);
  }

  // 6. Divider
  builder.centerAlign().normalSize().bold(false).printLine(separatorLine);
  plainLines.push(separatorLine);

  // 7. Date & Time
  const dateStr = order.date || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = order.time || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const dateTimeLine = `Date: ${dateStr}  Time: ${timeStr}`;
  builder.leftAlign().normalSize().bold(false).printLine(dateTimeLine);
  plainLines.push(dateTimeLine);

  // 8. Divider
  builder.leftAlign().printLine(separatorLine);
  plainLines.push(separatorLine);

  // 9. Items List
  builder.leftAlign().normalSize().bold(false);
  plainLines.push('');

  for (const item of order.items || []) {
    const itemQtyName = `  ${item.quantity} × ${item.name}`;
    const itemPriceStr = item.price !== undefined ? formatCurrency(item.price * item.quantity) : '';

    builder.printColumns(itemQtyName, itemPriceStr, width);
    const spaces = Math.max(width - itemQtyName.length - itemPriceStr.length, 1);
    plainLines.push(`${itemQtyName}${' '.repeat(spaces)}${itemPriceStr}`);

    // Customizations / Add-ons
    if (item.customizations && item.customizations.length > 0) {
      for (const custom of item.customizations) {
        let customName = '';
        let customPriceStr = '';

        if (typeof custom === 'string') {
          customName = `    + ${custom}`;
        } else {
          customName = `    + ${custom.name}`;
          if (custom.price !== undefined && custom.price !== null) {
            customPriceStr = formatCurrency(custom.price);
          }
        }

        builder.printColumns(customName, customPriceStr, width);
        const customSpaces = Math.max(width - customName.length - customPriceStr.length, 1);
        plainLines.push(`${customName}${' '.repeat(customSpaces)}${customPriceStr}`);
      }
    }
  }

  // 10. Divider
  builder.leftAlign().printLine(separatorLine);
  plainLines.push(separatorLine);

  // 11. Bill Totals (Bold)
  builder.leftAlign().bold(true);

  // Calculate totals if not provided
  let calculatedSubtotal = 0;
  for (const item of o.items || []) {
    let itemPrice = Number(item.price || item.unitPrice || item.unit_price_snapshot || 0);
    let itemTotal = itemPrice * Number(item.quantity || 1);
    const customs = item.customizations || item.modifiers;
    if (customs && Array.isArray(customs)) {
      for (const c of customs) {
        if (typeof c !== 'string' && c.price) {
          itemTotal += Number(c.price);
        }
      }
    }
    calculatedSubtotal += itemTotal;
  }

  const finalSubtotal = o.subtotal !== undefined ? Number(o.subtotal) : (billObj.subtotal !== undefined ? Number(billObj.subtotal) : calculatedSubtotal);
  const finalTaxRate = o.taxRate !== undefined ? Number(o.taxRate) : (bizObj.tax_rate !== undefined ? Number(bizObj.tax_rate) : 5);
  const finalTaxAmount = o.taxAmount !== undefined ? Number(o.taxAmount) : (billObj.taxAmount !== undefined ? Number(billObj.taxAmount) : (finalSubtotal * finalTaxRate) / 100);
  const finalTotal = o.total !== undefined ? Number(o.total) : (billObj.totalAmount !== undefined ? Number(billObj.totalAmount) : (billObj.total !== undefined ? Number(billObj.total) : finalSubtotal + finalTaxAmount));

  const subtotalLineLeft = '  Subtotal:';
  const subtotalLineRight = formatCurrency(finalSubtotal);
  builder.printColumns(subtotalLineLeft, subtotalLineRight, width);
  plainLines.push(`${subtotalLineLeft}${' '.repeat(Math.max(width - subtotalLineLeft.length - subtotalLineRight.length, 1))}${subtotalLineRight}`);

  const taxLabel = `  Tax (${finalTaxRate}%):`;
  const taxLineRight = formatCurrency(finalTaxAmount);
  builder.printColumns(taxLabel, taxLineRight, width);
  plainLines.push(`${taxLabel}${' '.repeat(Math.max(width - taxLabel.length - taxLineRight.length, 1))}${taxLineRight}`);

  const totalLineLeft = '  Total:';
  const totalLineRight = formatCurrency(finalTotal);
  builder.printColumns(totalLineLeft, totalLineRight, width);
  plainLines.push(`${totalLineLeft}${' '.repeat(Math.max(width - totalLineLeft.length - totalLineRight.length, 1))}${totalLineRight}`);

  // 12. Divider
  builder.bold(false).printLine(separatorLine);
  plainLines.push(separatorLine);

  // 13. Payment Info
  const paymentMethod = (o.paymentMethod || billObj.paymentMethod || 'CASH').toUpperCase();
  builder.leftAlign().printLine(`Payment: ${paymentMethod}`);
  plainLines.push(`Payment: ${paymentMethod}`);

  const paymentRef = o.paymentRef || billObj.transactionReference || billObj.transaction_reference;
  if (paymentRef) {
    builder.leftAlign().printLine(`Ref: ${paymentRef}`);
    plainLines.push(`Ref: ${paymentRef}`);
  }

  // 14. Footer
  builder.feed(1);
  plainLines.push('');

  const thankYouText = 'Thank You! Visit Again!';
  builder.centerAlign().printLine(thankYouText);
  plainLines.push(' '.repeat(Math.max(0, Math.floor((width - thankYouText.length) / 2))) + thankYouText);

  builder.centerAlign().printLine(separatorLine);
  plainLines.push(separatorLine);

  const orderNumText = `Order #${orderNumber || '001'}`;
  const poweredByText = 'Powered by FoodTruck POS';

  builder.centerAlign().smallText(true).printLine(orderNumText);
  plainLines.push(' '.repeat(Math.max(0, Math.floor((width - orderNumText.length) / 2))) + orderNumText);

  builder.centerAlign().smallText(true).printLine(poweredByText);
  plainLines.push(' '.repeat(Math.max(0, Math.floor((width - poweredByText.length) / 2))) + poweredByText);

  // 15. Cut (Partial)
  builder.smallText(false).cut(true);

  return {
    buffer: builder.build(),
    plainText: plainLines.join('\n'),
  };
}
