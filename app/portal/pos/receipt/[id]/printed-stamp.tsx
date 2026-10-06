"use client";

import * as React from "react";

/**
 * Stamps the sale printed once its receipt has gone to the printer
 * (`pos/sales/{id}/printed`, which sets `printedAt` once). The till prints this
 * page from a hidden frame; `afterprint` fires in the frame when the dialog
 * closes. Nothing is shown, and a failed stamp never stops the till.
 */
export function PrintedStamp({ saleId }: { saleId: string }) {
  React.useEffect(() => {
    let sent = false;
    const stamp = () => {
      if (sent) return;
      sent = true;
      void fetch(`/api/v2/retail/pos/sales/${encodeURIComponent(saleId)}/printed`, {
        method: "POST",
        credentials: "same-origin",
        keepalive: true,
      }).catch(() => undefined);
    };
    window.addEventListener("afterprint", stamp);
    return () => window.removeEventListener("afterprint", stamp);
  }, [saleId]);
  return null;
}
