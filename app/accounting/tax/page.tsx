"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { VatPageView } from "@/components/books/vat-view";
import { Button, ButtonLink, Drawer, Field, Input, Kit } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { VatView } from "@/lib/books/vat";

const AGAIN = "Check the connection and try again.";

/** The month before this one, as `YYYY-MM`: the return people prepare. */
function lastMonth() {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return date.toISOString().slice(0, 7);
}

function PrepareDrawer({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (open: boolean) => void; onDone: (id: string) => void }) {
  const [month, setMonth] = React.useState(lastMonth);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (open) {
      setMonth(lastMonth());
      setError(null);
    }
  }, [open]);
  const prepare = useMutation({
    mutationFn: () => {
      const [year, m] = month.split("-").map(Number);
      const end = new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10);
      return fetchJson<{ id: string }>("/api/accounting/vat-returns", {
        method: "POST",
        body: JSON.stringify({ periodStart: `${month}-01`, periodEnd: end }),
      });
    },
    onSuccess: (made) => {
      onDone(made.id);
      onOpenChange(false);
    },
    onError: (failure) => setError(getApiErrorMessage(failure, AGAIN)),
  });
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Prepare a return"
      footer={
        <>
          <Button variant="quiet" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" shortcut="Ctrl ↵" busy={prepare.isPending} disabled={!month || prepare.isPending} onClick={() => prepare.mutate()}>
            Prepare
          </Button>
        </>
      }
    >
      <div style={{ padding: "16px 24px" }}>
        <Field
          label="Month"
          htmlFor="vat-month"
          error={error}
          help="The return adds up the VAT on everything posted in the month. Preparing a month again refreshes it."
        >
          <Input id="vat-month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        </Field>
      </div>
    </Drawer>
  );
}

function VatReturns() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const client = useQueryClient();
  const { toast } = useToast();
  const [preparing, setPreparing] = React.useState(false);
  const chosen = params.get("return");

  const vat = useQuery({
    queryKey: ["books", "vat", chosen],
    queryFn: () => fetchJson<VatView>(`/api/books/vat${chosen ? `?return=${chosen}` : ""}`),
    placeholderData: (previous) => previous,
  });
  const select = (id: string) => router.replace(`${pathname}?return=${id}`, { scroll: false });
  const selectedId = vat.data?.selected?.id ?? null;

  const step = useMutation({
    mutationFn: (action: "review" | "finalize" | "file" | "refresh") =>
      action === "refresh"
        ? fetchJson(`/api/accounting/vat-returns/${selectedId}`, { method: "PATCH", body: "{}" })
        : fetchJson(`/api/accounting/vat-returns/${selectedId}/${action}`, { method: "POST", body: "{}" }),
    onSuccess: (_, action) => {
      toast({
        title: { review: "Marked reviewed", finalize: "Finalised", file: "Marked filed", refresh: "Refreshed from the books" }[action],
      });
      client.invalidateQueries({ queryKey: ["books"] });
    },
    onError: (error) => toast({ title: "The return did not change", description: getApiErrorMessage(error, AGAIN), variant: "destructive" }),
  });

  return (
    <>
      <PageChrome title="VAT returns">
        <Kit contents>
          <ButtonLink href="/accounting/tax/setup" variant="quiet" icon="gear">
            Tax setup
          </ButtonLink>
          <Button onClick={() => setPreparing(true)}>Prepare a return</Button>
        </Kit>
      </PageChrome>
      <BooksPage screen="books-vat">
        {vat.data ? (
          <VatPageView
            data={vat.data}
            busy={step.isPending}
            onSelect={select}
            onStep={(action) => step.mutate(action)}
            onRefresh={() => step.mutate("refresh")}
            csvHref={selectedId ? `/api/accounting/vat-returns/${selectedId}/export?format=csv` : null}
          />
        ) : vat.isError ? (
          <BooksError what="VAT returns" onRetry={() => vat.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
      <PrepareDrawer
        open={preparing}
        onOpenChange={setPreparing}
        onDone={(id) => {
          client.invalidateQueries({ queryKey: ["books"] });
          select(id);
        }}
      />
    </>
  );
}

/** Books → VAT returns (design/core-modules/boards/view/PageBooksVat.html). Tax codes and rules are on Tax setup. */
export default function VatReturnsPage() {
  return (
    <React.Suspense
      fallback={
        <BooksPage screen="books-vat">
          <BooksLoading />
        </BooksPage>
      }
    >
      <VatReturns />
    </React.Suspense>
  );
}
