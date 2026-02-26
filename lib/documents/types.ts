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

export type UniversalDocumentPayload = {
  title: string;
  subtitle?: string;
  fileName?: string;
  meta?: DocumentMeta[];
  list?: ListPayload;
  record?: RecordPayload;
  dashboard?: DashboardPayload;
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
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
  bankSwiftCode?: string | null;
  bankIban?: string | null;
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
  fontFamily?: string;
  documentLocale?: string | null;
  dateFormat?: string | null;
  timeFormat?: string | null;
  numberFormat?: string | null;
  currencyDisplayMode?: string | null;
};
