"use client";

/**
 * People at the till: Customers and a customer, with their lay-bys (T4-1);
 * and what sits under the person at the top of the rail: my activity, till
 * settings (this till, my PIN, unpair) and help.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { useOfflineRuntime } from "@/components/offline/offline-runtime";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  Archive,
  ArrowsCounterClockwise,
  CaretLeft,
  CashRegister,
  Check,
  IdentificationCard,
  Key,
  LinkBreak,
  ListChecks,
  MagnifyingGlass,
  Medal,
  Money,
  Printer,
  Prohibit,
  Receipt,
  ShoppingCart,
  Star,
  Tag,
  CircleUserRound,
  Users,
  Vault,
  X,
} from "@/lib/icons";
import { listOfflineRetailOperations } from "@/lib/retail/offline-runtime";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import { getPosPortalHref } from "@/lib/retail/pos-host";
import { SEND_BY_WORDS, type ReceiptWire } from "@/lib/retail/receipt-words";
import { wasApproved, type TillActivityEntry, type TillActivityKind } from "@/lib/retail/till-activity-shared";
import { TILL_PIN_LOCKED } from "@/lib/retail/till-pin";
import { hoursWords, percentWords, voidPinSentence } from "@/lib/retail/till-rule-words";
import { setDevicePrefs, useDevicePrefs } from "./device-prefs";
import { count, dayMonth, firstName, hhmm, TENDER_LABEL, usd, whole } from "./format";
import type { PosCustomer, TillRulesForTill } from "./types";
import { Avatar, Empty, ErrorLine, LoadFailed, PinDots, Segmented, TillDialog, useWindowKeys } from "./parts";
import { printReceipt } from "./pay-tray";
import { KeyList } from "./keys";
import { customerLine, freeKey, LaybyRecord, LaybyRowButton, useLaybyRows, type LaybyRow } from "./layby";
import { useTillLock } from "./lock";
import { cue } from "./sound";
import { useTill } from "./state";

/* ─── Customers ──────────────────────────────────────────────────────── */

type Show = "all" | "laybys" | "customers";
const SHOW: Array<{ value: Show; label: string }> = [
  { value: "all", label: "All" },
  { value: "laybys", label: "Lay-bys" },
  { value: "customers", label: "Customers" },
];
type Chosen = { kind: "layby" | "customer"; id: string; at: number };

/** "today", else "on 3 October". */
const onDay = (at: string) => (dayMonth(at) === dayMonth(new Date()) ? "today" : `on ${dayMonth(at)}`);

/**
 * Customers (T4-1): one search finds lay-bys, by customer or LAY number, and
 * customers, by name, phone or card. The rows on the left; the chosen lay-by
 * or customer in the sale column's place.
 */
