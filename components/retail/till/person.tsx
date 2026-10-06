"use client";

/**
 * What sits under the person at the top of the rail: my activity, till
 * settings (this till, my PIN, unpair) and help.
 */

import * as React from "react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { useOfflineRuntime } from "@/components/offline/offline-runtime";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { ArrowsCounterClockwise, CashRegister, Check, Key, LinkBreak, ListChecks, Money, Printer, Prohibit, Tag, Vault, X } from "@/lib/icons";
import { listOfflineRetailOperations } from "@/lib/retail/offline-runtime";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import { getPosPortalHref } from "@/lib/retail/pos-host";
import { SEND_BY_WORDS, type ReceiptWire } from "@/lib/retail/receipt-words";
import { wasApproved, type TillActivityEntry, type TillActivityKind } from "@/lib/retail/till-activity-shared";
import { TILL_PIN_LOCKED } from "@/lib/retail/till-pin";
import { hoursWords, percentWords, voidPinSentence } from "@/lib/retail/till-rule-words";
import { count, dayMonth, hhmm, TENDER_LABEL, usd } from "./format";
import type { TillRulesForTill } from "./types";
import { Empty, ErrorLine, PinDots, Segmented, TillDialog } from "./parts";
import { printReceipt } from "./pay-tray";
import { useTillLock } from "./lock";
import { useTill } from "./state";

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
        <Empty icon={ListChecks} title="Your activity did not load">
          {getApiErrorMessage(query.error)}
        </Empty>
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
            <dl className="attrs is-narrow">
              <dt>
                <span className="kbd">/</span>
              </dt>
              <dd>Search, or scan into it</dd>
              <dt>
                <span className="kbd">Enter</span>
              </dt>
              <dd>Take the money once the total is right</dd>
              <dt>
                <span className="kbd">Esc</span>
              </dt>
              <dd>Close what is open</dd>
              <dt>
                <span className="kbd">L</span>
              </dt>
              <dd>Lock the till</dd>
            </dl>
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
