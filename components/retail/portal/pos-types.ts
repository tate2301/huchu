"use client";

export type TenderType =
  | "CASH"
  | "CARD"
  | "MOBILE_MONEY"
  | "TRANSFER"
  | "VOUCHER";

export type PaymentRow = {
  tenderType: TenderType;
  amount: string;
  reference: string;
};

export type CartItem = {
  id: string;
  name: string;
  catalogItemId: string;
  quantity: number;
  unitPrice: number;
  taxPercent: number;
  compareAtPrice?: number | null;
  lineDiscountAmount?: number;
};

export type CurrentShift = {
  id: string;
  shiftNo: string;
  siteId: string;
  registerName: string;
  openingFloat: number;
  expectedCash: number;
  actorRole: string;
  netSalesValue: number;
  refundValue: number;
  saleCount: number;
  refundCount: number;
  voidCount: number;
  cashSales: number;
  nonCashSales: number;
  site: { id: string; name: string; code: string } | null;
};

export type PosCatalogItem = {
  id: string;
  name: string;
  unitPrice: number;
  compareAtPrice: number | null;
  taxPercent: number;
  sku: string;
  barcode: string | null;
  inventoryItem: { currentStock: number; unit: string } | null;
};

export type Promotion = {
  id: string;
  name: string;
  promoCode: string;
  type: "PERCENT" | "AMOUNT" | "BUY_X_GET_Y" | "BUNDLE";
  value: number;
};

export type HeldCart = {
  id: string;
  holdNo: string;
  label: string | null;
  createdAt: string;
  shiftId: string;
  cashierId: string | null;
  cartSnapshot: {
    items?: CartItem[];
    customerName?: string;
    orderDiscountAmount?: string;
    selectedPromotionId?: string;
  };
};

export type SaleRow = {
  id: string;
  saleNo: string;
  saleType: string;
  status: string;
  postedAt: string;
  customerName: string | null;
  cashierName: string | null;
  totalAmount: number;
  itemCount: number;
  tenderTypes: string[];
  overrideReason: string | null;
  promotionCode: string | null;
  sourceSaleNo: string | null;
};

export type SaleDetail = SaleRow & {
  notes: string | null;
  payments: Array<{
    id: string;
    tenderType: string;
    amount: number;
    reference: string | null;
  }>;
  lines: Array<{
    id: string;
    itemName: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  reversals: Array<{
    id: string;
    saleNo: string;
    saleType: string;
    totalAmount: number;
  }>;
};

export type PosPortalView =
  | "checkout"
  | "history"
  | "held"
  | "shift";