export function CustomersScreen() {
  const [typed, setTyped] = React.useState("");
  const [term, setTerm] = React.useState("");
  const [show, setShow] = React.useState<Show>("all");
  const [chosen, setChosen] = React.useState<Chosen | null>(null);
  const [phoneRecord, setPhoneRecord] = React.useState(false);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setTerm(typed.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [typed]);

  const laybys = useLaybyRows(term, show !== "customers");
  const people = useQuery({
    queryKey: ["retail-pos-customer-search", term, 30],
    enabled: term.length >= 2 && show !== "laybys",
    queryFn: () => fetchJson<{ data: PosCustomer[] }>(`/api/v2/retail/pos/customers?q=${encodeURIComponent(term)}&limit=30`),
  });
  const laybyRows = show === "customers" ? [] : (laybys.data ?? []);
  const customerRows = show === "laybys" || term.length < 2 ? [] : (people.data?.data ?? []);
  const first: Chosen | null = laybyRows[0]
    ? { kind: "layby", id: laybyRows[0].id, at: 0 }
    : customerRows[0]
      ? { kind: "customer", id: customerRows[0].id, at: 0 }
      : null;
  const shown =
    chosen && (chosen.kind === "layby" ? laybyRows.some((row) => row.id === chosen.id) : customerRows.some((row) => row.id === chosen.id)) ? chosen : first;
  const customer = shown?.kind === "customer" ? (customerRows.find((row) => row.id === shown.id) ?? null) : null;
  const choose = (kind: Chosen["kind"], id: string) => {
    setChosen((now) => ({ kind, id, at: (now?.at ?? 0) + 1 }));
    setPhoneRecord(true);
  };

  const loading = (show !== "customers" && laybys.isPending) || (show !== "laybys" && term.length >= 2 && people.isPending);
  const failed = show !== "customers" && laybys.isError ? laybys : show !== "laybys" && people.isError ? people : null;
  const both = laybyRows.length > 0 && customerRows.length > 0;
  const sub = [laybyRows.length ? count(laybyRows.length, "lay-by") : null, customerRows.length ? count(customerRows.length, "customer") : null].filter(Boolean).join(" · ");

  return (
    <div className={`bench hx cu${phoneRecord ? " is-sale" : ""}`}>
      <main className="main hx-main" aria-label="Customers">
        <div className="hx-head">
          <h1>Customers</h1>
          {!loading && sub ? <span className="hx-sub">{sub}</span> : null}
        </div>
        <label className="input-wrap cu-find">
          <MagnifyingGlass className="ic" />
          <input
            type="search"
            aria-label="Find a customer or a lay-by"
            placeholder="Name, phone, card or LAY number"
            autoComplete="off"
            autoFocus
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
        </label>
        <div className="hx-pills is-quiet" role="radiogroup" aria-label="Show">
          {SHOW.map((option) => (
            <button key={option.value} type="button" role="radio" className="hx-pill is-quiet" aria-checked={show === option.value} onClick={() => setShow(option.value)}>
              {option.label}
            </button>
          ))}
        </div>
        {loading ? (
          <div className="hx-list" aria-busy="true">
            {[0, 1, 2].map((index) => (
              <span key={index} className="skeleton hx-skeleton" />
            ))}
          </div>
        ) : failed ? (
          <LoadFailed icon={Users} title={failed === laybys ? "Lay-bys did not load" : "Customers did not load"} error={failed.error} onRetry={() => void failed.refetch()} />
        ) : !laybyRows.length && !customerRows.length ? (
          <Empty
            icon={show === "laybys" ? Archive : Users}
            title={term.length >= 2 ? `Nothing matches “${term}”` : show === "laybys" ? "No lay-bys yet" : "Find a customer"}
          />
        ) : (
          <div className="hx-list cu-list">
            {laybyRows.length ? (
              <section aria-label="Lay-bys">
                {both || show === "all" ? <h2 className="cu-label">Lay-bys</h2> : null}
                {laybyRows.map((row: LaybyRow) => (
                  <div key={row.id} className="hx-item">
                    <LaybyRowButton row={row} chosen={shown?.kind === "layby" && shown.id === row.id} onChoose={() => choose("layby", row.id)} />
                  </div>
                ))}
              </section>
            ) : null}
            {customerRows.length ? (
              <section aria-label="Customers">
                {both || show === "all" ? <h2 className="cu-label">Customers</h2> : null}
                {customerRows.map((row) => (
                  <div key={row.id} className="hx-item">
                    <button type="button" className="hx-row" aria-current={shown?.kind === "customer" && shown.id === row.id ? "true" : undefined} onClick={() => choose("customer", row.id)}>
                      <span className="hx-glyph">
                        <CircleUserRound className="ic" />
                      </span>
                      <span className="hx-text">
                        <span className="hx-t">
                          <span className="truncate">{row.name}</span>
                          {row.tier ? <span className="hx-tag">{row.tier}</span> : null}
                        </span>
                        <span className="hx-s num">{customerLine(row) || "No phone"}</span>
                      </span>
                      <span />
                    </button>
                  </div>
                ))}
              </section>
            ) : null}
          </div>
        )}
      </main>
      <aside className="bench-side hx-side" aria-label={customer ? customer.name : shown ? "The lay-by" : "Customer"}>
        {shown?.kind === "layby" ? (
          <LaybyRecord key={`${shown.id}:${shown.at}`} id={shown.id} onBack={() => setPhoneRecord(false)} />
        ) : customer ? (
          <CustomerRecord
            key={customer.id}
            customer={customer}
            laybys={(laybys.data ?? []).filter((row) => row.customerId === customer.id)}
            onLayby={(id) => {
              setShow("all");
              choose("layby", id);
            }}
            onBack={() => setPhoneRecord(false)}
          />
        ) : null}
      </aside>
    </div>
  );
}

