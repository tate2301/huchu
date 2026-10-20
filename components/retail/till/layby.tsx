"use client";

/**
 * Lay-bys at the till (W-42, FLR-09 over FLR-06's service; boards T4-1–T4-3):
 * put the cart aside for a customer with a deposit, find a lay-by on
 * Customers, take a payment on it in a tray like the sale's, and hand it over
 * once it is paid, printing the hand-over sale's receipt. Every one goes
 * through `/api/v2/retail/laybys` on the till's PIN session: the till's own
 * open shift is the drawer.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/components/ui/use-toast";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Archive, CaretLeft, Check, HandCoins, MagnifyingGlass, Package, User, CircleUserRound, UserPlus, X } from "@/lib/icons";
import { newPosCustomer, type PosCustomer } from "@/lib/retail/customers/pos-customer";
import { handedOverWords, startedWords } from "@/lib/retail/floor/layby-words";
import { getPosPortalHref } from "@/lib/retail/pos-host";
import { SHOP_TIME_ZONE } from "@/lib/retail/shop-profile-rules";
import { count, qty, usd } from "./format";
import { ErrorLine, LoadFailed, TillDialog, useReturnFocus, useWindowKeys } from "./parts";
import { printReceipt, TenderMark } from "./pay-tray";
import { useTill } from "./state";

type Tender = "CASH" | "ECOCASH" | "CARD";

/** `GET /api/v2/retail/laybys/new`: what starting one needs here. */
type LaybyForm = {
  minDepositPct: string;
  maxDays: number;
  defaultDue: string;
  tenders: Array<{ value: Tender; label: string }>;
  referenceRequired: boolean;
  noDrawer: string;
};

/** `GET /api/v2/retail/laybys/{id}`, as the till reads it. */
type LaybyView = {
  id: string;
  laybyNo: string;
  status: "PAYING" | "READY" | "COLLECTED" | "CANCELLED";
  stateLabel: string;
  customer: { id: string; name: string; phone: string | null };
  what: string;
  total: string;
  paid: string;
  left: string;
  dueOn: string;
  dueOnText: string;
  saleNo: string | null;
  lines: Array<{ name: string; quantity: number; price: string; total: string }>;
  /** `at` is "3 Oct 13:12". */
  payments: Array<{ at: string; kind: string; tender: string; amount: string; by: string }>;
  lastTender: Tender | null;
  tenders: Array<{ value: Tender; label: string }>;
  referenceRequired: boolean;
  can: { pay: boolean; handOver: boolean; cancel: boolean; changeDate: boolean };
};

/** A row of the Lay-bys list (`GET /api/v2/reports/retail-laybys?page=1&q=`). */
export type LaybyRow = {
  id: string;
  laybyNo: string;
  customer: string;
  customerId: string;
  what: string;
  total: number;
  left: number;
  dueOn: string | null;
  statusKey: "PAYING" | "READY" | "COLLECTED" | "CANCELLED";
  state: string;
  timing: "on-time" | "soon" | "overdue" | null;
};

/** What a payment just taken left the lay-by at, for the column that says so (T4-3). */
type LaybyPaid = { laybyNo: string; amount: number; tender: Tender; tenderLabel: string; paid: number; left: number; ready: boolean };

const LAYBY_KEY = ["retail-pos-laybys"] as const;

const cents = (value: number) => Math.round(value * 100) / 100;
const AMOUNT = /^\d{1,9}(\.\d{1,2})?$/;

const shortDay = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: SHOP_TIME_ZONE });
/** "30 Nov" from `2026-11-30`. */
export const byDay = (day: string | null | undefined) => (day ? shortDay.format(new Date(`${day}T12:00:00Z`)) : "");
/** "3 Oct" from the view's "3 Oct 13:12". */
const dateOf = (at: string) => at.replace(/\s\d{1,2}:\d{2}$/, "");

function refusalText(error: unknown): string {
  if (error instanceof ApiError) {
    const fields = (error.details as { fieldErrors?: Record<string, string> } | undefined)?.fieldErrors;
    const first = fields ? Object.values(fields)[0] : null;
    return first ?? error.message;
  }
  return getApiErrorMessage(error);
}

/** A key from anywhere but a field, a menu or a dialog. */
export function freeKey(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return false;
  const target = event.target as HTMLElement | null;
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return false;
  return !document.querySelector('[role="dialog"], [role="menu"]');
}

