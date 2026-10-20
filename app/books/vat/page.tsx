"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { BankEntryDrawer } from "@/components/books/bk-bank-entry-drawer";
import { downloadCsv, useListQuery } from "@/components/books/bk-list";
import { ReasonDrawer } from "@/components/books/bk-reason-drawer";
import { BkVatReturnView } from "@/components/books/bk-vat-return-view";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { Banner, Button, ButtonGroup, Drawer, Field, Input, Kit, TextArea } from "@/components/core";
import { MenuButton, type MenuEntry } from "@/components/core/menu";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { VatCurrencyView, VatTab } from "@/lib/books/vat-labels";
import type { VatPage } from "@/lib/books/vat-return-page";

const AGAIN = "Check the connection and try again.";
type Query = { tab: VatTab | null; view: VatCurrencyView; return: string | null };
type Step = "send" | "finalise" | "file" | null;

const n2 = (n: number) => new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

/**
 * Books → Tax → VAT returns (BkVatReturn). Refresh the figures (R) gathers
 * the period's draft again. The one other visible action is the return's next
 * step: send for review (or mark it reviewed, by the second person), finalise
 * (explaining any difference from 2200 and 2210 first), file with the TaRMS
 * reference, pay. The caret holds a new period's return and Void (owner).
 */
