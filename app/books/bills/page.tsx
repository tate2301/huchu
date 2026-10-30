"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { BkBillsView } from "@/components/books/bk-bills-view";
import { downloadCsv } from "@/components/books/bk-list";
import { BkError, BkLoading, BkPage } from "@/components/books/ui";
import { useBulkUndo } from "@/components/books/undo-dialogs";
import { useBooksPlan } from "@/components/books/use-books-plan";
import { Kit } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { BillQuery, BillRow, BillsView } from "@/lib/books/bills";
import { money } from "@/lib/books/format";

const NEW_BILL = { label: "New bill", icon: "plus" as const, href: "/books/bills/new", shortcut: "N" };

/**
 * Books → Bills & spending → Bills (bk-bills). The filters live in the address.
 * From a goods receipt lists the draft bills goods receipts made (D12), each
 * finished in the bill form. A selection pays one supplier's bills, records
 * drafts (each through the core; those it cannot are skipped with why) or
 * exports.
 */
function BooksBills() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const search = params.toString();
  const { toast } = useToast();
  const client = useQueryClient();
  const { bulk } = useBooksPlan();

  const bills = useQuery({
    queryKey: ["books", "bills", search],
    queryFn: () => fetchJson<BillsView>(`/api/books/bills${search ? `?${search}` : ""}`),
    placeholderData: (previous) => previous,
  });

  const onQuery = React.useCallback(
    (next: Partial<BillQuery>) => {
      const merged = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(next)) {
        const empty = value === null || value === "" || (key === "view" && value === "to-pay") || (key === "period" && value === "any") || (key === "sort" && value === "due") || (key === "page" && value === 1);
        if (empty) merged.delete(key);
        else merged.set(key, String(value));
      }
      const query = merged.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  // Accounting's New debit note and Write off land here: each is made from its bill's page.
  const action = params.get("action");
  React.useEffect(() => {
    if (action !== "new-debit-note" && action !== "new-write-off") return;
    toast({ title: action === "new-debit-note" ? "Open the bill it is for" : "Open the bill to write off", description: `Then ${action === "new-debit-note" ? "Debit note" : "Write off"} in its menu.` });
    onQuery({ action: null } as Partial<BillQuery> & { action: null });
  }, [action, onQuery, toast]);

  const recordDrafts = async (rows: BillRow[]) => {
    const done: string[] = [];
    const skipped: string[] = [];
    for (const row of rows) {
      try {
        const saved = await fetchJson<{ number: string | null }>(`/api/books/bills/${row.id}`, { method: "PATCH", body: JSON.stringify({ action: "record" }) });
        done.push(saved.number ?? row.number);
      } catch (error) {
        skipped.push(`${row.supplier.name}: ${getApiErrorMessage(error, "it was not recorded")}`);
      }
    }
    toast({
      title: done.length ? `${done.length === 1 ? done[0] : `${done.length} bills`} recorded` : "Nothing was recorded",
      description: skipped.length ? `Skipped: ${skipped.join(" ")}` : "Each is posted to the books.",
      variant: done.length ? "success" : "destructive",
    });
    await client.invalidateQueries({ queryKey: ["books"] });
  };

  const undo = useBulkUndo("bill", () => client.invalidateQueries({ queryKey: ["books"] }));
  const more = (rows: BillRow[]): MenuEntry[] => {
    const drafts = rows.filter((row) => row.state === "draft");
    return [
      {
        key: "export",
        icon: "export",
        label: `Export ${rows.length === 1 ? "1 row" : `${rows.length} rows`}`,
        onSelect: () =>
          downloadCsv(
            "bills.csv",
            ["Bill", "Supplier", "For", "FDMS", "Order", "Goods received", "Due", "Currency", "Balance"],
            rows.map((row) => [row.number, row.supplier.name, row.what ?? "", row.fdms ? FDMS_LABEL[row.fdms] : "", row.matches.order ?? "", row.matches.receipt ?? "", row.when, row.currency, row.balance.toFixed(2)]),
          ),
      },
      {
        key: "record",
        icon: "check",
        label: drafts.length ? `Record ${drafts.length === 1 ? "1 draft" : `${drafts.length} drafts`}` : "Record drafts",
        disabled: drafts.length === 0,
        title: drafts.length === 0 ? "None of these is a draft." : undefined,
        onSelect: () => void recordDrafts(drafts),
      },
      // Void and Delete permanently over the selected bills (P4): as this person's role allows, on the
      // Books screens (bulk is theirs, lib/books/tiers.ts); a debit note on the list is its bill's to undo.
      ...(bulk ? undo.entries(
        rows
          .filter((row) => row.href === `/books/bills/${row.id}`)
          .map((row) => ({ id: row.id, label: row.number, posted: row.state !== "draft", party: row.supplier.name, amount: money(row.total, row.currency) })),
      ) : []),
    ];
  };

  const receipts = bills.data?.fromReceipts ?? [];

  return (
    <>
      <PageChrome title="Bills" primary={NEW_BILL}>
        <Kit contents>
          <MenuButton
            icon="list"
            iconEnd={undefined}
            label="From a goods receipt"
            items={
              receipts.length
                ? receipts.map((draft) => ({ key: draft.id, icon: "docs" as const, label: `${draft.receipt}, ${draft.supplier}, ${money(draft.total, draft.currency)}`, onSelect: () => router.push(`/books/bills/new?bill=${draft.id}`) }))
                : [{ key: "none", label: "No goods receipt is waiting for its bill", disabled: true, onSelect: () => undefined }]
            }
          >
            From a goods receipt
          </MenuButton>
        </Kit>
      </PageChrome>
      <BkPage screen="bills" scroll={false}>
        {bills.data ? (
          <BkBillsView
            data={bills.data}
            onQuery={onQuery}
            exportHref={`/api/books/bills?${new URLSearchParams([...params.entries(), ["format", "csv"]]).toString()}`}
            onPay={(rows) => router.push(`/books/payments-made/new?supplier=${rows[0]!.supplier.id}&bills=${rows.map((row) => row.id).join(",")}`)}
            more={more}
          />
        ) : bills.isError ? (
          <BkError what="Bills" onRetry={() => bills.refetch()} />
        ) : (
          <BkLoading />
        )}
      </BkPage>
      {undo.node}
    </>
  );
}

/** Books → Bills & spending → Bills (design/books/html/bk-bills.html). */
export default function BooksBillsPage() {
  return (
    <React.Suspense fallback={<BkPage screen="bills" scroll={false}><BkLoading /></BkPage>}>
      <BooksBills />
    </React.Suspense>
  );
}
