/**
 * Test factories for Gold module Prisma models.
 *
 * All factories return plain objects suitable for:
 *   prisma.X.create({ data: factories.X(...) })
 *
 * No Prisma calls are made here — tests own the DB interactions.
 *
 * ASSUMPTION (Epic 1 / ledger-migration confirmed): GoldInventorySourceType
 * gains REVERSAL, DISPATCH, PURCHASE members. The sourceType field is typed
 * as string to compile against both old and new enum shapes.
 */

function uid(): string {
  return crypto.randomUUID();
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

export type Overrides<T> = Partial<T>;

// ---------------------------------------------------------------------------
// Company
// ---------------------------------------------------------------------------

export interface CompanyData {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

function company(overrides?: Overrides<CompanyData>): CompanyData {
  const id = uid();
  return { id, name: "Test Company", slug: `test-co-${id.slice(0, 8)}`, createdAt: new Date(), updatedAt: new Date(), ...overrides };
}

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export interface UserData {
  id: string;
  companyId: string;
  email: string;
  name: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

function user(companyId: string, role = "CLERK", overrides?: Overrides<UserData>): UserData {
  const id = uid();
  return { id, companyId, email: `user-${id.slice(0, 8)}@test.local`, name: "Test User", role, createdAt: new Date(), updatedAt: new Date(), ...overrides };
}

// ---------------------------------------------------------------------------
// Site
// ---------------------------------------------------------------------------

export interface SiteData {
  id: string;
  companyId: string;
  name: string;
  code: string;
  createdAt: Date;
  updatedAt: Date;
}

function site(companyId: string, overrides?: Overrides<SiteData>): SiteData {
  const id = uid();
  return { id, companyId, name: "Test Site", code: `SITE-${id.slice(0, 6).toUpperCase()}`, createdAt: new Date(), updatedAt: new Date(), ...overrides };
}

// ---------------------------------------------------------------------------
// Employee
// ---------------------------------------------------------------------------

export interface EmployeeData {
  id: string;
  companyId: string;
  siteId: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function employee(companyId: string, siteId: string, overrides?: Overrides<EmployeeData>): EmployeeData {
  const id = uid();
  return { id, companyId, siteId, firstName: "Test", lastName: `Worker-${id.slice(0, 6)}`, isActive: true, createdAt: new Date(), updatedAt: new Date(), ...overrides };
}

// ---------------------------------------------------------------------------
// ShiftGroup
// ---------------------------------------------------------------------------

export interface ShiftGroupData {
  id: string;
  companyId: string;
  siteId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

function shiftGroup(companyId: string, siteId: string, overrides?: Overrides<ShiftGroupData>): ShiftGroupData {
  return { id: uid(), companyId, siteId, name: "Day Crew", createdAt: new Date(), updatedAt: new Date(), ...overrides };
}

// ---------------------------------------------------------------------------
// GoldPrice
// ---------------------------------------------------------------------------

export interface GoldPriceData {
  id: string;
  companyId: string;
  effectiveDate: Date;
  priceUsdPerGram: number;
  note: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

function goldPrice(companyId: string, asOf: Date, usdPerGram = 80, overrides?: Overrides<GoldPriceData>): GoldPriceData {
  return { id: uid(), companyId, effectiveDate: asOf, priceUsdPerGram: usdPerGram, note: null, createdById: uid(), createdAt: new Date(), updatedAt: new Date(), ...overrides };
}

// ---------------------------------------------------------------------------
// GoldPour
// ---------------------------------------------------------------------------

export interface GoldPourData {
  id: string;
  pourBarId: string;
  pourDate: Date;
  siteId: string;
  sourceType: string;
  createdById: string | null;
  grossWeight: number;
  estimatedPurity: number | null;
  witness1Id: string;
  witness2Id: string;
  storageLocation: string;
  additionalExpensesWeight: number | null;
  additionalExpensesNote: string | null;
  notes: string | null;
  goldPriceUsdPerGram: number | null;
  valuationDate: Date | null;
  valueUsd: number | null;
  goldShiftAllocationId: string | null;
  corrections: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function goldPour(siteId: string, overrides?: Overrides<GoldPourData>): GoldPourData {
  const id = uid();
  return {
    id, pourBarId: `BAR-${id.slice(0, 10)}`, pourDate: daysAgo(1), siteId,
    sourceType: "PRODUCTION", createdById: null, grossWeight: 10.0,
    estimatedPurity: 92.5, witness1Id: uid(), witness2Id: uid(),
    storageLocation: "Vault A", additionalExpensesWeight: null,
    additionalExpensesNote: null, notes: null, goldPriceUsdPerGram: 80,
    valuationDate: daysAgo(1), valueUsd: 800, goldShiftAllocationId: null,
    corrections: null, createdAt: new Date(), updatedAt: new Date(), ...overrides,
  };
}

// ---------------------------------------------------------------------------
// GoldDispatch
// ---------------------------------------------------------------------------

export interface GoldDispatchData {
  id: string;
  goldPourId: string;
  dispatchDate: Date;
  courier: string;
  vehicle: string | null;
  destination: string;
  sealNumbers: string;
  handedOverById: string;
  receivedBy: string | null;
  notes: string | null;
  goldPriceUsdPerGram: number | null;
  valuationDate: Date | null;
  valueUsd: number | null;
  createdAt: Date;
  updatedAt: Date;
}

function goldDispatch(primaryPourId: string, overrides?: Overrides<GoldDispatchData>): GoldDispatchData {
  return {
    id: uid(), goldPourId: primaryPourId, dispatchDate: new Date(),
    courier: "Test Courier", vehicle: null, destination: "Buyer HQ",
    sealNumbers: "SEAL-001", handedOverById: uid(), receivedBy: null,
    notes: null, goldPriceUsdPerGram: 80, valuationDate: new Date(),
    valueUsd: 800, createdAt: new Date(), updatedAt: new Date(), ...overrides,
  };
}

// ---------------------------------------------------------------------------
// BuyerReceipt
// ---------------------------------------------------------------------------

export interface BuyerReceiptData {
  id: string;
  goldPourId: string | null;
  goldDispatchId: string | null;
  receiptNumber: string;
  receiptDate: Date;
  assayResult: number | null;
  paidAmount: number;
  paymentMethod: string;
  paymentChannel: string | null;
  paymentReference: string | null;
  notes: string | null;
  goldPriceUsdPerGram: number | null;
  valuationDate: Date | null;
  paidValueUsd: number | null;
  createdAt: Date;
  updatedAt: Date;
}

function buyerReceipt(pourId: string, overrides?: Overrides<BuyerReceiptData>): BuyerReceiptData {
  const id = uid();
  return {
    id, goldPourId: pourId, goldDispatchId: null, receiptNumber: `RCP-${id.slice(0, 8)}`,
    receiptDate: new Date(), assayResult: 92.5, paidAmount: 800,
    paymentMethod: "BANK_TRANSFER", paymentChannel: null, paymentReference: null,
    notes: null, goldPriceUsdPerGram: 80, valuationDate: new Date(),
    paidValueUsd: 800, createdAt: new Date(), updatedAt: new Date(), ...overrides,
  };
}

// ---------------------------------------------------------------------------
// GoldShiftAllocation
// ---------------------------------------------------------------------------

export interface GoldShiftAllocationData {
  id: string;
  date: Date;
  shift: string;
  siteId: string;
  shiftReportId: string;
  totalWeight: number;
  netWeight: number;
  splitMode: string;
  workerShareOverrideWeight: number | null;
  splitOverrideReason: string | null;
  workerShareWeight: number;
  companyShareWeight: number;
  perWorkerWeight: number;
  goldPriceUsdPerGram: number | null;
  valuationDate: Date | null;
  totalWeightValueUsd: number | null;
  netWeightValueUsd: number | null;
  workerShareValueUsd: number | null;
  companyShareValueUsd: number | null;
  perWorkerValueUsd: number | null;
  payCycleWeeks: number;
  workflowStatus: string;
  createdById: string;
  submittedById: string | null;
  approvedById: string | null;
  submittedAt: Date | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function goldShiftAllocation(siteId: string, shiftReportId: string, overrides?: Overrides<GoldShiftAllocationData>): GoldShiftAllocationData {
  return {
    id: uid(), date: daysAgo(1), shift: "DAY", siteId, shiftReportId,
    totalWeight: 100.0, netWeight: 95.0, splitMode: "DEFAULT_50_50",
    workerShareOverrideWeight: null, splitOverrideReason: null,
    workerShareWeight: 47.5, companyShareWeight: 47.5, perWorkerWeight: 9.5,
    goldPriceUsdPerGram: 80, valuationDate: daysAgo(1),
    totalWeightValueUsd: 8000, netWeightValueUsd: 7600,
    workerShareValueUsd: 3800, companyShareValueUsd: 3800, perWorkerValueUsd: 760,
    payCycleWeeks: 2, workflowStatus: "DRAFT", createdById: uid(),
    submittedById: null, approvedById: null, submittedAt: null, approvedAt: null,
    createdAt: new Date(), updatedAt: new Date(), ...overrides,
  };
}

// ---------------------------------------------------------------------------
// GoldInventoryEvent
// sourceType typed as string to compile against current + Epic-1 extended enum.
// ---------------------------------------------------------------------------

export interface GoldInventoryEventData {
  id: string;
  companyId: string;
  siteId: string;
  eventDate: Date;
  direction: "IN" | "OUT";
  grams: number;
  goldPriceUsdPerGram: number | null;
  valueUsd: number | null;
  sourceType: string;
  sourceId: string | null;
  notes: string | null;
  createdById: string | null;
  createdAt: Date;
}

function goldInventoryEvent(companyId: string, siteId: string, direction: "IN" | "OUT", grams: number, overrides?: Overrides<GoldInventoryEventData>): GoldInventoryEventData {
  return {
    id: uid(), companyId, siteId, eventDate: new Date(), direction, grams,
    goldPriceUsdPerGram: 80, valueUsd: +(grams * 80).toFixed(2),
    sourceType: "POUR", sourceId: null, notes: null, createdById: null,
    createdAt: new Date(), ...overrides,
  };
}

// ---------------------------------------------------------------------------
// GoldLedgerImport
// ---------------------------------------------------------------------------

export interface GoldLedgerImportData {
  id: string;
  companyId: string;
  siteId: string | null;
  uploadedById: string;
  fileName: string;
  rowsTotal: number;
  rowsCreated: number;
  rowsSkipped: number;
  rowsAnomaly: number;
  rowsFailed: number;
  status: string;
  mappingsJson: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  committedAt: Date | null;
}

function goldLedgerImport(companyId: string, overrides?: Overrides<GoldLedgerImportData>): GoldLedgerImportData {
  return {
    id: uid(), companyId, siteId: null, uploadedById: uid(),
    fileName: "test-ledger.csv", rowsTotal: 0, rowsCreated: 0,
    rowsSkipped: 0, rowsAnomaly: 0, rowsFailed: 0, status: "MAPPING",
    mappingsJson: null, notes: null, createdAt: new Date(), updatedAt: new Date(),
    committedAt: null, ...overrides,
  };
}

// ---------------------------------------------------------------------------
// GoldLedgerEntry
// ---------------------------------------------------------------------------

export interface GoldLedgerEntryData {
  id: string;
  importId: string;
  lineNo: number;
  rawJson: string;
  parsedDate: Date | null;
  parsedName: string | null;
  mappedShiftGroupId: string | null;
  gramsTotal: number | null;
  expensesJson: string | null;
  boysGrams: number | null;
  mdaraGrams: number | null;
  balGrams: number | null;
  status: string;
  goldShiftAllocationId: string | null;
  goldPourId: string | null;
  buyerReceiptId: string | null;
  errorMessage: string | null;
  parserWarning: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function goldLedgerEntry(importId: string, lineNo = 1, overrides?: Overrides<GoldLedgerEntryData>): GoldLedgerEntryData {
  return {
    id: uid(), importId, lineNo,
    rawJson: JSON.stringify({ date: "2026-01-01", name: "Test Leader", grams: 10 }),
    parsedDate: daysAgo(30), parsedName: "Test Leader", mappedShiftGroupId: null,
    gramsTotal: 10.0, expensesJson: null, boysGrams: 5.0, mdaraGrams: 5.0,
    balGrams: null, status: "PENDING", goldShiftAllocationId: null,
    goldPourId: null, buyerReceiptId: null, errorMessage: null,
    parserWarning: null, createdAt: new Date(), updatedAt: new Date(), ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const factories = {
  company, user, site, employee, shiftGroup,
  goldPrice, goldPour, goldDispatch, buyerReceipt,
  goldShiftAllocation, goldInventoryEvent,
  goldLedgerImport, goldLedgerEntry,
};
