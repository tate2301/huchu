"use client";

/**
 * Lay-bys at the till (W-42, FLR-09 over FLR-06's service): put the cart
 * aside for a customer with a deposit, find a lay-by on Customers, take a
 * payment on it, and hand it over once it is paid, printing the hand-over
 * sale's receipt. Every one goes through `/api/v2/retail/laybys` on the till's
 * PIN session: the till's own open shift is the drawer.
 */

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/components/ui/use-toast";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Archive, Check, MagnifyingGlass, Package, UserPlus, X } from "@/lib/icons";
import { newPosCustomer, type PosCustomer } from "@/lib/retail/customers/pos-customer";
import { handedOverWords, paidWords, startedWords } from "@/lib/retail/floor/layby-words";
import { count, dayMonth, usd } from "./format";
import { Empty, ErrorLine, Segmented, TillDialog } from "./parts";
import { printReceipt } from "./pay-tray";
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
  lines: Array<{ name: string; quantity: number; price: string; total: string }>;
  payments: Array<{ at: string; kind: string; tender: string; amount: string; by: string }>;
  lastTender: Tender | null;
  tenders: Array<{ value: Tender; label: string }>;
  referenceRequired: boolean;
  can: { pay: boolean; handOver: boolean; cancel: boolean; changeDate: boolean };
};

/** A row of the Lay-bys list (`GET /api/v2/reports/retail-laybys?page=1&q=`). */
type LaybyRow = { id: string; laybyNo: string; customer: string; what: string; left: number; dueText: string; state: string };

const LAYBY_KEY = ["retail-pos-laybys"] as const;

const cents = (value: number) => Math.round(value * 100) / 100;
const AMOUNT = /^\d{1,9}(\.\d{1,2})?$/;

function refusalText(error: unknown): string {
  if (error instanceof ApiError) {
    const fields = (error.details as { fieldErrors?: Record<string, string> } | undefined)?.fieldErrors;
    const first = fields ? Object.values(fields)[0] : null;
    return first ?? error.message;
  }
  return getApiErrorMessage(error);
}

/* ─── A customer: search, or add with a phone ─────────────────────────── */

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
      <div className="field">
        <span className="label">{label}</span>
        <div className="row is-split">
          <span>
            <span className="ink weight-500">{value.name}</span> <span className="muted num">{value.phone ?? ""}</span>
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
      <div className="field-row">
        <div className="field">
          <label htmlFor={`${ids}p`}>Phone</label>
          <input id={`${ids}p`} className="input input-lg num text-left" inputMode="tel" value={adding.phone} onChange={(event) => setAdding({ ...adding, phone: event.target.value })} />
        </div>
        <div className="field">
          <label htmlFor={`${ids}n`}>Name</label>
          <input id={`${ids}n`} className="input input-lg" value={adding.name} onChange={(event) => setAdding({ ...adding, name: event.target.value })} />
        </div>
        <div className="actions">
          <button type="button" className="btn" onClick={() => setAdding(null)}>
            Back
          </button>
          <button
            type="button"
            className="btn btn-primary"
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
    <div className="field">
      <label htmlFor={`${ids}q`}>{label}</label>
      <label className="input-wrap is-search">
        <MagnifyingGlass className="ic" />
        <input id={`${ids}q`} type="search" className="input-lg" placeholder="Name or phone" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      {term.length >= 2 ? (
        <div className="list is-framed">
          {rows.map((row) => (
            <button key={row.id} type="button" className="row is-split" onClick={() => onChange(row)}>
              <span className="ink">{row.name}</span>
              <span className="muted num">{row.phone ?? ""}</span>
            </button>
          ))}
          <button
            type="button"
            className="row is-split"
            onClick={() => {
              setProblem(null);
              setAdding(/^[+\d\s]+$/.test(term) ? { phone: term, name: "" } : { phone: "", name: term });
            }}
          >
            <span className="ink">
              <UserPlus className="ic" /> Add “{term}” with their phone
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ─── Start one from the cart ────────────────────────────────────────── */

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
      meta={`${count(lines.length, "line")}, ${usd(total)}`}
      foot={
        <>
          <button type="button" className="btn" onClick={onClose}>
            <X className="ic" />
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={start.isPending || form.isLoading} aria-busy={start.isPending || undefined} onClick={submit}>
            <Archive className="ic" />
            Put it aside
          </button>
        </>
      }
    >
      <CustomerPicker value={customer} onChange={setCustomer} />
      <div className="field">
        <span className="label">What is put aside</span>
        <div className="list is-framed">
          {lines.map((item) => (
            <div key={item.catalogItemId} className="row is-split">
              <span>
                <span className="ink">{item.name}</span> <span className="muted">× {item.quantity}</span>
              </span>
              <span className="num">{usd(cents(item.shelfPrice * item.quantity))}</span>
            </div>
          ))}
        </div>
        <span className="help">At today’s shelf price, held until they collect.</span>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor={`${ids}d`}>Deposit today</label>
          <input id={`${ids}d`} className="input input-lg num text-left" inputMode="decimal" value={deposit} placeholder={smallest ? smallest.toFixed(2) : ""} onChange={(event) => setDeposit(event.target.value)} />
          <span className="help">
            At least {percent}%, {usd(smallest)}.
          </span>
        </div>
        <div className="field">
          <span className="label">With</span>
          <Segmented label="With" value={tender} options={tenders.map((entry) => ({ value: entry.value, label: entry.label }))} onChange={setTender} />
        </div>
      </div>
      {tender !== "CASH" && form.data?.referenceRequired ? (
        <div className="field">
          <label htmlFor={`${ids}r`}>Reference</label>
          <input id={`${ids}r`} className="input input-lg num text-left" value={reference} onChange={(event) => setReference(event.target.value)} />
        </div>
      ) : null}
      <div className="field-row">
        <div className="field">
          <label htmlFor={`${ids}w`}>Pay by</label>
          <input id={`${ids}w`} className="input input-lg" type="date" value={dueOn} onChange={(event) => setDue(event.target.value)} />
          <span className="help">{dueOn ? `${dayMonth(`${dueOn}T12:00:00Z`)}, up to ${form.data?.maxDays ?? 90} days away.` : ""}</span>
        </div>
        <label className="check self-end">
          <input type="checkbox" className="switch" checked={remind} onChange={(event) => setRemind(event.target.checked)} />
          <span>Remind on WhatsApp each week</span>
        </label>
      </div>
      {deposit && AMOUNT.test(deposit.trim()) ? (
        <p className="note">
          {usd(Math.max(total - Number(deposit), 0))} left to pay{dueOn ? ` by ${dayMonth(`${dueOn}T12:00:00Z`)}` : ""}.
        </p>
      ) : null}
      {problem ? <ErrorLine>{problem}</ErrorLine> : null}
    </TillDialog>
  );
}