/** A customer in the sale column's place: who they are, their points and last sale, their lay-bys, and Start a sale. */
function CustomerRecord({
  customer,
  laybys,
  onLayby,
  onBack,
}: {
  customer: PosCustomer;
  laybys: LaybyRow[];
  onLayby: (id: string) => void;
  onBack: () => void;
}) {
  const router = useRouter();
  const { selectCustomer, isPosHost } = useTill();
  const start = () => {
    selectCustomer(customer);
    router.push(getPosPortalHref("checkout", isPosHost));
  };
  useWindowKeys((event) => {
    if (event.key !== "Enter" || !freeKey(event)) return;
    event.preventDefault();
    start();
  });

  return (
    <>
      <div className="bar sale-head">
        <button type="button" className="btn btn-icon is-touch when-phone" aria-label="Back to Customers" onClick={onBack}>
          <CaretLeft className="ic" />
        </button>
        <h1>Customer</h1>
        {customer.code ? <span className="hx-code num">{customer.code}</span> : null}
      </div>
      <div className="hx-scroll">
        <div className="cu-who">
          <Avatar name={customer.name} size={40} />
          <div>
            <b>{customer.name}</b>
            {customer.phone ? <span className="num text-left">{customer.phone}</span> : null}
          </div>
        </div>
        <dl className="facts hx-facts">
          <div className="fact">
            <Star className="ic" />
            <dt>{whole(customer.points)} points</dt>
            <dd>{usd(customer.worth)}</dd>
          </div>
          {customer.tier ? (
            <div className="fact">
              <Medal className="ic" />
              <dt>{customer.tier}</dt>
              <dd />
            </div>
          ) : null}
          {customer.cardNo ? (
            <div className="fact">
              <IdentificationCard className="ic" />
              <dt>Card</dt>
              <dd>{customer.cardNo}</dd>
            </div>
          ) : null}
          <div className="fact">
            <Receipt className="ic" />
            <dt>{customer.lastSale ? `Last sale, ${usd(customer.lastSale.total)} ${onDay(customer.lastSale.at)}` : "No sales yet"}</dt>
            <dd>{customer.lastSale?.saleNo ?? ""}</dd>
          </div>
        </dl>
        {laybys.length ? (
          <dl className="facts hx-facts">
            {laybys.map((row) => (
              <button key={row.id} type="button" className="fact is-link" onClick={() => onLayby(row.id)}>
                <Archive className="ic" />
                <dt className="truncate">
                  {row.laybyNo}, {row.what}
                </dt>
                <dd>{row.statusKey === "PAYING" ? `${usd(row.left)} left` : row.state}</dd>
              </button>
            ))}
          </dl>
        ) : null}
        <span className="grow" />
      </div>
      <div className="hx-keys is-one">
        <button type="button" className="take-key" onClick={start}>
          <ShoppingCart className="ic" />
          Start a sale for {firstName(customer.name)}
          <span className="kbd on-primary" aria-hidden="true">
            ↵
          </span>
        </button>
      </div>
    </>
  );
}

/* ─── My activity ────────────────────────────────────────────────────── */

const KIND_ICON: Record<TillActivityKind, React.ComponentType<{ className?: string }>> = {
  sale: Money,
  refund: ArrowsCounterClockwise,
  void: Prohibit,
  override: Tag,
  cash: Vault,
  shift: CashRegister,
};

type ActivityFilter = "all" | "approved" | "cash";

const FILTERS: Array<{ id: ActivityFilter; label: string; keeps: (entry: TillActivityEntry) => boolean }> = [
  { id: "all", label: "All", keeps: () => true },
  // Refunds, voids and discounts a manager let through with their PIN.
  { id: "approved", label: "Approved", keeps: wasApproved },
  { id: "cash", label: "Cash moved", keeps: (entry) => entry.kind === "cash" },
];

/** Money in a sentence: no sign, the verb says which way it went. */
function Amount({ value }: { value: number | string }) {
  return <b className="nowrap num">{usd(Math.abs(Number(value)))}</b>;
}

/** "Cash level too high" reads as "cash level too high" mid-sentence. */
const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

