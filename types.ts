export enum UserRole {
  ADMIN = 'ADMIN',
  SALES = 'SALES',
  CASHIER = 'CASHIER',
  OPERATIONS = 'OPERATIONS'
}

export enum VoucherStatus {
  PENDING_PAYMENT = 'Pending Payment',
  ACTIVE = 'Active',
  REDEEMED = 'Redeemed',
  EXPIRED = 'Expired'
}

export interface User {
  username: string;
  password?: string;
  pin?: string;
  roles: UserRole[];
  fullName: string;
}

export interface VoucherTemplate {
  id: string;
  name: string;
  category: string;
  value: number;
  isActive: boolean;
  defaultExpiryDate?: string;
  terms: string;
  image?: string;
}

export interface Voucher {
  id: string;
  voucherCode: string;
  clientName: string;
  phoneNumber: string;
  email: string;
  voucherDetails: {
    value: number;
    name: string;
    category: string;
    terms: string;
    image?: string;
  };
  eventSource: string;
  status: VoucherStatus;
  workflow: {
    salesPersonName: string;
    cashierName?: string;
    redemptionPicName?: string;
  };
  dates: {
    soldAt: string;
    expiryDate: string;
    redemptionDate?: string;
    bookingDate?: string;
    paidAt?: string;
  };
  financials: {
    invoiceNo?: string;
    paymentMethod?: 'QR' | 'Cash' | 'Terminal' | 'Online';
    receiptNo?: string;
    cashReceived?: number;
    changeAmount?: number;
  };
  redemption: {
    branchName?: string;
  };
  // Chip-in integration fields
  chipinPurchaseId?: string;
  saleChannel?: 'POS' | 'Online';
}

export interface Stats {
  totalRevenue: number;
  vouchersSoldToday: number;
  vouchersSoldTotal: number;
  redemptionRate: number;
}

export interface SystemSettings {
  receipt: {
    businessName: string;
    businessRegNo: string;
    email: string;
    addressLine1: string;
    addressLine2: string;
    phone: string;
    headerMessage: string;
    footerMessage: string;
    showLogo: boolean;
  };
  email: {
    enabled: boolean;
    provider: 'EmailJS' | 'Simulation' | 'CustomPHP';
    serviceId: string;
    templateId: string;
    publicKey: string;
    phpScriptUrl: string;
  };
  chipin: {
    enabled: boolean;
  };
}

export interface PromoCode {
  id: string;
  code: string;
  label: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  isActive: boolean;
  minCartValue?: number;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  adminUsername: string;
  adminFullName: string;
  action: string;
  details: string;
  recordId?: string;
}