/** The Enter key on whatever is not a button: a button's own Enter presses it. */
const enterHere = (event: { key: string; target: EventTarget | null }) =>
  event.key === "Enter" && (event.target as HTMLElement | null)?.tagName !== "BUTTON";

/* ─── A customer: search, or add with a phone ─────────────────────────── */

/** "CU-0307 · 0772 905 113": a customer's code and phone, as the rows show them. */
export function customerLine(customer: Pick<PosCustomer, "code" | "phone">) {
  return [customer.code, customer.phone].filter(Boolean).join(" · ");
}

export function CustomerPicker({ value, onChange, label = "Customer" }: { value: PosCustomer | null; onChange: (customer: PosCustomer | null) => void; label?: string }) {
  const [query, setQuery] = React.useState("");
  const [adding, setAdding] = React.useState<{ phone: string; name: string } | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const ids = React.useId();
  const term = query.trim();
  const found = useQuery({
    queryKey: ["retail-pos-customer-search", term],
    enabled: term.length >= 2 && !value,
    queryFn: () => fetchJson<{ data: PosCustomer[] }>(`/api/v2/retail/pos/customers?q=${encodeURIComponent(term)}&limit=6`),
  });
  const add = useMutation({
    mutationFn: (input: { phone: string; name: string }) =>
      fetchJson<{ data: { id: string; code: string; name: string; phone: string; cardNo: string } }>("/api/v2/retail/customers", {
        method: "POST",
        body: JSON.stringify({ phone: input.phone, name: input.name, via: "till" }),
      }),
    onSuccess: (payload) => {
      onChange(newPosCustomer(payload.data));
      setAdding(null);
      setQuery("");
    },
    onError: (error) => setProblem(refusalText(error)),
  });

  if (value) {
    return (
      <div className="field cu-picker">
        <span className="label">{label}</span>
        <div className="cu-crow is-static">
          <span className="hx-glyph">
            <CircleUserRound className="ic" />
          </span>
          <span className="hx-text">
            <span className="hx-t">
              <span className="truncate">{value.name}</span>
            </span>
            <span className="hx-s num">{customerLine(value)}</span>
          </span>
          <button type="button" className="btn btn-quiet" onClick={() => onChange(null)}>
            <X className="ic" />
            Change
          </button>
        </div>
      </div>
    );
  }

  if (adding) {
    return (
      <div className="field cu-picker">
        <span className="label">New customer</span>
        <div className="cu-add">
          <input aria-label="Phone" placeholder="Phone" className="input input-lg num text-left" inputMode="tel" autoFocus={!adding.phone} value={adding.phone} onChange={(event) => setAdding({ ...adding, phone: event.target.value })} />
          <input aria-label="Name" placeholder="Name" className="input input-lg" autoFocus={Boolean(adding.phone)} value={adding.name} onChange={(event) => setAdding({ ...adding, name: event.target.value })} />
        </div>
        <div className="cu-add-keys">
          <button type="button" className="btn" onClick={() => setAdding(null)}>
            Back
          </button>
          <button
            type="button"
            className="btn btn-ink"
            disabled={add.isPending}
            aria-busy={add.isPending || undefined}
            onClick={() => {
              if (adding.phone.trim().length < 9) return setProblem("Type their phone number.");
              setProblem(null);
              add.mutate({ phone: adding.phone.trim(), name: adding.name.trim() });
            }}
          >
            <UserPlus className="ic" />
            Add them
          </button>
        </div>
        {problem ? <ErrorLine>{problem}</ErrorLine> : null}
      </div>
    );
  }

  const rows = found.data?.data ?? [];
  return (
    <div className="field cu-picker">
      <label htmlFor={`${ids}q`}>{label}</label>
      <label className="input-wrap cu-search">
        <MagnifyingGlass className="ic" />
        <input id={`${ids}q`} type="search" placeholder="Name or phone" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      {term.length >= 2 ? (
        <div className="cu-clist">
          {rows.map((row) => (
            <button key={row.id} type="button" className="cu-crow" onClick={() => onChange(row)}>
              <span className="hx-glyph">
                <CircleUserRound className="ic" />
              </span>
              <span className="hx-text">
                <span className="hx-t">
                  <span className="truncate">{row.name}</span>
                </span>
                <span className="hx-s num">{customerLine(row)}</span>
              </span>
              <span />
            </button>
          ))}
          <button
            type="button"
            className="cu-crow is-new"
            onClick={() => {
              setProblem(null);
              setAdding(/^[+\d\s]+$/.test(term) ? { phone: term, name: "" } : { phone: "", name: term });
            }}
          >
            <span className="hx-glyph">
              <UserPlus className="ic" />
            </span>
            <span className="hx-text">
              <span className="hx-t">
                <span className="truncate">New customer “{term}”</span>
              </span>
            </span>
            <span />
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ─── Start one from the cart ────────────────────────────────────────── */

/** Round deposits from the smallest up, under the total. */
function depositAmounts(smallest: number, total: number) {
  const out = smallest > 0 ? [smallest] : [];
  for (const step of [5, 10, 20, 50, 100, 200, 500]) {
    if (out.length === 4) break;
    if (step > smallest + 0.004 && step < total - 0.004) out.push(step);
  }
  return out;
}

/** "Lay-by" on the cart: the lines are what is put aside; the deposit goes into this till's drawer. */
export function LaybyStartDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { cart, lineStopped, selectedCustomer, clearCart, shiftHere } = useTill();
  const form = useQuery({
    queryKey: ["retail-layby-form"],
    queryFn: async () => (await fetchJson<{ data: LaybyForm }>("/api/v2/retail/laybys/new")).data,
  });
  const lines = cart.filter((item) => !lineStopped(item));
  const total = cents(lines.reduce((sum, item) => sum + item.shelfPrice * item.quantity, 0));
  const percent = Number(form.data?.minDepositPct ?? 0);
  const smallest = Math.ceil(total * percent - 1e-9) / 100;
  const [customer, setCustomer] = React.useState<PosCustomer | null>(selectedCustomer);
  const [deposit, setDeposit] = React.useState("");
  const [tender, setTender] = React.useState<Tender>("CASH");
  const [reference, setReference] = React.useState("");
  const [due, setDue] = React.useState<string | null>(null);
  const [remind, setRemind] = React.useState(true);
  const [problem, setProblem] = React.useState<string | null>(null);
  const ids = React.useId();
  const dueOn = due ?? form.data?.defaultDue ?? "";
  const tenders = form.data?.tenders ?? [];
  const typed = AMOUNT.test(deposit.trim()) ? Number(deposit) : null;

  const start = useMutation({
    mutationFn: () =>
      fetchJson<{ data: { id: string; laybyNo: string; left: string; dueOn: string } }>("/api/v2/retail/laybys", {
        method: "POST",
        body: JSON.stringify({
          customerId: customer!.id,
          lines: lines.map((item) => ({ productId: item.catalogItemId, quantity: String(item.quantity) })),
          deposit: Number(deposit).toFixed(2),
          depositTender: tender,
          reference: reference.trim() || null,
          dueOn,
          remindWeekly: remind,
        }),
      }),
    onSuccess: (payload) => {
      void queryClient.invalidateQueries({ queryKey: LAYBY_KEY });
      void queryClient.invalidateQueries({ queryKey: ["retail-current-shift"] });
      void queryClient.invalidateQueries({ queryKey: ["retail-pos-catalog"] });
      clearCart();
      toast({ title: startedWords(payload.data), variant: "success" });
      onClose();
    },
    onError: (error) => setProblem(refusalText(error)),
  });

  const submit = () => {
    if (start.isPending) return;
    if (!shiftHere) return setProblem(form.data?.noDrawer ?? "Open a shift on this till first: the cash goes into its drawer.");
    if (!customer) return setProblem("Pick a customer: a lay-by is kept for someone.");
    if (customer.id.startsWith("local:")) return setProblem("This customer is not on the books yet. Try again once the till is back online.");
    if (!AMOUNT.test(deposit.trim()) || Number(deposit) <= 0) return setProblem("Type the deposit, like 20.00.");
    if (Number(deposit) < smallest) return setProblem(`The deposit is at least ${percent}%, ${usd(smallest)}.`);
    if (Number(deposit) >= total) return setProblem("That pays it all: sell it instead.");
    if (!dueOn) return setProblem("Pick the day they pay by.");
    setProblem(null);
    start.mutate();
  };

  return (
    <TillDialog
      open
      large
      compact
      onOpenChange={(open) => !open && onClose()}
      title="Lay-by"
      meta={`${count(lines.length, "line")} · ${usd(total)}`}
      foot={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={start.isPending || form.isLoading} aria-busy={start.isPending || undefined} onClick={submit}>
            <Archive className="ic" />
            Put it aside
            <span className="kbd" aria-hidden="true">
              ↵
            </span>
          </button>
        </>
      }
    >
      <div
        className="cu-start"
        onKeyDown={(event) => {
          if (!enterHere(event) || (event.target as HTMLElement).closest(".cu-picker")) return;
          event.preventDefault();
          submit();
        }}
      >
        <CustomerPicker value={customer} onChange={setCustomer} />
        <div className="cu-pays is-flush">
          {lines.map((item) => (
            <div key={item.catalogItemId} className="cu-pay is-line">
              <span className="num">{qty(item.quantity)} ×</span>
              <span className="truncate">{item.name}</span>
              <span className="num">{usd(cents(item.shelfPrice * item.quantity))}</span>
            </div>
          ))}
        </div>
        <div className="field">
          <label htmlFor={`${ids}d`}>
            Deposit{smallest ? <span className="opt num"> · at least {usd(smallest)}</span> : null}
          </label>
          <div className="cu-deposit">
            <label className="input-wrap cu-search">
              <span className="muted num">US$</span>
              <input id={`${ids}d`} className="num text-left" inputMode="decimal" value={deposit} placeholder={smallest ? smallest.toFixed(2) : "0.00"} onChange={(event) => setDeposit(event.target.value.replace(/[^\d.]/g, ""))} />
            </label>
            {depositAmounts(smallest, total).map((value) => (
              <button key={value} type="button" className="cu-note num" aria-pressed={typed !== null && Math.abs(typed - value) < 0.004} onClick={() => setDeposit(value.toFixed(2))}>
                {value.toFixed(2)}
              </button>
            ))}
          </div>
        </div>
        <div className="hx-pills is-wrap" role="radiogroup" aria-label="Deposit with">
          {tenders.map((entry) => (
            <button key={entry.value} type="button" role="radio" className="hx-pill" aria-checked={tender === entry.value} onClick={() => setTender(entry.value)}>
              {entry.label}
            </button>
          ))}
        </div>
        {tender !== "CASH" && form.data?.referenceRequired ? (
          <div className="field">
            <label htmlFor={`${ids}r`}>Reference</label>
            <input id={`${ids}r`} className="input input-lg num text-left" value={reference} onChange={(event) => setReference(event.target.value)} />
          </div>
        ) : null}
        <div className="cu-due">
          <div className="field">
            <label htmlFor={`${ids}w`}>Pay by</label>
            <input id={`${ids}w`} className="input input-lg" type="date" value={dueOn} onChange={(event) => setDue(event.target.value)} />
          </div>
          <label className="check">
            <input type="checkbox" className="switch" checked={remind} onChange={(event) => setRemind(event.target.checked)} />
            <span>Remind on WhatsApp each week</span>
          </label>
        </div>
        <div className="cu-left is-flush">
          <div>
            <div className="cu-left-k">Deposit</div>
            <div className="cu-left-v">{usd(typed ?? 0)}</div>
          </div>
          <div>
            <div className="cu-left-k">Left{dueOn ? `, by ${byDay(dueOn)}` : ""}</div>
            <div className="cu-left-v is-to">{usd(Math.max(total - (typed ?? 0), 0))}</div>
          </div>
        </div>
        {problem ? <ErrorLine>{problem}</ErrorLine> : null}
      </div>
    </TillDialog>
  );
}

/* ─── The list ───────────────────────────────────────────────────────── */

const OPEN = new Set(["PAYING", "READY"]);

/** Lay-bys by customer or LAY number, the open ones first. */
export function useLaybyRows(term: string, enabled = true) {
  return useQuery({
    queryKey: [...LAYBY_KEY, term],
    enabled,
    queryFn: async () => {
      const found = await fetchJson<{ rows: LaybyRow[] }>(`/api/v2/reports/retail-laybys?page=1&size=30&tab=all${term ? `&q=${encodeURIComponent(term)}` : ""}`);
      return [...found.rows].sort((a, b) => Number(OPEN.has(b.statusKey)) - Number(OPEN.has(a.statusKey)));
    },
  });
}

/** A lay-by as a row: who and what, its LAY number and day, what is left. */
export function LaybyRowButton({ row, chosen, onChoose }: { row: LaybyRow; chosen: boolean; onChoose: () => void }) {
  const paying = row.statusKey === "PAYING";
  // A plain "Paying" says nothing the amount left does not; the due day near or past, ready, done do.
  const tag = paying ? (row.timing === "soon" || row.timing === "overdue" ? row.state : null) : row.state;
  return (
    <button type="button" className="hx-row" aria-current={chosen ? "true" : undefined} onClick={onChoose}>
      <span className="hx-glyph">
        <Archive className="ic" />
      </span>
      <span className="hx-text">
        <span className="hx-t">
          <span className="truncate">
            {row.customer} · {row.what}
          </span>
          {tag ? <span className="hx-tag">{tag}</span> : null}
        </span>
        <span className="hx-s">
          <span className="num">{row.laybyNo}</span>
          {paying && row.dueOn ? ` · by ${byDay(row.dueOn)}` : null}
        </span>
      </span>
      {paying ? (
        <span className="hx-v num">
          <span className="cu-k">Left</span>
          {usd(row.left)}
        </span>
      ) : (
        <span className="hx-v num is-muted">{usd(row.total)}</span>
      )}
    </button>
  );
}

/* ─── A lay-by: the record, taking a payment, paid ───────────────────── */

/**
 * A lay-by in the sale column's place (T4-1): what is on it, the payments by
 * date, Paid and Left, and the one orange key: Take a payment, or Hand it
 * over once it is paid. A payment opens the tray over the column (T4-2);
 * taken, the column says what is left (T4-3).
 */
export function LaybyRecord({ id, onBack }: { id: string; onBack: () => void }) {
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isPosHost } = useTill();
  const view = useQuery({
    queryKey: [...LAYBY_KEY, "one", id],
    queryFn: async () => (await fetchJson<{ data: LaybyView }>(`/api/v2/retail/laybys/${id}`)).data,
  });
  const layby = view.data ?? null;
  // Handed over once it is all paid; while it is paying, the key takes a payment.
  const ready = Boolean(layby && layby.status === "READY" && layby.can.handOver);
  const [paying, setPaying] = React.useState(false);
  const [paid, setPaid] = React.useState<LaybyPaid | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const after = () => {
    void queryClient.invalidateQueries({ queryKey: LAYBY_KEY });
    void queryClient.invalidateQueries({ queryKey: ["retail-current-shift"] });
  };

  const hand = useMutation({
    mutationFn: () =>
      fetchJson<{ data: { laybyNo: string; saleId: string; saleNo: string } }>(`/api/v2/retail/laybys/${id}/hand-over`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: (payload) => {
      after();
      void queryClient.invalidateQueries({ queryKey: ["retail-pos-sales"] });
      printReceipt(`${isPosHost ? "" : "/portal/pos"}/receipt/${payload.data.saleId}`);
      toast({ title: handedOverWords(payload.data), variant: "success" });
      setPaid(null);
    },
    onError: (error) => setProblem(refusalText(error)),
  });
  const handOver = () => {
    if (hand.isPending) return;
    setProblem(null);
    hand.mutate();
  };
  const nextSale = () => router.push(getPosPortalHref("checkout", isPosHost));

  useWindowKeys((event) => {
    if (!layby || paying || !freeKey(event)) return;
    if (paid) {
      if (event.key === "n" || event.key === "N") {
        event.preventDefault();
        nextSale();
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (paid.ready) handOver();
        else nextSale();
      }
      return;
    }
    if (event.key !== "Enter") return;
    if (ready) {
      event.preventDefault();
      handOver();
    } else if (layby.can.pay) {
      event.preventDefault();
      setPaying(true);
    }
  });

  if (view.isLoading) {
    return (
      <div className="bar sale-head" aria-busy="true">
        <span className="skeleton is-title" />
      </div>
    );
  }
  if (!layby) {
    return <LoadFailed icon={Archive} title="That lay-by did not load" error={view.error} onRetry={() => void view.refetch()} />;
  }
  if (paid) {
    return <LaybyPaidView paid={paid} layby={layby} busy={hand.isPending} problem={problem} onNext={nextSale} onHandOver={handOver} />;
  }

  const total = Number(layby.total);
  const left = Number(layby.left);
  const plain = layby.status === "PAYING" && layby.stateLabel === "Paying";
  return (
    <>
      <div className="bar sale-head">
        <button type="button" className="btn btn-icon is-touch when-phone" aria-label="Back to Customers" onClick={onBack}>
          <CaretLeft className="ic" />
        </button>
        <h1>Lay-by</h1>
        <span className="hx-code num">
          {layby.laybyNo}
          {layby.status === "PAYING" ? ` · by ${byDay(layby.dueOn)}` : ""}
        </span>
        <div className="end">
          <span className="customer-pill hx-customer">
            <User className="ic" />
            <span className="truncate">{layby.customer.name}</span>
          </span>
        </div>
      </div>
      <div className="hx-scroll">
        <div className="hx-lines">
          {layby.lines.map((line, index) => (
            <div key={`${line.name}${index}`} className="hx-line">
              <span className="hx-q num">{qty(line.quantity)} ×</span>
              <span className="hx-text">
                <span className="hx-n">{line.name}</span>
                <span className="hx-each num">{usd(Number(line.price))} each</span>
              </span>
              <span className="hx-v num">{usd(Number(line.total))}</span>
            </div>
          ))}
        </div>
        {layby.payments.length ? (
          <div className="cu-pays">
            {layby.payments.map((payment, index) => (
              <div key={`${payment.at}-${index}`} className="cu-pay">
                <span className="num">{dateOf(payment.at)}</span>
                <span className="truncate">
                  {payment.kind === "Paid back" ? `Paid back, ${payment.tender.toLowerCase()}` : payment.tender}
                  {payment.by ? <span className="muted"> · {payment.by}</span> : null}
                </span>
                <span className="num">{usd(Number(payment.amount))}</span>
              </div>
            ))}
          </div>
        ) : null}
        <div className="cu-left">
          <div>
            <div className="cu-left-k">Paid</div>
            <div className="cu-left-v">{usd(Number(layby.paid))}</div>
          </div>
          <div>
            <div className="cu-left-k">{layby.status === "COLLECTED" && layby.saleNo ? `Collected, ${layby.saleNo}` : plain ? "Left" : `Left · ${layby.stateLabel}`}</div>
            <div className="cu-left-v is-to">{usd(left)}</div>
          </div>
        </div>
        <span className="grow" />
      </div>
      {ready || layby.can.pay ? (
        <div className="hx-keys is-one">
          {problem ? <ErrorLine>{problem}</ErrorLine> : null}
          {ready ? (
            <button type="button" className="take-key" disabled={hand.isPending} aria-busy={hand.isPending || undefined} onClick={handOver}>
              <Package className="ic" />
              Hand it over
              <span className="kbd on-primary" aria-hidden="true">
                ↵
              </span>
            </button>
          ) : (
            <button type="button" className="take-key" onClick={() => setPaying(true)}>
              <HandCoins className="ic" />
              Take a payment
              <span className="kbd on-primary" aria-hidden="true">
                ↵
              </span>
            </button>
          )}
        </div>
      ) : (
        <div className="hx-sum cu-sum">
          <span>{count(layby.lines.reduce((sum, line) => sum + line.quantity, 0), "item")}</span>
          <span className="num">{usd(total)}</span>
        </div>
      )}
      {paying ? (
        <LaybyPayTray
          layby={layby}
          onClose={() => setPaying(false)}
          onPaid={(done) => {
            after();
            setPaying(false);
            setPaid(done);
          }}
        />
      ) : null}
    </>
  );
}

/** Up to three round notes under what is left, then all of it: what a payment on a lay-by usually is. */
function payAmounts(left: number) {
  const notes = [5, 10, 20, 50, 100, 200, 500].filter((note) => note < left - 0.004).slice(-3);
  return left > 0 ? [...notes, cents(left)] : notes;
}

/**
 * Lay-by payment (T4-2): the tray as the sale uses it, over the column. The
 * amount from the quick amounts or typed, how they pay, the reference for
 * anything but cash, and Paid after this and Left; Received (↵) takes it.
 */
function LaybyPayTray({ layby, onClose, onPaid }: { layby: LaybyView; onClose: () => void; onPaid: (paid: LaybyPaid) => void }) {
  const { shiftHere, context } = useTill();
  const returnFocus = useReturnFocus();
  const left = Number(layby.left);
  const [amount, setAmount] = React.useState("");
  const [tender, setTender] = React.useState<Tender>(layby.lastTender ?? layby.tenders[0]?.value ?? "CASH");
  const [reference, setReference] = React.useState("");
  const [problem, setProblem] = React.useState<string | null>(null);
  const ref = React.useRef<HTMLInputElement>(null);
  const ids = React.useId();
  const value = AMOUNT.test(amount.trim()) ? Number(amount) : 0;
  const over = value > left + 0.004;
  const label = layby.tenders.find((entry) => entry.value === tender)?.label ?? tender;
  const ecocash = tender === "ECOCASH" ? context?.ecocash : null;
  const pays =
    ecocash?.method === "MERCHANT_CODE" && ecocash.merchantCode
      ? { k: "Merchant code", v: ecocash.merchantCode }
      : ecocash?.method === "PHONE_NUMBER" && ecocash.phone
        ? { k: "Send to", v: ecocash.phone }
        : null;

  const pay = useMutation({
    mutationFn: () =>
      fetchJson<{ data: { laybyNo: string; amount: string; paid: string; left: string; status: string } }>(`/api/v2/retail/laybys/${layby.id}/payments`, {
        method: "POST",
        body: JSON.stringify({ amount: Number(amount).toFixed(2), tender, reference: reference.trim() || null }),
      }),
    onSuccess: (payload) =>
      onPaid({
        laybyNo: payload.data.laybyNo,
        amount: Number(payload.data.amount),
        tender,
        tenderLabel: label,
        paid: Number(payload.data.paid),
        left: Number(payload.data.left),
        ready: payload.data.status === "READY",
      }),
    onError: (error) => setProblem(refusalText(error)),
  });

  const submit = () => {
    if (pay.isPending) return;
    if (!shiftHere && tender === "CASH") return setProblem("Open a shift on this till first: the cash goes into its drawer.");
    if (!AMOUNT.test(amount.trim()) || Number(amount) <= 0) return setProblem("Type the amount, like 13.00.");
    if (Number(amount) > left) return setProblem(`Only ${usd(left)} is left to pay.`);
    setProblem(null);
    pay.mutate();
  };

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && onClose()}>
      <div className="over">
        <DialogPrimitive.Overlay className="scrim" />
        <DialogPrimitive.Content
          className="tray cu-tray"
          aria-describedby={undefined}
          onCloseAutoFocus={returnFocus}
          onKeyDown={(event) => {
            if (!enterHere(event)) return;
            event.preventDefault();
            submit();
          }}
        >
          <DialogPrimitive.Title className="visually-hidden">Lay-by payment, {layby.laybyNo}</DialogPrimitive.Title>
          <div className="tray-top">
            <div className="tray-amount">
              <span className="tray-k">
                Lay-by payment · <span className="num">{layby.laybyNo}</span>
              </span>
              <label className="cu-figure">
                <span>US$</span>
                <input
                  aria-label="Amount"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.00"
                  autoFocus
                  value={amount}
                  aria-invalid={over || undefined}
                  onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))}
                />
              </label>
            </div>
            <button type="button" className="btn btn-icon is-touch" aria-label="Back to the lay-by" title="Back to the lay-by  Esc" onClick={onClose}>
              <X className="ic" />
            </button>
          </div>
          <div className="quick" role="group" aria-label="Quick amounts">
            {payAmounts(left).map((entry) => (
              <button
                key={entry}
                type="button"
                className="btn btn-touch"
                aria-pressed={Math.abs(entry - value) < 0.004}
                aria-label={Math.abs(entry - left) < 0.004 ? `All of it, ${usd(entry)}` : usd(entry)}
                onClick={() => {
                  setAmount(entry.toFixed(2));
                  if (tender !== "CASH") ref.current?.focus();
                }}
              >
                {entry.toFixed(2)}
              </button>
            ))}
          </div>
          <div className="tender-chips" role="radiogroup" aria-label="How they are paying">
            {layby.tenders.map((entry) => (
              <button key={entry.value} type="button" role="radio" className="tender-chip" aria-checked={tender === entry.value} onClick={() => setTender(entry.value)}>
                <TenderMark single tender={entry.value} />
                {entry.label}
              </button>
            ))}
          </div>
          {tender !== "CASH" ? (
            <div className="cu-part">
              <span className="cu-part-g">
                <TenderMark single tender={tender} />
              </span>
              <span className="cu-part-t">{label}</span>
              <span className="cu-part-v num">{usd(value)}</span>
              {pays ? (
                <div className="cu-part-row">
                  <span>{pays.k}</span>
                  <span className="num">{pays.v}</span>
                </div>
              ) : null}
              <div className="field">
                <label htmlFor={`${ids}r`}>
                  Reference{layby.referenceRequired ? null : <span className="opt"> optional</span>}
                </label>
                <input
                  ref={ref}
                  id={`${ids}r`}
                  className="input input-lg num text-left"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                />
              </div>
            </div>
          ) : null}
          <div className="cu-left">
            <div>
              <div className="cu-left-k">Paid after this</div>
              <div className="cu-left-v">{usd(Number(layby.paid) + Math.min(value, left))}</div>
            </div>
            <div>
              <div className="cu-left-k">Left</div>
              <div className="cu-left-v is-to">{usd(Math.max(left - value, 0))}</div>
            </div>
          </div>
          {over ? <ErrorLine>Only {usd(left)} is left to pay.</ErrorLine> : problem ? <ErrorLine>{problem}</ErrorLine> : null}
          <div className="grow" />
          <button type="button" className="take-key" disabled={!value || over || pay.isPending} aria-busy={pay.isPending || undefined} onClick={submit}>
            Received <span className="num">{usd(value)}</span>
            {value && !over ? (
              <span className="kbd on-primary" aria-hidden="true">
                ↵
              </span>
            ) : null}
          </button>
        </DialogPrimitive.Content>
      </div>
    </DialogPrimitive.Root>
  );
}

