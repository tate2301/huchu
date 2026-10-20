"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button, Empty, Icon } from "@/components/core";
import { MoneyAndTaxView, type MoneyAndTaxData } from "@/components/management/money/money-views";
import { KitPage, OwnsChrome } from "@/components/management/ui";
import { ManagementShell } from "@/components/settings/management-shell";
import { useToast } from "@/components/ui/use-toast";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { BusinessSettings } from "@/lib/books/core/business-settings";

const KEY = ["books", "money-and-tax"] as const;

/** Management → Money and tax: the business's tax details, saved by the owner or the accountant. */
export function MoneyAndTaxSettings() {
  const client = useQueryClient();
  const { toast } = useToast();
  const [error, setError] = React.useState<{ message: string; field?: string } | null>(null);
  const query = useQuery({ queryKey: KEY, queryFn: () => fetchJson<MoneyAndTaxData>("/api/books/money-and-tax") });
  const save = useMutation({
    mutationFn: (patch: Partial<BusinessSettings>) => fetchJson<BusinessSettings>("/api/books/money-and-tax", { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => {
      setError(null);
      toast({ title: "Saved", description: "Documents and returns use them from now on.", variant: "success" });
      void client.invalidateQueries({ queryKey: ["books"] });
    },
    onError: (failure) => {
      const details = failure instanceof ApiError ? (failure.details as { field?: string } | undefined) : undefined;
      setError({ message: getApiErrorMessage(failure, "Check the connection and try again."), field: details?.field });
    },
  });
  let body: React.ReactNode;
  if (query.data) body = <MoneyAndTaxView data={query.data} saving={save.isPending} error={error} onSave={(patch) => save.mutate(patch)} />;
  else if (query.isError) {
    const refused = query.error instanceof ApiError && query.error.status === 403;
    body = (
      <KitPage title="Money and tax" mark={<Icon name="vat" />}>
        <Empty icon={refused ? "lock" : "warn"} title={refused ? "Only the owner, a manager or the accountant see the tax details" : "Money and tax did not load"} action={refused ? null : <Button icon="history" onClick={() => void query.refetch()}>Try again</Button>}>
          {getApiErrorMessage(query.error, "Check the connection and try again.")}
        </Empty>
      </KitPage>
    );
  } else {
    body = (
      <KitPage title="Money and tax" mark={<Icon name="vat" />}>
        <div aria-busy="true" aria-label="Loading money and tax" style={{ display: "grid", gap: 16 }}>
          <div className="skeleton" style={{ height: 56, maxWidth: 720 }} />
          <div className="skeleton" style={{ height: 360 }} />
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