function BooksVat() {
  const client = useQueryClient();
  const { toast } = useToast();
  const { params, onQuery } = useListQuery<Query>({ view: "all" });
  const tab = params.get("tab") as VatTab | null;
  const view = (params.get("view") as VatCurrencyView | null) ?? "all";
  const chosen = params.get("return");
  const [step, setStep] = React.useState<Step>(null);
  const [voiding, setVoiding] = React.useState(false);
  const [paying, setPaying] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [period, setPeriod] = React.useState<string | null>(null);

  const query = useQuery({
    queryKey: ["books", "vat", tab, view, chosen],
    queryFn: () => fetchJson<VatPage>(`/api/books/vat?${new URLSearchParams({ ...(tab ? { tab } : {}), view, ...(chosen ? { return: chosen } : {}) }).toString()}`),
    placeholderData: (previous) => previous,
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["books"] });
  const data = query.data;
  const cur = data?.current ?? null;

  const act = useMutation({
    mutationFn: (body: Record<string, unknown>) => fetchJson<{ id: string; status: string }>("/api/books/vat", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (result, body) => {
      const words: Record<string, string> = { refresh: "The figures are gathered again", review: "Marked reviewed", finalise: "Finalised: its figures are locked", file: "Filed" };
      toast({ title: words[String(body.action)] ?? "Done", variant: "success" });
      setStep(null);
      setPeriod(null);
      onQuery({ return: result.id, tab: null });
      refresh();
    },
    onError: (error) => toast({ title: "The return was not changed", description: getApiErrorMessage(error, AGAIN), variant: "destructive" }),
  });

  const state = cur?.state ?? "none";
  const preparedByMe = Boolean(cur && data && cur.preparedBy && !data.reviewers.includes(cur.preparedBy));
  const next: React.ReactNode =
    !cur || !data
      ? null
      : state === "draft"
        ? preparedByMe && data.reviewers.length > 0
          ? <Button icon="send" onClick={() => setStep("send")}>Send for review</Button>
          : <Button icon="check" disabled={!data.can.prepare} title={data.can.why.prepare ?? undefined} busy={act.isPending} onClick={() => act.mutate({ action: "review", id: cur.id })}>{data.reviewers.length ? "Mark reviewed" : "Send for review"}</Button>
        : state === "reviewed"
          ? <Button variant="ink" icon="check" disabled={!data.can.file} title={data.can.why.file ?? undefined} onClick={() => { setNotes(cur.notes ?? ""); setStep("finalise"); }}>Finalise</Button>
          : state === "finalised"
            ? <Button variant="ink" icon="send" disabled={!data.can.file} title={data.can.why.file ?? undefined} onClick={() => { setReference(""); setStep("file"); }}>File</Button>
            : state === "filed"
              ? <Button icon="payments" onClick={() => setPaying(true)}>Pay</Button>
              : null;

  const menu: MenuEntry[] = data
    ? [
        { key: "period", icon: "calendar", label: "A return for another period", disabled: !data.can.prepare, title: data.can.why.prepare ?? undefined, onSelect: () => setPeriod(new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1)).toISOString().slice(0, 7)) },
        ...(cur?.id && state !== "filed" ? [{ key: "void", icon: "x" as const, label: "Void the return", danger: true, disabled: !data.can.void, title: data.can.why.void ?? undefined, onSelect: () => setVoiding(true) }] : []),
      ]
    : [];
  const canRefresh = Boolean(data?.can.prepare) && (state === "draft" || state === "reviewed" || state === "none");

  const schedule = () => {
    if (!cur) return;
    const rows: Array<Array<string | number>> = [];
    for (const [group, lines] of [["Output", cur.output], ["Input", cur.input], ["Withheld", cur.withheld]] as const) for (const line of lines) rows.push([group, line.label, line.docs, line.value.toFixed(2), line.vat.toFixed(2)]);
    rows.push(["Net", "Net VAT due to ZIMRA", "", "", cur.totals.net.toFixed(2)]);
    rows.push(["Tie-out", "2200 VAT output, ledger", "", "", cur.tieOut.output.ledger.toFixed(2)]);
    rows.push(["Tie-out", "2210 VAT input, ledger", "", "", cur.tieOut.input.ledger.toFixed(2)]);
    for (const [box, value] of Object.entries(cur.boxes ?? {})) rows.push(["VAT 7", box, "", "", Number(value).toFixed(2)]);
    downloadCsv(`vat-7-${cur.period.end.slice(0, 7)}.csv`, ["Part", "Line", "Documents", "Value", "VAT"], rows);
  };

  return (
    <>
      <PageChrome title="VAT returns">
        {data ? (
          <Kit contents>
            {next}
            <ButtonGroup aria-label="Refresh, and more">
              <Button variant="primary" icon="arrow" shortcut="R" disabled={!canRefresh || act.isPending} title={canRefresh ? undefined : state === "finalised" || state === "filed" ? "A finalised return’s figures are locked." : (data.can.why.prepare ?? undefined)} busy={act.isPending && act.variables?.action === "refresh"} onClick={() => act.mutate({ action: "refresh", id: cur?.id ?? null })}>
                Refresh the figures
              </Button>
              <MenuButton variant="primary" iconOnly icon="down" iconEnd={undefined} align="end" label="More actions" aria-label="More actions" items={menu} />
            </ButtonGroup>
          </Kit>
        ) : null}
      </PageChrome>
      <BooksPage screen="bk-b">
        {data ? (
          <BkVatReturnView data={data} onQuery={(nextQuery) => onQuery({ ...nextQuery, return: null })} onPick={(id) => onQuery({ return: id })} onSchedule={schedule} />
        ) : query.isError ? (
          <BooksError what="The VAT returns" onRetry={() => query.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
      <Drawer
        open={step === "send"}
        onOpenChange={(open) => !open && setStep(null)}
        title="Send for review"
        footer={
          <>
            <Button variant="quiet" onClick={() => setStep(null)}>
              Cancel
            </Button>
            <a
              className="btn btn-primary"
              href={`https://wa.me/?text=${encodeURIComponent(`Please review the VAT return for ${cur?.period.words ?? "this period"} in Books: ${typeof window === "undefined" ? "" : `${window.location.origin}/books/vat?return=${cur?.id ?? ""}`}`)}`}
              target="_blank"
              rel="noreferrer"
              onClick={() => setStep(null)}
            >
              Send on WhatsApp
            </a>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "16px 24px" }}>
          <p>A second person reviews the return you prepared. {data?.reviewers.join(" or ")} can mark it reviewed from this page.</p>
        </div>
      </Drawer>
      <Drawer
        open={step === "finalise"}
        onOpenChange={(open) => !open && setStep(null)}
        title="Finalise the return"
        footer={
          <>
            <Button variant="quiet" onClick={() => setStep(null)}>
              Cancel
            </Button>
            <Button variant="primary" icon="check" shortcut="Ctrl ↵" busy={act.isPending} disabled={act.isPending || Boolean(cur && !cur.tieOut.ties && notes.trim().length < 3)} onClick={() => cur && act.mutate({ action: "finalise", id: cur.id, notes: notes.trim() || null })}>
              Finalise
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "16px 24px" }}>
          {cur && !cur.tieOut.ties ? (
            <Banner tone="warning">
              <b>It differs from the ledger.</b> {`Output ${n2(cur.tieOut.output.difference)}, input ${n2(cur.tieOut.input.difference)}, withheld ${n2(cur.tieOut.withheld.difference)} against 2200 and 2210. Say why before finalising.`}
            </Banner>
          ) : (
            <p>It ties to 2200 and 2210, difference 0.00. Finalising locks its figures; its documents can’t be deleted.</p>
          )}
          <Field label="Explanation" htmlFor="vat-notes" help={cur && !cur.tieOut.ties ? "Required: what makes up the difference." : "Optional."}>
            <TextArea id="vat-notes" rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>
        </div>
      </Drawer>
      <Drawer
        open={step === "file"}
        onOpenChange={(open) => !open && setStep(null)}
        title="File the return"
        footer={
          <>
            <Button variant="quiet" onClick={() => setStep(null)}>
              Cancel
            </Button>
            <Button variant="primary" icon="check" shortcut="Ctrl ↵" busy={act.isPending} disabled={act.isPending || reference.trim().length < 2} onClick={() => cur && act.mutate({ action: "file", id: cur.id, reference: reference.trim() })}>
              Record as filed
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "16px 24px" }}>
          <p>File it in TaRMS, then enter the reference TaRMS gives you.</p>
          <Field label="TaRMS reference" htmlFor="vat-ref">
            <Input id="vat-ref" value={reference} onChange={(event) => setReference(event.target.value)} />
          </Field>
        </div>
      </Drawer>
      <Drawer
        open={period !== null}
        onOpenChange={(open) => !open && setPeriod(null)}
        title="A return for another period"
        footer={
          <>
            <Button variant="quiet" onClick={() => setPeriod(null)}>
              Cancel
            </Button>
            <Button variant="primary" icon="arrow" shortcut="Ctrl ↵" busy={act.isPending} disabled={!period || act.isPending} onClick={() => period && act.mutate({ action: "refresh", period })}>
              Gather the figures
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "16px 24px" }}>
          <Field label="A month in the period" htmlFor="vat-period" help="The return covers the VAT period that month falls in.">
            <Input id="vat-period" type="month" value={period ?? ""} onChange={(event) => setPeriod(event.target.value)} />
          </Field>
        </div>
      </Drawer>
      <ReasonDrawer
        open={voiding}
        onOpenChange={setVoiding}
        title="Void the return"
        sub={cur?.period.words}
        what="Its documents unlock and the period can be gathered again. The reason is kept."
        label="Void it"
        onConfirm={async (reason) => {
          if (!cur?.id) return;
          await fetchJson("/api/books/vat", { method: "POST", body: JSON.stringify({ action: "void", id: cur.id, reason }) });
          setVoiding(false);
          toast({ title: "The return is void", variant: "success" });
          onQuery({ return: null });
          await refresh();
        }}
      />
      <BankEntryDrawer
        kind={paying ? "TAX" : null}
        preset={cur ? { amount: Math.max(0, cur.totals.net), taxCode: "2200", description: `VAT for ${cur.period.words}${cur.reference ? `, ${cur.reference}` : ""}` } : null}
        onOpenChange={(open) => !open && setPaying(false)}
        onDone={() => {
          setPaying(false);
          toast({ title: "Paid: VAT payable is cleared", variant: "success" });
          refresh();
        }}
      />
    </>
  );
}

/** Books → Tax → VAT returns (design/core-modules/boards/view/BkVatReturn.html). */
export default function BooksVatPage() {
  return (
    <React.Suspense
      fallback={
        <BooksPage screen="bk-b">
          <BooksLoading />
        </BooksPage>
      }
    >
      <BooksVat />
    </React.Suspense>
  );
}
