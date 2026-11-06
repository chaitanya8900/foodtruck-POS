// Enums matching backend specifications
export enum UserRole {
  ADMIN = 'ADMIN',
  CASHIER = 'CASHIER',
  KITCHEN_STAFF = 'KITCHEN_STAFF',
}

export enum OrderSource {
  POS = 'POS',
  QR = 'QR',
}

export enum OrderType {
  DINE_IN = 'DINE_IN',
  TAKEAWAY = 'TAKEAWAY',
}

export enum OrderStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  CONFIRMED = 'CONFIRMED',
  PREPARING = 'PREPARING',
  READY = 'READY',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  FAILED = 'FAILED',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
  REFUNDED = 'REFUNDED',
}

export enum PaymentMethod {
  CASH = 'CASH',
  UPI = 'UPI',
  PHONEPE = 'PHONEPE',
}

export enum PrintJobStatus {
  PENDING = 'PENDING',
  PRINTING = 'PRINTING',
  PRINTED = 'PRINTED',
  FAILED = 'FAILED',
}

export enum DocumentType {
  CUSTOMER_RECEIPT = 'CUSTOMER_RECEIPT',
  KOT = 'KOT',
}

export enum SelectionType {
  SINGLE = 'SINGLE',
  MULTIPLE = 'MULTIPLE',
}

export interface MobileOrderingSchedule {
  enabled: boolean;
  manualClosed: boolean;
  manualClosedDate?: string;
  manualClosedMessage?: string;
  days: string[]; // ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
  openTime: string; // e.g. '17:00'
  closeTime: string; // e.g. '22:00'
}

export interface OrderingStatus {
  isOpen: boolean;
  reason: 'OPEN' | 'MANUAL_CLOSED' | 'DAY_CLOSED' | 'BEFORE_HOURS' | 'AFTER_HOURS' | 'DISABLED';
  message: string;
  closedButtonText: string;
  bannerText: string;
  formattedOpenTime: string;
  formattedCloseTime: string;
  schedule: MobileOrderingSchedule;
}

// Core Entity Interfaces
export interface Business {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  fssaiNumber?: string;
  receiptHeader?: string;
  receiptFooter?: string;
  taxRate: number; // e.g. 5 for 5%
  operatingHours?: MobileOrderingSchedule | string | any;
  orderingStatus?: OrderingStatus;
  dineInEnabled: boolean;
  takeawayEnabled: boolean;
  tokenPrefix?: string;
  tokenResetTime?: string; // e.g. '04:00'
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  businessId: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ModifierOption {
  id: string;
  modifierGroupId: string;
  name: string;
  price: number;
  isAvailable: boolean;
  displayOrder: number;
}

export interface ModifierGroup {
  id: string;
  businessId: string;
  menuItemId?: string | null;
  name: string;
  selectionType: SelectionType;
  minSelections: number;
  maxSelections: number;
  isRequired: boolean;
  options: ModifierOption[];
}

export interface MenuItem {
  id: string;
  businessId: string;
  categoryId: string;
  name: string;
  description?: string;
  price: number;
  imageUrl?: string;
  isAvailable: boolean;
  preparationTimeMinutes?: number;
  taxRate?: number;
  displayOrder: number;
  modifierGroups?: ModifierGroup[];
  category?: MenuCategory;
  createdAt: string;
  updatedAt: string;
}

export interface MenuCategory {
  id: string;
  businessId: string;
  name: string;
  description?: string;
  imageUrl?: string;
  isActive: boolean;
  displayOrder: number;
  items?: MenuItem[];
  createdAt: string;
  updatedAt: string;
}

export interface Table {
  id: string;
  businessId: string;
  tableNumber: string;
  tableName: string;
  qrToken: string;
  qrCodeUrl?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItemCustomization {
  modifierGroupId: string;
  modifierGroupName: string;
  optionId: string;
  optionName: string;
  price: number;
}

export interface OrderItem {
  id: string;
  orderId: string;
  menuItemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  customizations?: OrderItemCustomization[];
  customizationCharges: number;
  totalPrice: number;
  specialInstructions?: string;
}

export interface Payment {
  id: string;
  orderId: string;
  businessId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  transactionReference?: string;
  gatewayTransactionId?: string;
  paymentDetails?: Record<string, unknown>;
  verifiedByUserId?: string;
  verifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PrintJob {
  id: string;
  orderId: string;
  businessId: string;
  documentType: DocumentType;
  jobStatus: PrintJobStatus;
  attemptCount: number;
  printerName?: string;
  failureReason?: string;
  printedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  id: string;
  businessId: string;
  orderNumber: string;
  tokenNumber?: string | null;
  source: OrderSource;
  orderType: OrderType;
  tableId?: string | null;
  table?: Table | null;
  qrTokenId?: string | null;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod?: PaymentMethod | null;
  subtotal: number;
  discount: number;
  tax: number;
  grandTotal: number;
  specialInstructions?: string;
  cashierId?: string | null;
  cashier?: User | null;
  items: OrderItem[];
  payments?: Payment[];
  printJobs?: PrintJob[];
  createdAt: string;
  confirmedAt?: string | null;
  completedAt?: string | null;
  updatedAt: string;
}

export interface TokenSequence {
  id: string;
  businessId: string;
  dateKey: string;
  lastToken: number;
  prefix?: string;
}

// Request and Response Types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  token: string;
  business: Business;
}

export interface CartItemModifier {
  modifierGroupId: string;
  modifierGroupName: string;
  optionId: string;
  optionName: string;
  price: number;
}

export interface CartItem {
  cartItemId: string; // unique internal key in cart
  menuItem: MenuItem;
  quantity: number;
  customizations: CartItemModifier[];
  unitPrice: number;
  customizationTotal: number;
  lineTotal: number;
  specialInstructions?: string;
}

export interface CreateOrderRequest {
  source: OrderSource;
  orderType: OrderType;
  tableId?: string | null;
  qrToken?: string | null;
  paymentMethod: PaymentMethod;
  specialInstructions?: string;
  cashReceived?: number;
  transactionReference?: string;
  items: {
    menuItemId: string;
    quantity: number;
    customizations?: CartItemModifier[];
    specialInstructions?: string;
  }[];
}

export interface CreateQROrderRequest {
  qrToken: string;
  orderType: OrderType;
  paymentOption: 'online_upi' | 'pay_at_counter';
  specialInstructions?: string;
  items: {
    menuItemId: string;
    quantity: number;
    customizations?: CartItemModifier[];
    specialInstructions?: string;
  }[];
}

export interface DailySalesReport {
  date: string;
  totalOrders: number;
  confirmedOrders: number;
  cancelledOrders: number;
  grossSales: number;
  totalDiscount: number;
  totalTax: number;
  netSales: number;
  cashCollections: number;
  upiCollections: number;
  counterOrdersCount: number;
  qrOrdersCount: number;
  dineInOrdersCount: number;
  takeawayOrdersCount: number;
}

export interface PaymentSummaryReport {
  cashTotal: number;
  cashCount: number;
  upiTotal: number;
  upiCount: number;
  pendingTotal: number;
  pendingCount: number;
  refundedTotal: number;
}

export interface TopItemReport {
  menuItemId: string;
  name: string;
  categoryName: string;
  quantitySold: number;
  revenue: number;
}