/* ─── Find one, take a payment, hand it over ─────────────────────────── */

/** The Lay-bys search on Customers: by customer or LAY number. */
export function LaybySearch({ query }: { query: string }) {
  const [openId, setOpenId] = React.useState<string | null>(null);
  const term = query.trim();
  const found = useQuery({
    queryKey: [...LAYBY_KEY, term],
    queryFn: () =>
      fetchJson<{ rows: LaybyRow[] }>(`/api/v2/reports/retail-laybys?page=1&size=30&tab=all${term ? `&q=${encodeURIComponent(term)}` : ""}`),
  });
  const rows = found.data?.rows ?? [];
  return (
    <>
      {found.isLoading ? (
        <div className="finding" aria-busy="true">
          <span className="skeleton is-line" />
        </div>
      ) : found.isError ? (
        <Empty icon={Archive} title="Lay-bys did not load">
          {getApiErrorMessage(found.error)}
        </Empty>
      ) : !rows.length ? (
        <Empty icon={Archive} title={term ? `No lay-by matches “${term}”` : "No lay-bys yet"}>
          Start one from the till: put the goods on the sale, then Lay-by.
        </Empty>
      ) : (
        <div className="table-shell">
          <div className="table-scroll">
            <div className="list">
              {rows.map((row) => (
                <button key={row.id} type="button" className="row is-queued" onClick={() => setOpenId(row.id)}>
                  <span className="code num text-left">{row.laybyNo}</span>
                  <span className="truncate">
                    <span className="ink">{row.customer}</span> <span className="muted">{row.what}</span>
                  </span>
                  <span className="status truncate">{row.state}</span>
                  <span className="num ink">{usd(row.left)}</span>
                  <span className="muted">{row.dueText}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {openId ? <LaybyPanel id={openId} onClose={() => setOpenId(null)} /> : null}
    </>
  );
}

function LaybyPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isPosHost, shiftHere } = useTill();
  const view = useQuery({
    queryKey: [...LAYBY_KEY, "one", id],
    queryFn: async () => (await fetchJson<{ data: LaybyView }>(`/api/v2/retail/laybys/${id}`)).data,
  });
  const layby = view.data ?? null;
  const [amount, setAmount] = React.useState("");
  const [tender, setTender] = React.useState<Tender | null>(null);
  const [reference, setReference] = React.useState("");
  const [problem, setProblem] = React.useState<string | null>(null);
  const ids = React.useId();
  const how = tender ?? layby?.lastTender ?? layby?.tenders[0]?.value ?? "CASH";
  const after = () => {
    void queryClient.invalidateQueries({ queryKey: LAYBY_KEY });
    void queryClient.invalidateQueries({ queryKey: ["retail-current-shift"] });
  };

  const pay = useMutation({
    mutationFn: () =>
      fetchJson<{ data: { laybyNo: string; amount: string; paid: string; left: string; status: string } }>(`/api/v2/retail/laybys/${id}/payments`, {
        method: "POST",
        body: JSON.stringify({ amount: Number(amount).toFixed(2), tender: how, reference: reference.trim() || null }),
      }),
    onSuccess: (payload) => {
      after();
      setAmount("");
      setReference("");
      toast({ title: paidWords(payload.data), variant: "success" });
    },
    onError: (error) => setProblem(refusalText(error)),
  });

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
      onClose();
    },
    onError: (error) => setProblem(refusalText(error)),
  });

  const left = Number(layby?.left ?? 0);
  return (
    <TillDialog
      open
      large
      compact
      onOpenChange={(open) => !open && onClose()}
      title={layby ? `${layby.laybyNo} · ${layby.customer.name}` : "Lay-by"}
      meta={layby ? layby.stateLabel : undefined}
      foot={
        <>
          <button type="button" className="btn" onClick={onClose}>
            <X className="ic" />
            Close
          </button>
          {layby?.can.handOver ? (
            <button type="button" className="btn btn-primary" disabled={hand.isPending} aria-busy={hand.isPending || undefined} onClick={() => hand.mutate()}>
              <Package className="ic" />
              Hand it over
            </button>
          ) : layby?.can.pay ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={pay.isPending}
              aria-busy={pay.isPending || undefined}
              onClick={() => {
                if (!shiftHere && how === "CASH") return setProblem("Open a shift on this till first: the cash goes into its drawer.");
                if (!AMOUNT.test(amount.trim()) || Number(amount) <= 0) return setProblem("Type the amount, like 13.00.");
                if (Number(amount) > left) return setProblem(`Only ${usd(left)} is left to pay.`);
                setProblem(null);
                pay.mutate();
              }}
            >
              <Check className="ic" />
              Take {AMOUNT.test(amount.trim()) ? usd(Number(amount)) : "the payment"}
            </button>
          ) : null}
        </>
      }
    >
      {view.isLoading || !layby ? (
        <div className="finding" aria-busy="true">
          <span className="skeleton is-line" />
        </div>
      ) : (
        <>
          <dl className="attrs">
            <dt>What</dt>
            <dd>{layby.what}</dd>
            <dt>Total</dt>
            <dd className="num text-left">{usd(Number(layby.total))}</dd>
            <dt>Paid</dt>
            <dd className="num text-left">{usd(Number(layby.paid))}</dd>
            <dt>Left</dt>
            <dd className="num text-left ink weight-600">{usd(left)}</dd>
            <dt>Pay by</dt>
            <dd>{layby.dueOnText}</dd>
          </dl>
          {layby.payments.length ? (
            <div className="list is-framed">
              {layby.payments.map((payment, index) => (
                <div key={`${payment.at}-${index}`} className="row is-split">
                  <span>
                    {payment.kind} · {payment.tender} <span className="muted">{payment.by}</span>
                  </span>
                  <span className="num">{usd(Number(payment.amount))}</span>
                </div>
              ))}
            </div>
          ) : null}
          {layby.can.pay && !layby.can.handOver ? (
            <div className="field-row">
              <div className="field">
                <label htmlFor={`${ids}a`}>Amount</label>
                <input id={`${ids}a`} className="input input-lg num text-left" inputMode="decimal" value={amount} placeholder={left.toFixed(2)} onChange={(event) => setAmount(event.target.value)} />
              </div>
              <div className="field">
                <span className="label">With</span>
                <Segmented label="With" value={how} options={layby.tenders.map((entry) => ({ value: entry.value, label: entry.label }))} onChange={setTender} />
              </div>
              {how !== "CASH" && layby.referenceRequired ? (
                <div className="field">
                  <label htmlFor={`${ids}r`}>Reference</label>
                  <input id={`${ids}r`} className="input input-lg num text-left" value={reference} onChange={(event) => setReference(event.target.value)} />
                </div>
              ) : null}
            </div>
          ) : null}
          {layby.can.handOver ? <p className="note">Paid in full. Hand the goods over and the receipt prints.</p> : null}
        </>
      )}
      {problem ? <ErrorLine>{problem}</ErrorLine> : null}
    </TillDialog>
  );
}
