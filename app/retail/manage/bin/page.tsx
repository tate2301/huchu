"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ColumnList, ColumnName, ColumnRowAction, ColumnText, FormPage } from "@/components/management/ui";
import { FactRowsSkeleton, LoadFailure } from "@/components/preferences/organization/form-parts";
import { ShopSettingsShell } from "@/components/retail/shop-settings";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { BinEntry, BinKind } from "@/lib/retail/bin";
import { formatRetailDate } from "@/lib/retail/words";

const BIN_KEY = ["retail-bin"] as const;

const KIND: Record<BinKind, string> = {
  product: "Product",
  promotion: "Promotion",
  category: "Category",
};

const RESTORED: Record<BinKind, string> = {
  product: "Restored. It is back in every list.",
  promotion: "Restored, inactive. Set its dates to run it again.",
  category: "Restored, and back in every product field.",
};

/**
 * Settings › Bin — what the shop removed, and the way back.
 *
 * Nothing is deleted from here, because nothing a shop removes is deleted:
 * sales, receipts and products point at these. Restore puts each back where
 * it was, for 30 days after it went in.
 */
export default function RetailBinPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: BIN_KEY,
    queryFn: () => fetchJson<{ data: BinEntry[] }>("/api/v2/retail/bin"),
  });
  const entries = query.data?.data ?? [];

  const restore = useMutation({
    mutationFn: (entry: BinEntry) =>
      fetchJson("/api/v2/retail/bin/restore", { method: "POST", body: JSON.stringify({ kind: entry.kind, id: entry.id }) }),
    onSuccess: async (_result, entry) => {
      toast({ title: `${entry.name} restored`, description: RESTORED[entry.kind], variant: "success" });
      await Promise.all(
        [BIN_KEY, ["retail-catalog"], ["retail-categories"], ["retail-promotions"]].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
    onError: (error) =>
      toast({ title: "That was not restored", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  return (
    <ShopSettingsShell>
      <FormPage title="Bin">
        {query.isLoading ? (
          <FactRowsSkeleton rows={3} />
        ) : query.isError ? (
          <LoadFailure
            message={`The bin would not load. ${getApiErrorMessage(query.error)}`}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <ColumnList
            label="Bin"
            maxWidth={720}
            empty="Nothing has been removed."
            columns={[
              { id: "name", label: "Removed" },
              { id: "kind", label: "Kind", hideBelow: "sm" },
              { id: "when", label: "When", align: "end", hideBelow: "sm" },
              { id: "act", label: "", align: "end" },
            ]}
            rows={entries.map((entry) => ({
              id: `${entry.kind}:${entry.id}`,
              cells: {
                name: <ColumnName name={entry.name} meta={entry.detail} />,
                kind: <ColumnText>{KIND[entry.kind]}</ColumnText>,
                when: <ColumnText>{formatRetailDate(entry.removedAt)}</ColumnText>,
                act: (
                  <ColumnRowAction>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      aria-label={`Restore ${entry.name}`}
                      disabled={restore.isPending}
                      onClick={() => restore.mutate(entry)}
                    >
                      Restore
                    </Button>
                  </ColumnRowAction>
                ),
              },
            }))}
          />
        )}
      </FormPage>
    </ShopSettingsShell>
  );
}