const CASH_VERB: Record<NonNullable<TillActivityEntry["cashType"]>, [string, string]> = {
  DROP_TO_SAFE: ["moved", " to the safe"],
  FLOAT_TOP_UP: ["added", " to the float"],
  PAYOUT: ["paid out", ""],
  TAKEN_IN: ["took in", ""],
};

/** Each comma-led part of a sentence, skipped when it has nothing to say. */
function Then({ children }: { children: React.ReactNode }) {
  return children ? <>, {children}</> : null;
}

/** The manager who let it through, after the sentence: ". Farai Mutasa approved". */
function Approved({ by }: { by: string | null }) {
  return by ? (
    <>
      . <b>{by}</b> approved
    </>
  ) : null;
}

/** One event as the board writes it: who did what, with the money in bold, and who approved it. */
function sentence(entry: TillActivityEntry, me: string | null | undefined, history: string): React.ReactNode {
  return (
    <>
      {what(entry, me, history)}
      <Approved by={entry.approvedBy} />
    </>
  );
}

function what(entry: TillActivityEntry, me: string | null | undefined, history: string): React.ReactNode {
  const who = !entry.actor || entry.actor === me ? "You" : entry.actor;
  const money = entry.amount === null ? null : <Amount value={entry.amount} />;
  const paidIn = entry.tendered ? `paid in ${entry.tendered}` : null;

  switch (entry.kind) {
    case "cash": {
      const [verb, where] = entry.cashType ? CASH_VERB[entry.cashType] : ["moved", ""];
      const why = [entry.reasonLabel ? lower(entry.reasonLabel) : null, entry.reason].filter(Boolean).join(", ");
      return (
        <>
          {who} {verb} {money ?? "cash"}
          {where}
          <Then>{why}</Then>
        </>
      );
    }
    case "shift": {
      const shift = <span className="num">{entry.shiftNo}</span>;
      const till = entry.registerName ? ` on ${entry.registerName}` : "";
      if (entry.shiftEvent === "open") {
        return (
          <>
            {who} opened {shift}
            {till}
            {money ? <> with {money}</> : null}
          </>
        );
      }
      const variance = Number(entry.variance ?? 0);
      return (
        <>
          {who} closed {shift}
          {till}
          {money ? <> with {money} counted</> : null}
          <Then>
            {entry.variance === null || Math.abs(variance) < 0.005 ? (
              "the drawer agreed"
            ) : (
              <>
                <Amount value={variance} /> {variance < 0 ? "short" : "over"}
              </>
            )}
          </Then>
        </>
      );
    }
    case "refund":
      return entry.sale ? (
        <>
          {who} refunded {money} of {entry.sale.customerName ? `${entry.sale.customerName}’s` : "the"} <Amount value={entry.sale.total} /> on{" "}
          <Link className="link num" href={`${history}/${entry.sale.id}`}>
            {entry.sale.saleNo}
          </Link>
          <Then>{paidIn}</Then>
          <Then>{entry.reason}</Then>
        </>
      ) : (
        <>
          {who} refunded {money} on <span className="num">{entry.saleNo}</span>
          <Then>{paidIn}</Then>
          <Then>{entry.reason}</Then>
        </>
      );
    case "void":
      return (
        <>
          {who} voided <span className="num">{entry.sale?.saleNo ?? entry.saleNo}</span>, {entry.sale?.customerName || entry.customerName || "Walk-in"}
          <Then>{money}</Then>
          <Then>{paidIn}</Then>
          <Then>{entry.reason}</Then>
        </>
      );
    case "override":
      return (
        <>
          {entry.discounts.length
            ? entry.discounts.map((line, index) => (
                <React.Fragment key={`${line.itemName}${index}`}>
                  {index ? " and " : ""}
                  {usd(Math.abs(Number(line.amount)))} off {line.itemName}
                </React.Fragment>
              ))
            : "A price changed"}{" "}
          on {entry.sale?.customerName || "Walk-in"}, <span className="num">{entry.sale?.saleNo ?? entry.saleNo}</span>
          {entry.sale ? (
            <>
              , which came to <Amount value={entry.sale.total} />
            </>
          ) : null}
          <Then>{entry.reason}</Then>
        </>
      );
    case "sale":
      return (
        <>
          {who} sold <span className="num">{entry.saleNo}</span> to {entry.customerName || "Walk-in"} for {money}
          <Then>{paidIn}</Then>
        </>
      );
  }
}

