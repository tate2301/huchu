"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button, Empty, Icon } from "@/components/core";
import { AccountantExportView, type AccountantExportData } from "@/components/management/money/money-views";
import { KitPage, OwnsChrome } from "@/components/management/ui";
import { ManagementShell } from "@/components/settings/management-shell";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";

const KEY = ["books", "accountant-export"] as const;

/** Management → Accountant export: choose the period and download the workbook (D). */
export function AccountantExportSettings() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: () => fetchJson<AccountantExportData>("/api/books/accountant-export/history") });
  const [range, setRange] = React.useState<{ from: string; to: string } | null>(null);
  const data = query.data;
  const from = range?.from ?? data?.yearToDate.from ?? "";
  const to = range?.to ?? data?.yearToDate.to ?? "";
  let body: React.ReactNode;
  if (data) {
    body = (
      <AccountantExportView
        data={data}
        from={from}
        to={to}
        onFrom={(next) => setRange({ from: next, to })}
        onTo={(next) => setRange({ from, to: next })}
        href={`/api/books/accountant-export?from=${from}&to=${to}`}
        onDownloaded={() => void client.invalidateQueries({ queryKey: KEY })}
      />
    );
  } else if (query.isError) {
    const refused = query.error instanceof ApiError && query.error.status === 403;
    body = (
      <KitPage title="Accountant export" mark={<Icon name="export" />}>
        <Empty icon={refused ? "lock" : "warn"} title={refused ? "Only the owner, a manager or the accountant download the books" : "The export did not load"} action={refused ? null : <Button icon="history" onClick={() => void query.refetch()}>Try again</Button>}>
          {getApiErrorMessage(query.error, "Check the connection and try again.")}
        </Empty>
      </KitPage>
    );
  } else {
    body = (
      <KitPage title="Accountant export" mark={<Icon name="export" />}>
        <div aria-busy="true" aria-label="Loading the export" style={{ display: "grid", gap: 16 }}>
          <div className="skeleton" style={{ height: 56, maxWidth: 720 }} />
          <div className="skeleton" style={{ height: 240 }} />
        </div>
      </KitPage>
    );
  }
  return (
    <ManagementShell>
      <OwnsChrome>{body}</OwnsChrome>
    </ManagementShell>
  );
}
