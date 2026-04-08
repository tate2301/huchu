export type ScrapTicketType = "purchase" | "sale";

type ExportTicketPdfInput = {
  ticketType: ScrapTicketType;
  ticketId: string;
  download?: boolean;
};

export function getTicketPdfUrl(input: ExportTicketPdfInput): string {
  const route = input.ticketType === "purchase" ? "purchases" : "sales";
  const query = input.download ? "1" : "0";
  return `/api/scrap-metal/${route}/${input.ticketId}/pdf?download=${query}`;
}

export function exportTicketPdf(input: ExportTicketPdfInput): void {
  if (typeof window === "undefined") return;
  const url = getTicketPdfUrl(input);
  window.open(url, "_blank", "noopener,noreferrer");
}

export type PrintBridgeMode = "pdf-only" | "local-bridge";

type BridgePrintInput = ExportTicketPdfInput & {
  mode?: PrintBridgeMode;
};

// Adapter point for future QZ/ESC-POS integration. For now we intentionally keep it PDF-first.
export function printTicketWithBridge(input: BridgePrintInput): void {
  const mode = input.mode ?? "pdf-only";
  if (mode === "local-bridge") {
    // Local bridge is not enabled yet. Fallback to PDF export.
    exportTicketPdf(input);
    return;
  }
  exportTicketPdf(input);
}
