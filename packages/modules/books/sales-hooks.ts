/**
 * What the books announce when a sales document is raised, for the modules
 * downstream of the money. The CRM listens (a quote it produced was invoiced
 * in the books; a payment against an invoice it owns closes the record) —
 * registered by the host that composes both (`onSalesInvoiceCreated`,
 * `onSalesReceiptCreated` from its `modules.ts`). The books name no listener.
 *
 * A listener never fails the request that raised the document: the invoice is
 * already real either way, so a failure is logged and the rest still run.
 */
import { registry } from "@corelithzw/platform/registry";

export type SalesInvoiceCreatedEvent = { companyId: string; invoiceId: string; userId: string };
export type SalesReceiptCreatedEvent = { companyId: string; receiptId: string; invoiceId: string | null; userId: string };

const invoiceListeners = registry<Set<(event: SalesInvoiceCreatedEvent) => Promise<void>>>("books.sales-invoice-created", () => new Set());
const receiptListeners = registry<Set<(event: SalesReceiptCreatedEvent) => Promise<void>>>("books.sales-receipt-created", () => new Set());

export function onSalesInvoiceCreated(listener: (event: SalesInvoiceCreatedEvent) => Promise<void>): void {
  invoiceListeners.add(listener);
}

export function onSalesReceiptCreated(listener: (event: SalesReceiptCreatedEvent) => Promise<void>): void {
  receiptListeners.add(listener);
}

async function tell<T>(listeners: Set<(event: T) => Promise<void>>, event: T, what: string) {
  for (const listener of listeners) {
    try {
      await listener(event);
    } catch (error) {
      console.error(`[Books] A listener for ${what} failed:`, error);
    }
  }
}

export function emitSalesInvoiceCreated(event: SalesInvoiceCreatedEvent): Promise<void> {
  return tell(invoiceListeners, event, "a sales invoice");
}

export function emitSalesReceiptCreated(event: SalesReceiptCreatedEvent): Promise<void> {
  return tell(receiptListeners, event, "a receipt");
}
