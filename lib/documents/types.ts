export type ExportTargetType = "LIST" | "RECORD" | "DASHBOARD";

export type DocumentMeta = {
  label: string;
  value: string;
};

export type ListPayload = {
  columns?: Array<{ key: string; label: string }>;
  rows: Array<Record<string, unknown>>;
};

export type RecordSection = {
  title: string;
  rows: Array<{ label: string; value: string }>;
};

export type RecordPayload = {
  sections: RecordSection[];
  lines?: Array<Record<string, unknown>>;
  lineColumns?: Array<{ key: string; label: string }>;
};

export type DashboardMetric = {
  label: string;
  value: string;
  detail?: string;
};

export type DashboardPayload = {
  metrics: DashboardMetric[];
  notes?: string[];
};

export type PartyBlock = {
  title: string;
  lines: string[];
};

export type TotalsRow = {
  label: string;
  value: string;
  emphasis?: boolean;
};

export type DocumentBadgeTone = "positive" | "warning" | "negative" | "neutral";

export type DocumentBadge = {
  label: string;
  tone: DocumentBadgeTone;
};

export type DocumentLink = {
  title: string;
  description?: string | null;
  url: string;
};

export type DocumentLinkBlock = {
  heading: string;
  items: DocumentLink[];
};

export type UniversalDocumentPayload = {
  title: string;
  subtitle?: string;
  fileName?: string;
  meta?: DocumentMeta[];
  /** From / Bill To blocks for financial documents. */
  parties?: PartyBlock[];
  /** Right-aligned totals ladder (Subtotal → Tax → Total → Paid → Balance). */
  totals?: TotalsRow[];
  /** Document status chip rendered next to the title (PAID, DRAFT, …). */
  badge?: DocumentBadge;
  /** Free-form notes / terms rendered after the line items. */
  notes?: string[];
  /**
   * Links the reader is asked to open — a brochure, a data sheet — printed
   * last, under their own heading, with each address written out in full
   * because paper cannot be clicked.
   */
  links?: DocumentLinkBlock;
  list?: ListPayload;
  record?: RecordPayload;
  dashboard?: DashboardPayload;
};

export type DocumentBankAccount = {
  currency: string;
  accountName?: string | null;
  accountNumber?: string | null;
};

export type CompanyBrandingSnapshot = {
  displayName: string;
  legalName?: string | null;
  tradingName?: string | null;
  registrationNumber?: string | null;
  taxNumber?: string | null;
  vatNumber?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  physicalAddress?: string | null;
  postalAddress?: string | null;
  bankName?: string | null;
  bankBranch?: string | null;
  bankBranchCode?: string | null;
  bankAddress?: string | null;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
  bankSwiftCode?: string | null;
  bankIban?: string | null;
  /**
   * Accounts the tenant asks to be paid into, in the order they should print.
   * Empty for a tenant that still describes its one account with the
   * `bankAccountName` / `bankAccountNumber` fields above.
   */
  bankAccounts?: DocumentBankAccount[];
  defaultFooterText?: string | null;
  legalDisclaimer?: string | null;
  paymentTerms?: string | null;
  logoUrl?: string | null;
  secondaryLogoUrl?: string | null;
  signatureUrl?: string | null;
  stampUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  /**
   * A stack naming real families — never a `var()`. A document is rendered
   * from a standalone HTML string with none of the app's CSS in scope, and an
   * unresolved custom property invalidates the whole declaration.
   */
  fontFamily?: string;
  /** The webfont to fetch so the rendering container actually has that face. */
  fontImportUrl?: string | null;
  /** The monospace face figures are set in, matching the app. */
  monoFontFamily?: string;
  documentLocale?: string | null;
  dateFormat?: string | null;
  timeFormat?: string | null;
  numberFormat?: string | null;
  currencyDisplayMode?: string | null;
};
