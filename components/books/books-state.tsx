"use client";

import { Button, Empty } from "@/components/core";
import { ApiError, getApiErrorMessage } from "@/lib/api-client";

/** While a Books page loads: its finding and rows as grey bars, so nothing jumps when they arrive. */
export function BooksLoading() {
  return (
    <div aria-busy="true" aria-label="Loading" style={{ padding: "var(--space-24)", display: "flex", flexDirection: "column", gap: "var(--space-12)" }}>
      <div className="skeleton" style={{ height: 32, width: "60%" }} />
      <div className="skeleton" style={{ height: 20, width: "40%" }} />
      <div className="skeleton" style={{ height: 160, marginTop: "var(--space-24)" }} />
    </div>
  );
}

/** When it did not load: offline, or the server refused (a 403 says who can see it). */
export function BooksError({ what, onRetry, error, who }: { what: string; onRetry: () => void; error?: unknown; who?: string }) {
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  if (error instanceof ApiError && error.status === 403) {
    return (
      <Empty icon="lock" title={who ?? "Only the owner, a manager or the accountant see this"}>
        {getApiErrorMessage(error, "Ask the owner for access to Books.")}
      </Empty>
    );
  }
  return (
    <Empty
      icon="warn"
      title={offline ? "You are offline" : `${what} did not load`}
      action={
        <Button icon="history" onClick={onRetry}>
          Try again
        </Button>
      }
    >
      {offline ? "Books needs the connection. It loads again when you are back online." : "Check the connection and try again."}
    </Empty>
  );
}
