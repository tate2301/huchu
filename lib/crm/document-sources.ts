/** Where each CRM document's printable record is read from (`lib/documents/source-registry`). */
export const CRM_DOCUMENT_SOURCE_KEYS = {
  QUOTATION: "accounting.sales.quotation",
  INVOICE: "accounting.sales.invoice",
  RECEIPT: "accounting.sales.receipt",
} as const;