export function ActivityScreen() {
  const { data: session } = useSession();
  const { isPosHost } = useTill();
  const history = getPosPortalHref("history", isPosHost);
  const [filter, setFilter] = React.useState<ActivityFilter>("all");
  const query = useQuery({
    queryKey: ["retail-till-activity"],
    queryFn: () => fetchJson<{ data: { entries: TillActivityEntry[] } }>("/api/v2/retail/pos/activity"),
  });
  const entries = query.data?.data.entries ?? [];
  const keeps = (FILTERS.find((entry) => entry.id === filter) ?? FILTERS[0]).keeps;
  const shown = entries.filter(keeps);
  const days = new Map<string, TillActivityEntry[]>();
  for (const entry of shown) {
    const day = dayMonth(entry.at);
    days.set(day, [...(days.get(day) ?? []), entry]);
  }
  const today = dayMonth(new Date());

  return (
    <div className="main is-scroll">
      <div className="bar">
        <h1>My activity</h1>
        <div className="end">
          <Segmented
            label="Kind"
            value={filter}
            options={FILTERS.map((entry) => ({
              value: entry.id,
              label: (
                <>
                  {entry.label} <span className="n">{entries.filter(entry.keeps).length}</span>
                </>
              ),
            }))}
            onChange={setFilter}
          />
        </div>
      </div>
      {query.isLoading ? (
        <div className="finding" aria-busy="true">
          <span className="skeleton is-line" />
        </div>
      ) : query.isError ? (
        <LoadFailed icon={ListChecks} title="Your activity did not load" error={query.error} onRetry={() => void query.refetch()} />
      ) : !shown.length ? (
        <Empty icon={ListChecks} title="Nothing here yet">
          What you do on the till in the last seven days shows here, newest first.
        </Empty>
      ) : (
        <div className="feed lead-16">
          {[...days.entries()].map(([day, list]) => (
            <React.Fragment key={day}>
              <div className="feed-day">{day === today ? "Today" : day}</div>
              {list.map((entry, index) => {
                const Icon = KIND_ICON[entry.kind];
                return (
                  <div key={entry.id} className={`ev${index === list.length - 1 ? " end" : ""}`}>
                    <span className={`ev-dot${entry.kind === "sale" ? " is-money" : ""}`}>
                      <Icon className="ic" />
                    </span>
                    <div className="ev-text">{sentence(entry, session?.user?.name, history)}</div>
                    <time>{hhmm(entry.at)}</time>
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Till settings ──────────────────────────────────────────────────── */

/** `pos/till-settings`, the parts this screen reads: the shelf's prices, the till rules as they bind this person, the receipt. */
type TillSettings = {
  money: { priceListName: string | null; taxInclusive: boolean | null };
  rules: TillRulesForTill & { needsApproval: boolean };
  receipt: ReceiptWire;
};

/** What a cashier is asked for on a discount or a refund, in the till rules' terms. */
function approvalWords(rules: TillSettings["rules"]) {
  if (!rules.needsApproval) return "Your reason";
  return `Your reason, and a manager’s PIN over ${percentWords(rules.maxCashierDiscountPercent)} off or a ${rules.currency}${rules.refundPinOver} refund`;
}

/** "Card, EcoCash and InnBucks". */
function listWords(words: string[]) {
  return words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}` : (words[0] ?? "");
}

/** What this device does for whoever is selling on it; kept on the device, not in the back office. */
function ThisDevice() {
  const prefs = useDevicePrefs();
  return (
    <div className="form-sec">
      <header>
        <h2>On this device</h2>
        <p>Kept on this till for whoever sells on it.</p>
      </header>
      <div className="body">
        <DeviceSwitch
          label="Sounds"
          help="A tick for each product, a low note for a code the till does not know, and two notes when the money is in."
          on={prefs.sounds}
          onChange={(sounds) => {
            setDevicePrefs({ sounds });
            if (sounds) cue("added");
          }}
        />
        <DeviceSwitch
          label="Dim screen"
          help="Dark grounds and light type, for a night shift or a bar with the lights down."
          on={prefs.dim}
          onChange={(dim) => setDevicePrefs({ dim })}
        />
        <DeviceSwitch
          label="Larger text"
          help="Everything a step larger, for reading the till from further away."
          on={prefs.large}
          onChange={(large) => setDevicePrefs({ large })}
        />
      </div>
    </div>
  );
}

function DeviceSwitch({ label, help, on, onChange }: { label: string; help: string; on: boolean; onChange: (on: boolean) => void }) {
  const id = React.useId();
  return (
    <div className="field">
      <label className="check">
        <input
          type="checkbox"
          role="switch"
          className="switch"
          aria-describedby={id}
          checked={on}
          onChange={(event) => onChange(event.target.checked)}
        />
        {label}
      </label>
      <span id={id} className="help">
        {help}
      </span>
    </div>
  );
}

export function SettingsScreen() {
  const { data: session } = useSession();
  const { context, isPosHost, shiftHere, pendingOfflineSales } = useTill();
  const { syncNow, tenantKey } = useOfflineRuntime();
  const { pinStatus, refreshPinStatus } = useTillLock();
  const [changing, setChanging] = React.useState(false);
  const [unpairing, setUnpairing] = React.useState(false);
  const canUnpair = canRetailRoleDo(session?.user?.role, "retail.tills", "update");
  const settings = useQuery({
    queryKey: ["retail-till-settings"],
    queryFn: async () => (await fetchJson<{ data: TillSettings }>("/api/v2/retail/pos/till-settings")).data,
  });
  const unpair = useMutation({
    mutationFn: async () => {
      // Once it lets go, this device can no longer send what it saved: it sends first.
      if (pendingOfflineSales > 0 && tenantKey) {
        await syncNow({ force: true });
        const left = (await listOfflineRetailOperations(tenantKey)).length;
        if (left > 0) {
          throw new Error(
            `${count(left, "sale is", "sales are")} still saved on this till. Connect it so ${left === 1 ? "it goes" : "they go"}, then unpair.`,
          );
        }
      }
      return fetchJson("/api/v2/retail/devices/unpair", { method: "POST" });
    },
    onSuccess: () => void signOut({ redirect: true, callbackUrl: isPosHost ? "/pair" : "/portal/pos/pair" }),
  });
  React.useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#pin") setChanging(true);
  }, []);

  const rules = settings.data?.rules ?? null;
  const receipt = settings.data?.receipt ?? null;
  const references = rules ? listWords(rules.requiredReferenceTenders.map((tender) => TENDER_LABEL[tender] ?? tender)) : "";
  const sample = `${isPosHost ? "" : "/portal/pos"}/receipt/sample`;
  const money = settings.data?.money ?? null;

  return (
    <div className="main is-scroll">
      <div className="bar">
        <h1>Till settings</h1>
      </div>
      <div className="page is-roomy">
        <div className="form-sec">
          <header>
            <h2>This till</h2>
            <p>A manager changes these in the back office.</p>
          </header>
          <div className="body">
            <dl className="attrs is-wider">
              <dt>Till</dt>
              <dd>
                {context?.till.name}, {context?.site.name}
              </dd>
              <dt>Device</dt>
              <dd>
                {context?.device.label}, paired {dayMonth(context?.device.pairedAt)}
                {context?.device.pairedBy ? ` by ${context.device.pairedBy}` : ""}
              </dd>
              {money ? (
                <>
                  <dt>Prices</dt>
                  <dd>
                    {money.taxInclusive === null ? "No price list yet" : money.taxInclusive ? "Include VAT" : "VAT added at the till"}
                    {money.priceListName ? `; ${money.priceListName}` : ""}
                  </dd>
                </>
              ) : null}
              {rules ? (
                <>
                  <dt>Discounts and refunds</dt>
                  <dd>{approvalWords(rules)}</dd>
                  <dt>Voids</dt>
                  <dd>{rules.needsApproval && rules.voidPin !== "NEVER" ? `Your reason. ${voidPinSentence(rules.voidPin)}` : "Your reason"}</dd>
                  <dt>References</dt>
                  <dd>{references ? `${references}, ${rules.minReferenceLength} characters or more` : "Not asked for"}</dd>
                  <dt>Cash in the drawer</dt>
                  <dd className="num text-left">
                    To the safe above {rules.currency}
                    {Number(rules.cashDropPromptOver).toFixed(2)}
                  </dd>
                  <dt>No connection</dt>
                  <dd>Sells for up to {hoursWords(rules.offlineHours)}</dd>
                </>
              ) : null}
            </dl>
            {settings.isError ? <ErrorLine>{getApiErrorMessage(settings.error)}</ErrorLine> : null}
          </div>
        </div>
        <hr className="divider" />
        <div className="form-sec">
          <header>
            <h2>Receipt printer</h2>
            {receipt ? (
              <p>
                {receipt.copies === 1 ? "One copy" : `${receipt.copies} copies`} a sale
                {receipt.alsoSendBy === "NOTHING" ? "." : `, also sent by ${SEND_BY_WORDS[receipt.alsoSendBy].toLowerCase()}.`}
              </p>
            ) : null}
          </header>
          <div className="body">
            <div>
              <button type="button" className="btn" onClick={() => printReceipt(sample)}>
                <Printer className="ic" />
                Print a test receipt
              </button>
            </div>
          </div>
        </div>
        <hr className="divider" />
        <ThisDevice />
        <hr className="divider" />
        <div className="form-sec" id="pin">
          <header>
            <h2>My PIN</h2>
            <p>
              {!pinStatus.hasPin
                ? NO_PIN_YET
                : pinStatus.locked
                  ? TILL_PIN_LOCKED
                  : `${pinStatus.lastUnlockedAt ? `Last used on ${dayMonth(pinStatus.lastUnlockedAt)}. ` : ""}Changing it needs the one you have.`}
            </p>
          </header>
          {pinStatus.hasPin && !pinStatus.locked ? (
            <div className="body">
              <div>
                <button type="button" className="btn" onClick={() => setChanging(true)}>
                  <Key className="ic" />
                  Change my PIN
                </button>
              </div>
            </div>
          ) : null}
        </div>
        {canUnpair ? (
          <>
            <hr className="divider" />
            <div className="form-sec">
              <header>
                <h2>Unpair this device</h2>
                <p>It stops being {context?.till.name} at once. Close the shift first; sales saved on it are sent before it lets go.</p>
              </header>
              <div className="body">
                <div>
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={Boolean(shiftHere)}
                    aria-describedby={shiftHere ? "unpair-blocked" : undefined}
                    onClick={() => setUnpairing(true)}
                  >
                    <LinkBreak className="ic" />
                    Unpair from {context?.till.name}
                  </button>
                </div>
                {shiftHere ? (
                  <p className="help" id="unpair-blocked">
                    Shift <span className="num">{shiftHere.shiftNo}</span> is open on it.
                  </p>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </div>
      {changing ? (
        <ChangePinDialog
          onClose={() => {
            setChanging(false);
            refreshPinStatus();
          }}
        />
      ) : null}
      <TillDialog
        open={unpairing}
        onOpenChange={setUnpairing}
        title={`Unpair ${context?.till.name ?? "this till"}?`}
        description="This device stops being a till at once. Selling on it again needs a new code from the back office."
        foot={
          <>
            <button type="button" className="btn" onClick={() => setUnpairing(false)}>
              <X className="ic" />
              Keep it paired
            </button>
            <button type="button" className="btn btn-danger" disabled={unpair.isPending} aria-busy={unpair.isPending || undefined} onClick={() => unpair.mutate()}>
              <LinkBreak className="ic" />
              Unpair {context?.till.name ?? "this till"}
            </button>
          </>
        }
      >
        {unpair.isError ? <ErrorLine>{getApiErrorMessage(unpair.error)}</ErrorLine> : null}
      </TillDialog>
    </div>
  );
}

/** What the till says to someone with no till PIN: PINs are sent from People (ADM-03). */
const NO_PIN_YET = "You have no till PIN yet. Ask a manager to send you one.";

type PinField = "currentPin" | "newPin" | "again";

/** Change my PIN (ADM-03): the one you have, the new one twice → `POST pos/pin/change`. */
function ChangePinDialog({ onClose }: { onClose: () => void }) {
  const { data: session } = useSession();
  const ids = React.useId();
  const [values, setValues] = React.useState<Record<PinField, string>>({ currentPin: "", newPin: "", again: "" });
  const [problem, setProblem] = React.useState<string | null>(null);
  const save = useMutation({
    mutationFn: () =>
      fetchJson("/api/v2/retail/pos/pin/change", {
        method: "POST",
        body: JSON.stringify({ currentPin: values.currentPin, newPin: values.newPin }),
      }),
    onSuccess: onClose,
    onError: (error) => {
      const fieldErrors =
        error instanceof ApiError ? (error.details as { fieldErrors?: Partial<Record<PinField, string>> } | undefined)?.fieldErrors : undefined;
      setProblem(fieldErrors?.currentPin ?? fieldErrors?.newPin ?? getApiErrorMessage(error));
      setValues((current) => ({ ...current, currentPin: "" }));
    },
  });
  const set = (field: PinField) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const digits = event.target.value.replace(/\D/g, "").slice(0, 4);
    setValues((current) => ({ ...current, [field]: digits }));
  };

  return (
    <TillDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Change my PIN"
      description={`Four digits${session?.user?.name ? ` for ${session.user.name}` : ""}, the same at every till here.`}
      foot={
        <>
          <button type="button" className="btn" onClick={onClose}>
            <X className="ic" />
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={save.isPending}
            aria-busy={save.isPending || undefined}
            onClick={() => {
              if (values.currentPin.length !== 4) return setProblem("Type the PIN you have now.");
              if (values.newPin.length !== 4) return setProblem("A PIN is four digits.");
              if (values.newPin !== values.again) return setProblem("Those two do not match. Try again.");
              setProblem(null);
              save.mutate();
            }}
          >
            <Check className="ic" />
            Save my PIN
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor={`${ids}p`}>PIN you have now</label>
        <input
          id={`${ids}p`}
          className="input input-lg num text-left"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          value={values.currentPin}
          onChange={set("currentPin")}
        />
        <PinDots length={values.currentPin.length} />
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor={`${ids}a`}>New PIN</label>
          <input id={`${ids}a`} className="input input-lg num text-left" type="password" inputMode="numeric" autoComplete="off" value={values.newPin} onChange={set("newPin")} />
          <PinDots length={values.newPin.length} />
        </div>
        <div className="field">
          <label htmlFor={`${ids}b`}>Again</label>
          <input id={`${ids}b`} className="input input-lg num text-left" type="password" inputMode="numeric" autoComplete="off" value={values.again} onChange={set("again")} />
          <PinDots length={values.again.length} />
        </div>
      </div>
      {problem ? (
        <ErrorLine>{problem}</ErrorLine>
      ) : (
        <span className="help">Not four of the same digit and not four in a row, like 1111 or 1234.</span>
      )}
    </TillDialog>
  );
}

/* ─── Help ───────────────────────────────────────────────────────────── */

export function HelpScreen() {
  const { rules, features } = useTill();
  return (
    <div className="main is-scroll">
      <div className="bar">
        <h1>Help</h1>
      </div>
      <div className="page is-close">
        <div className="form-sec">
          <header>
            <h2>Keys</h2>
          </header>
          <div className="body">
            <KeyList />
          </div>
        </div>
        <div className="form-sec">
          <header>
            <h2>When something goes wrong</h2>
          </header>
          <div className="body">
            <dl className="attrs is-wider">
              <dt>The line is down</dt>
              <dd>
                Keep selling{rules ? ` for up to ${hoursWords(rules.offlineHours)}` : ""}. Sales wait under “waiting to send”.
              </dd>
              <dt>The receipt did not print</dt>
              <dd>History, the sale, Print receipt.</dd>
              <dt>A product will not scan</dt>
              <dd>Type its name. Tell the manager the barcode is wrong.</dd>
              <dt>The till locked</dt>
              <dd>Your PIN. Five wrong ones lock it until a manager sends a new one; your password still opens the till.</dd>
              {features?.licenceHours ? (
                <>
                  <dt>Alcohol will not sell</dt>
                  <dd>It is outside the licence hours. Nobody can override them, a manager included.</dd>
                </>
              ) : null}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
