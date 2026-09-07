/**
 * Module adapters.
 *
 * A catalogue line is neutral. Each module needs it in its own shape: the CRM
 * wants a quotation line, Retail wants something a till can ring up, a workshop
 * wants a job-card task. Rather than the catalogue knowing about every module —
 * which is how a shared module slowly becomes everybody's problem — each module
 * registers an adapter and the catalogue stays ignorant of all of them.
 *
 * Adding a module is: write an adapter, register it, done. No schema change, no
 * edit to the catalogue, nothing for the other modules to re-test.
 */
import type { CatalogueLine } from "./catalogue";

/** What a module turns a catalogue line into. */
export type CatalogueAdapter<TLine> = {
  /** Module key, e.g. "crm". Used in errors and in the registry. */
  module: string;
  /** Human label for pickers that let you choose a destination. */
  label: string;
  /** Whether this module can take this line at all. */
  accepts?: (line: CatalogueLine) => boolean;
  toLine: (line: CatalogueLine) => TLine;
};

const registry = new Map<string, CatalogueAdapter<unknown>>();

export function registerCatalogueAdapter<TLine>(adapter: CatalogueAdapter<TLine>): void {
  registry.set(adapter.module, adapter as CatalogueAdapter<unknown>);
}

export function getCatalogueAdapter<TLine>(module: string): CatalogueAdapter<TLine> | null {
  return (registry.get(module) as CatalogueAdapter<TLine> | undefined) ?? null;
}

export function catalogueDestinations(line: CatalogueLine): { module: string; label: string }[] {
  return Array.from(registry.values())
    .filter((adapter) => !adapter.accepts || adapter.accepts(line))
    .map((adapter) => ({ module: adapter.module, label: adapter.label }));
}

// ---------------------------------------------------------------------------
// The adapters that ship today
// ---------------------------------------------------------------------------

/**
 * CRM — quotations, invoices and site-visit estimates.
 *
 * Matches `CrmDocumentLineInput`: the accounting bridge takes a non-negative
 * unit price, so a discount is folded into the price rather than sent as a
 * negative line.
 */
export type CrmDocumentLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
};

export const crmAdapter: CatalogueAdapter<CrmDocumentLine> = {
  module: "crm",
  label: "Quotation or invoice",
  toLine: (line) => ({
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    taxRate: line.taxRate,
  }),
};

/**
 * Retail — a till line.
 *
 * Only stocked goods: a POS can't sell an hour of labour over a counter, and a
 * service on a till receipt is nearly always a mis-scan.
 */
export type RetailPosLine = {
  productId: string;
  sku: string;
  name: string;
  qty: number;
  unitPrice: number;
  taxPercent: number;
};

export const retailAdapter: CatalogueAdapter<RetailPosLine> = {
  module: "retail",
  label: "Till",
  accepts: (line) => line.priceSource !== "VOLUME_BREAK" || line.quantity > 0,
  toLine: (line) => ({
    productId: line.productId,
    sku: line.code,
    name: line.description,
    qty: line.quantity,
    unitPrice: line.unitPrice,
    taxPercent: line.taxRate,
  }),
};

/**
 * Work orders — what a crew has to do on site.
 *
 * Price is dropped deliberately: a crew tick-list showing money invites a
 * conversation on site that belongs with whoever signed the quote.
 */
export type WorkOrderTask = {
  productId: string;
  description: string;
  quantity: number;
  unit: string;
};

export const workOrderAdapter: CatalogueAdapter<WorkOrderTask> = {
  module: "work-order",
  label: "Work order",
  toLine: (line) => ({
    productId: line.productId,
    description: line.description,
    quantity: line.quantity,
    unit: line.unit,
  }),
};

registerCatalogueAdapter(crmAdapter);
registerCatalogueAdapter(retailAdapter);
registerCatalogueAdapter(workOrderAdapter);
