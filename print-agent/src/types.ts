/**
 * TypeScript Type Definitions for FoodTruck Thermal Print Agent
 */

export type PrinterType = 'network' | 'usb' | 'console';

export type PrinterStatus = 'connected' | 'disconnected' | 'printing' | 'error';

export type DocumentType = 'CUSTOMER_RECEIPT' | 'KOT';

export type PrintJobStatus = 'PENDING' | 'PRINTING' | 'PRINTED' | 'FAILED';

export type OrderType = 'DINE-IN' | 'TAKEAWAY';

export interface OrderItemCustomization {
  name: string;
  price?: number;
}

export interface OrderItem {
  name: string;
  quantity: number;
  price?: number;
  customizations?: (OrderItemCustomization | string)[];
}

export interface OrderData {
  orderId: string;
  orderNumber: string; // e.g. "QR025" or "025"
  tokenNo: string;     // e.g. "025"
  orderType: OrderType | string;
  tableNo?: string;    // e.g. "03" (omitted or empty for takeaway)
  date: string;        // e.g. "02-Nov-2026"
  time: string;        // e.g. "01:30 PM"
  businessName: string;
  items: OrderItem[];
  subtotal?: number;
  taxRate?: number;    // e.g. 5 (%)
  taxAmount?: number;  // e.g. 25
  total?: number;
  paymentMethod?: string; // e.g. "UPI", "CASH", "CARD"
  paymentRef?: string;    // e.g. "TXN123456"
  specialInstructions?: string; // Kitchen notes, e.g. "No onions please"
  isReprint?: boolean;
  customerName?: string;
  customerPhone?: string;
}

export interface PrintJob {
  id: string;
  orderId: string;
  documentType: DocumentType;
  status: PrintJobStatus;
  attempts: number;
  maxAttempts: number;
  failureReason?: string;
  data: OrderData;
  createdAt: string;
  printedAt?: string;
}

export interface PrinterStatusPayload {
  businessId: string;
  agentToken: string;
  status: PrinterStatus;
  printerType: PrinterType;
  ip?: string;
  port?: number;
  timestamp: string;
  queueLength: number;
  error?: string;
}

export interface PrintJobStatusUpdatePayload {
  jobId: string;
  orderId: string;
  documentType: DocumentType;
  status: PrintJobStatus;
  attemptCount: number;
  failureReason?: string;
  printedAt?: string;
  timestamp: string;
}

export interface HeartbeatPayload {
  businessId: string;
  agentToken: string;
  timestamp: string;
  printerStatus: PrinterStatus;
  queueLength: number;
  uptime: number;
}

export interface RequestPendingJobsPayload {
  businessId: string;
  agentToken: string;
}

export interface TestPrintPayload {
  type?: DocumentType;
  sampleData?: Partial<OrderData>;
}

export interface IPrinter {
  readonly type: PrinterType;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): PrinterStatus;
  print(buffer: Buffer, plainTextPreview?: string): Promise<boolean>;
  testPrint(): Promise<boolean>;
}

export interface GeneratedPrintOutput {
  buffer: Buffer;
  plainText: string;
}