/** Lay-by paid (T4-3), like Paid: what is left as the largest figure, how far along, the facts, then Next sale. */
function LaybyPaidView({
  paid,
  layby,
  busy,
  problem,
  onNext,
  onHandOver,
}: {
  paid: LaybyPaid;
  layby: LaybyView;
  busy: boolean;
  problem: string | null;
  onNext: () => void;
  onHandOver: () => void;
}) {
  const total = Number(layby.total);
  const share = total > 0 ? Math.min(paid.paid / total, 1) : 1;
  return (
    <>
      <div className="hx-done">
        <div className="paid" role="status" aria-live="polite">
          <span className="paid-mark">
            <Check className="ic" />
          </span>
          <span className="paid-k">{paid.ready ? "Paid in full" : "Left to pay"}</span>
          <span className="paid-v">{usd(paid.ready ? total : paid.left)}</span>
          <span className="paid-z cu-z">{paid.ready ? "Ready to collect" : `by ${byDay(layby.dueOn)}`}</span>
          <span className="cu-bar" role="img" aria-label={`${usd(paid.paid)} of ${usd(total)} paid`}>
            <i style={{ width: `${share * 100}%` }} />
          </span>
        </div>
        <dl className="facts hx-facts">
          <div className="fact">
            <Archive className="ic" />
            <dt>Lay-by, {layby.customer.name}</dt>
            <dd>{paid.laybyNo}</dd>
          </div>
          <div className="fact">
            <TenderMark single tender={paid.tender} />
            <dt>{paid.tenderLabel}</dt>
            <dd>{usd(paid.amount)}</dd>
          </div>
          <div className="fact">
            <HandCoins className="ic" />
            <dt>Paid so far</dt>
            <dd>{usd(paid.paid)}</dd>
          </div>
        </dl>
      </div>
      <span className="grow" />
      <div className={`hx-keys${paid.ready ? "" : " is-one"}`}>
        {problem ? <ErrorLine>{problem}</ErrorLine> : null}
        {paid.ready ? (
          <>
            <button type="button" className="hx-key" onClick={onNext}>
              Next sale
              <span className="kbd" aria-hidden="true">
                N
              </span>
            </button>
            <button type="button" className="take-key" disabled={busy} aria-busy={busy || undefined} onClick={onHandOver}>
              <Package className="ic" />
              Hand it over
              <span className="kbd on-primary" aria-hidden="true">
                ↵
              </span>
            </button>
          </>
        ) : (
          <button type="button" className="take-key" onClick={onNext}>
            Next sale
            <span className="kbd on-primary" aria-hidden="true">
              N
            </span>
          </button>
        )}
      </div>
    </>
  );
}
