import type { ModuleManifest } from "@corelithzw/platform/manifest";
import { recordTemplate } from "@corelithzw/module-documents/default-template-catalog";

/**
 * Books: the ledger, invoices, quotations, receipts, credit notes, banking,
 * fiscalisation and the financial statements.
 *
 * Ahead of the module's move: what it contributes to the kernel is declared
 * here now, so the host composes by manifests today and the move relocates
 * this file. Data only.
 */
export const manifest: ModuleManifest = {
  id: "books",
  documents: {
    templates: [
      {
        key: "accounting.sales.invoice",
        sourceKey: "accounting.sales.invoice",
        documentType: "SALES_INVOICE",
        targetType: "RECORD",
        name: "Sales Invoice Default",
        description: "Default branded sales invoice layout.",
        schema: recordTemplate("Invoice"),
      },
      {
        key: "accounting.sales.quotation",
        sourceKey: "accounting.sales.quotation",
        documentType: "SALES_QUOTATION",
        targetType: "RECORD",
        name: "Sales Quotation Default",
        description: "Default branded sales quotation layout.",
        schema: recordTemplate("Quotation"),
      },
      {
        key: "accounting.sales.receipt",
        sourceKey: "accounting.sales.receipt",
        documentType: "SALES_RECEIPT",
        targetType: "RECORD",
        name: "Sales Receipt Default",
        description: "Default branded sales receipt layout.",
        schema: recordTemplate("Payment Receipt"),
      },
      {
        key: "accounting.sales.credit-note",
        sourceKey: "accounting.sales.credit-note",
        documentType: "GENERIC_RECORD",
        targetType: "RECORD",
        name: "Credit Note Default",
        description: "Default branded credit note layout.",
        schema: recordTemplate("Credit Note"),
      },
    ],
  },
};
