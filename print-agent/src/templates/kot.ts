import { OrderData, GeneratedPrintOutput } from '../types';
import { EscPosBuilder, WIDTH_80MM_NORMAL } from './escpos';

/**
 * Kitchen Order Ticket (KOT) Template
 * Generates ESC/POS byte commands for 80mm thermal paper
 * NOTE: KOT must NOT contain payment details, prices, or customer billing info
 */
export function generateKitchenOrderTicket(rawOrder: any): GeneratedPrintOutput {
  const o = rawOrder || {};
  const order = o;
  const orderObj = o.order || {};
  const bizObj = o.business || {};

  const tokenNo = o.tokenNo || o.tokenNumber || orderObj.tokenNumber || orderObj.tokenNo || '001';
  const orderNumber = o.orderNumber || orderObj.orderNumber || o.orderId || orderObj.id || '';
  const orderId = o.orderId || orderObj.id || '';
  const orderType = (o.orderType || orderObj.orderType || 'DINE-IN').toUpperCase();
  const tableNo = o.tableNo || o.tableName || orderObj.tableName || '';
  const businessName = (o.businessName || bizObj.name || 'THE ROLLING GOURMET FOOD TRUCK').toUpperCase();
  const isReprint = Boolean(o.isReprint || o.reprint);
  const specialInstructions = o.specialInstructions || orderObj.specialInstructions || '';

  const builder = new EscPosBuilder();
  const plainLines: string[] = [];
  const width = WIDTH_80MM_NORMAL; // 48 chars

  const doubleSeparator = '='.repeat(width);

  // 1. REPRINT Header (if applicable)
  if (isReprint) {
    builder.centerAlign().bold(true).doubleSize(true).printLine('[REPRINT]').feed(1);
    plainLines.push(' '.repeat(Math.max(0, Math.floor((width - 9) / 2))) + '[REPRINT]');
  }

  // 2. Business Name
  builder.centerAlign().bold(true).doubleSize(true).printLine(businessName);
  plainLines.push(' '.repeat(Math.max(0, Math.floor((width - businessName.length) / 2))) + businessName);

  // 3. Document Title
  const kotTitle = 'KITCHEN ORDER TICKET';
  builder.centerAlign().bold(true).doubleSize(true).printLine(kotTitle);
  plainLines.push(' '.repeat(Math.max(0, Math.floor((width - kotTitle.length) / 2))) + kotTitle);

  // 4. Double Separator
  builder.centerAlign().normalSize().bold(false).printLine(doubleSeparator);
  plainLines.push(doubleSeparator);

  // 5. Token Number (TRIPLE_SIZE)
  const tokenText = `TOKEN: ${tokenNo}`;
  builder.centerAlign().bold(true).tripleSize(true).printLine(tokenText);
  plainLines.push(' '.repeat(Math.max(0, Math.floor((width - tokenText.length) / 2))) + tokenText);

  // 6. Order Type & Table
  const isTakeaway = orderType === 'TAKEAWAY';
  const orderTypeText = isTakeaway ? 'TAKEAWAY' : 'DINE-IN';

  builder.centerAlign().bold(true).doubleSize(true).printLine(orderTypeText);
  plainLines.push(' '.repeat(Math.max(0, Math.floor((width - orderTypeText.length) / 2))) + orderTypeText);

  if (!isTakeaway && tableNo) {
    const tableText = `TABLE: ${tableNo}`;
    builder.centerAlign().bold(true).normalSize().printLine(tableText);
    plainLines.push(' '.repeat(Math.max(0, Math.floor((width - tableText.length) / 2))) + tableText);
  }

  // 7. Double Separator
  builder.centerAlign().normalSize().bold(false).printLine(doubleSeparator);
  plainLines.push(doubleSeparator);

  // 8. Order Items (LARGE, UPPERCASE, NO PRICES)
  builder.leftAlign().largeSize(true).bold(true);

  for (const item of order.items || []) {
    const itemNameUpper = item.name.toUpperCase();
    const itemLine = `  ${item.quantity} × ${itemNameUpper}`;
    builder.printLine(itemLine);
    plainLines.push(itemLine);

    // Customizations / Modifiers with arrow
    if (item.customizations && item.customizations.length > 0) {
      for (const custom of item.customizations) {
        const customName = (typeof custom === 'string' ? custom : custom.name).toUpperCase();
        const customLine = `      → ${customName}`;
        builder.printLine(customLine);
        plainLines.push(customLine);
      }
    }
  }

  // 9. Special Instructions (if present)
  if (specialInstructions && specialInstructions.trim()) {
    builder.normalSize().bold(false).printLine(doubleSeparator);
    plainLines.push(doubleSeparator);

    const specialText = `Special: ${specialInstructions.trim()}`;
    builder.leftAlign().bold(true).printLine(specialText);
    plainLines.push(specialText);

    builder.bold(false).printLine(doubleSeparator);
    plainLines.push(doubleSeparator);
  } else {
    builder.normalSize().bold(false).printLine(doubleSeparator);
    plainLines.push(doubleSeparator);
  }

  // 10. Order Time & Order ID
  const timeStr = o.time || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const orderTimeText = `ORDER TIME: ${timeStr}`;
  builder.centerAlign().normalSize().bold(false).printLine(orderTimeText);
  plainLines.push(' '.repeat(Math.max(0, Math.floor((width - orderTimeText.length) / 2))) + orderTimeText);

  const orderNumText = `Order #${orderNumber || orderId || '001'}`;
  builder.centerAlign().smallText(true).printLine(orderNumText);
  plainLines.push(' '.repeat(Math.max(0, Math.floor((width - orderNumText.length) / 2))) + orderNumText);

  // 11. Final Cut (FULL)
  builder.smallText(false).cut(false);

  return {
    buffer: builder.build(),
    plainText: plainLines.join('\n'),
  };
}
