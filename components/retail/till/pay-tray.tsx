"use client";

/**
 * The tray: it rises over the sale column when Take is pressed and keeps one
 * height through asking, waiting and done. Cash asks what was handed over, in
 * US dollars or ZiG; card, EcoCash and InnBucks ask for their reference; split
 * takes several ways while the till rules allow it. Paid says what to give
 * back, in US dollars and ZiG notes, then the next sale.
 */

import * as React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { formatZigRate, splitChange, type ChangeSplit } from "@/lib/retail/payment-words";
import { getPosPortalHref } from "@/lib/retail/pos-host";
import { fiscalStatusLabel } from "@/lib/retail/words";
import { AddressBook, CaretRight, Check, Money, Plus, Printer, Receipt, Ticket, Trash, Wallet, WifiSlash, X } from "@/lib/icons";
import { emptiesWords } from "./empties-words";
import { firstName, hhmm, paymentLabel, usd, whole, zig } from "./format";
import { printSlip, slipLines, type SlipSale } from "./offline-slip";
import { ErrorLine, Keypad, Segmented, typeAmount, useKeypadKeys, useReturnFocus, useWindowKeys, type KeypadKey } from "./parts";
import { paymentSummary } from "./sale-rules";
import { useTill } from "./state";
import type { PaymentRow, TenderType, TillTender } from "./types";

/** Tenders without a reference to read off a slip or a message: one row in the sale column, chosen in the tray. */
const OTHER_TENDERS = new Set<string>(["TRANSFER", "ON_ACCOUNT", "VOUCHER"]);
/** Where the reference comes from, under the tender's name. */
const REFERENCE_FROM: Partial<Record<string, string>> = {
  CARD: "reference from the slip",
  ECOCASH: "reference from their message",
  INNBUCKS: "reference from their message",
};
/** Brands keep their capitals in a sentence. */
const BRANDS = new Set(["EcoCash", "InnBucks"]);
/** Before the till's context lands: cash. */
const CASH_ONLY: TillTender = { tender: "CASH", currency: null, label: "Cash" };

/**
 * A way to pay as the sale column lists it: one tender, or the shop's other
 * tenders (bank transfer, voucher) under one row and chosen in the tray.
 */
export type PayWay = { key: string; label: string; meta: string | null; choices: TillTender[] };

const isZigCash = (choice: TillTender) => choice.tender === "CASH" && choice.currency === "ZWG";

/** One key per tender and currency: cash US$ and cash ZiG are two. */
export function tenderKey(choice: Pick<TillTender, "tender" | "currency">) {
  return `${choice.tender}:${choice.currency === "ZWG" ? "ZWG" : ""}`;
}

/** "Bank transfer" → "bank transfer"; "EcoCash" stays. */
function inSentence(label: string) {
  return BRANDS.has(label) ? label : `${label.charAt(0).toLowerCase()}${label.slice(1)}`;
}

/** "Voucher or bank transfer". */
function orList(labels: string[]) {
  const words = labels.map((label, index) => (index ? inSentence(label) : label));
  return words.length > 1 ? `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}` : (words[0] ?? "");
}

/**
 * The ways the sale column offers, in the shop's order (`context.tenders`).
 * Cash ZiG only while there is a rate to take it at.
 */
export function payWays(tenders: readonly TillTender[], zigRate: { rate: string } | null): PayWay[] {
  const usable = tenders.filter((choice) => !isZigCash(choice) || zigRate);
  const list = usable.length ? usable : [CASH_ONLY];
  const twoCash = list.some(isZigCash);
  const ways: PayWay[] = [];
  let other: PayWay | null = null;
  for (const choice of list) {
    if (OTHER_TENDERS.has(choice.tender)) {
      if (!other) {
        other = { key: "OTHER", label: "", meta: null, choices: [] };
        ways.push(other);
      }
      other.choices.push(choice);
      continue;
    }
    ways.push({
      key: tenderKey(choice),
      // One kind of cash is just cash.
      label: choice.tender === "CASH" && !twoCash ? "Cash" : choice.label,
      meta: isZigCash(choice) && zigRate ? `ZiG ${formatZigRate(zigRate.rate)} to US$1` : (REFERENCE_FROM[choice.tender] ?? null),
      choices: [choice],
    });
  }
  if (other) other.label = orList(other.choices.map((choice) => choice.label));
  return ways;
}

/** Change as it is handed back: "US$3.00 and ZiG 11.00", "ZiG 11.00", "US$3.00". */
export function changeText(change: Pick<ChangeSplit, "usd" | "zig">): string {
  if (change.zig > 0.004 && change.usd > 0.004) return `${usd(change.usd)} and ${zig(change.zig)}`;
  if (change.zig > 0.004) return zig(change.zig);
  return usd(change.usd);
}

/**
 * Marks for the ways people pay: the real ones, at their own colours, where
 * the brand has one. `single` draws card as one mark, for a row with room for
 * only one. Anything not named here (several tenders under one row) is a receipt.
 */
export function TenderMark({ tender, single = false }: { tender: string; single?: boolean }) {
  if (tender === "CARD" && single) {
    return (
      <span className="mark" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- a brand mark, drawn as it is */}
        <img src="/retail/marks/visa.svg" alt="" width={24} height={16} className="mark-img" />
      </span>
    );
  }
  if (tender === "CARD") {
    return (
      <span className="mark-pair" aria-hidden="true">
        <span className="mark">
          {/* eslint-disable-next-line @next/next/no-img-element -- a brand mark, drawn as it is */}
          <img src="/retail/marks/visa.svg" alt="" width={24} height={16} className="mark-img" />
        </span>
        <span className="mark">
          {/* eslint-disable-next-line @next/next/no-img-element -- a brand mark, drawn as it is */}
          <img src="/retail/marks/mastercard.svg" alt="" width={24} height={16} className="mark-img" />
        </span>
      </span>
    );
  }
  if (tender === "ECOCASH") {
    return (
      <span className="mark" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- a brand mark, drawn as it is */}
        <img src="/retail/marks/ecocash.png" alt="" width={24} height={24} />
      </span>
    );
  }
  if (tender === "CASH") return <Money className="ic" />;
  if (tender === "INNBUCKS") return <Wallet className="ic" />;
  if (tender === "VOUCHER") return <Ticket className="ic" />;
  if (tender === "ON_ACCOUNT") return <AddressBook className="ic" />;
  return <Receipt className="ic" />;
}

/** Exact, then the next notes up: what a cashier is most often handed. */
function quickAmounts(due: number) {
  const steps = [1, 5, 10, 20, 50, 100];
  const out = [due];
  for (const step of steps) {
    const next = Math.ceil(due / step) * step;
    if (next > due + 0.004 && !out.some((value) => Math.abs(value - next) < 0.004)) out.push(next);
    if (out.length === 3) break;
  }
  return out;
}

/** What is due in ZiG at today's rate, up to the next ZiG cent so it always covers the sale. */
const inZig = (amount: number, rate: number) => Math.ceil(Number((amount * rate * 100).toFixed(6))) / 100;

export function printReceipt(href: string) {
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.src = href;
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 60_000);
  };
  document.body.appendChild(frame);
}

export function PayTray({
  way,
  ways,
  onClose,
  onTake,
  onNext,
}: {
  way: PayWay;
  /** Every way the shop takes, for a split. */
  ways: PayWay[];
  onClose: () => void;
  /** Called with the payments; the caller asks for a reason or a manager first if one is needed. */
  onTake: (rows: PaymentRow[]) => void;
  onNext: () => void;
}) {
  const {
    amountDue,
    postSalePending,
    saleRefusal,
    lastCompletedSale,
    lastSavedSale,
    referenceProblem,
    rules,
    zig: zigRate,
    emptiesBackCount,
    isPosHost,
    selectedCustomer,
    customerName,
    context,
    cart,
    lineStopped,
    idChecked,
  } = useTill();
  const { data: session } = useSession();
  const [mode, setMode] = React.useState<"single" | "split">("single");
  const [handed, setHanded] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [choiceKey, setChoiceKey] = React.useState(() => tenderKey(way.choices[0]));
  const [rows, setRows] = React.useState<PaymentRow[]>([]);
  const [triedTake, setTriedTake] = React.useState(false);
  // Empties counted on the sale, kept for the paid view: the sale's lines are cleared once it goes through.
  const [emptiesTaken, setEmptiesTaken] = React.useState(0);
  // The sale as it was taken, for a slip if it is saved on the till: the lines are cleared once it goes.
  const [taken, setTaken] = React.useState<Omit<SlipSale, "tag" | "at" | "total" | "change"> | null>(null);
  const refId = React.useId();
  const returnFocus = useReturnFocus();

  const done = lastCompletedSale ?? null;
  const saved = !done ? lastSavedSale : null;
  const rate = zigRate ? Number(zigRate.rate) : null;
  const changeRule = React.useMemo(() => (zigRate ? { rate: Number(zigRate.rate), rounding: zigRate.rounding } : null), [zigRate]);
  const allChoices = ways.flatMap((entry) => entry.choices);
  const splitAllowed = rules?.splitTender !== false;

  const choice = way.choices.find((entry) => tenderKey(entry) === choiceKey) ?? way.choices[0];
  const tenderType = choice.tender as TenderType;
  const zigCash = isZigCash(choice) && rate !== null;
  // What is due, and what the keys type, in this tender's own money.
  const money = (value: number) => (zigCash ? zig(value) : usd(value));
  const dueHere = zigCash && rate ? inZig(amountDue, rate) : amountDue;
  const handedValue = handed ? Number(handed) : dueHere;
  const row: PaymentRow = {
    tenderType,
    amount: (tenderType === "CASH" ? handedValue : dueHere).toFixed(2),
    reference: tenderType === "CASH" ? "" : reference.trim(),
    ...(zigCash ? { currency: "ZWG" as const } : {}),
  };
  const paid = paymentSummary([row], amountDue, rate);
  const short = Math.max(amountDue - paid.tenderedTotal, 0);
  const covered = short < 0.005;
  const change = splitChange(paid.changeAmount, changeRule);
  const refProblem = tenderType === "CASH" ? null : referenceProblem(row);
  const needsRef = Boolean(rules && (rules.requiredReferenceTenders as readonly string[]).includes(tenderType));

  const split = paymentSummary(rows, amountDue, rate);
  const splitStill = Number(Math.max(amountDue - split.tenderedTotal, 0).toFixed(2));
  const splitRefProblem = rows.map((entry) => (entry.tenderType === "CASH" ? null : referenceProblem(entry))).find(Boolean) ?? null;
  const splitOk =
    splitStill < 0.005 && split.nonCashTotal <= amountDue + 0.004 && !splitRefProblem && rows.every((entry) => Number(entry.amount || "0") > 0);

  const keep = (payments: PaymentRow[]) => {
    setEmptiesTaken(emptiesBackCount);
    setTaken({
      tillLine: [context?.till.name, session?.user?.name ? firstName(session.user.name) : null].filter(Boolean).join(", "),
      customerName: selectedCustomer?.name ?? (customerName.trim() || null),
      lines: slipLines(cart.filter((item) => !lineStopped(item))),
      payments,
      idChecked,
    });
  };

  const take = () => {
    setTriedTake(true);
    if (mode === "split") {
      if (!splitOk) return;
      keep(rows);
      onTake(rows);
      return;
    }
    if (tenderType === "CASH" && !covered) return;
    if (refProblem) return;
    keep([row]);
    onTake([row]);
  };

  const otherWay = (current: TillTender) =>
    (current.tender === "CASH" ? allChoices.find((entry) => entry.tender !== "CASH") : allChoices.find((entry) => entry.tender === "CASH" && !isZigCash(entry))) ??
    current;
  const rowFor = (entry: TillTender, amount: string, ref = ""): PaymentRow => ({
    tenderType: entry.tender as TenderType,
    amount,
    reference: entry.tender === "CASH" ? "" : ref,
    ...(isZigCash(entry) ? { currency: "ZWG" as const } : {}),
  });

  const startSplit = () => {
    setRows([rowFor(choice, "", reference), rowFor(otherWay(choice), "")]);
    setMode("split");
    setTriedTake(false);
  };

  const onKey = (key: KeypadKey) => setHanded((current) => typeAmount(current, key));
  useKeypadKeys(onKey, !done && !saved && mode === "single" && tenderType === "CASH");

  // Escape and the scrim close it while it is still asking; once money is moving, only Next sale does.
  const closable = !done && !saved && !postSalePending;

  useWindowKeys((event) => {
    const target = event.target as HTMLElement | null;
    if (event.key !== "Enter" || (target && target.tagName === "BUTTON")) return;
    event.preventDefault();
    if (done || saved) onNext();
    else if (!postSalePending) take();
  });

  const refused = saleRefusal?.kind === "refused" ? <ErrorLine>{saleRefusal.message}</ErrorLine> : null;

  const top = (
    <div className="tray-top">
      <span className="text-heading strong">
        Total
      </span>
      <span className="figure">{usd(done ? done.totalAmount + done.depositAmount : saved ? saved.total : amountDue)}</span>
    </div>
  );

  let body: React.ReactNode;
  let label = "Take payment";

  if (done) {
    label = "Paid";
    const methods = [...new Set(done.payments.map((payment) => paymentLabel(payment.tenderType, payment.currency)))];
    const allCash = done.payments.every((payment) => payment.tenderType === "CASH" && payment.currency !== "ZWG");
    const fiscal = done.fiscal && done.fiscal.status !== "SKIPPED" ? done.fiscal : null;
    const receiptHref = `${isPosHost ? "" : "/portal/pos"}/receipt/${done.id}`;
    // Change only comes from cash, so a sale with no cash in it has nothing to give back.
    const tookCash = done.payments.some((payment) => payment.tenderType === "CASH");
    const refs = done.payments.filter((payment) => payment.tenderType !== "CASH" && payment.reference);
    body = (
      <>
        <div className="wait" role="status" aria-live="polite">
          <span className="status status-success is-strong">
            Paid {allCash ? "in cash" : `by ${methods.map(inSentence).join(" and ")}`}, {done.saleNo}
          </span>
          <span className="note num">
            {hhmm(done.postedAt)}
          </span>
        </div>
        {tookCash ? (
          <div className="tender is-quiet" aria-live="polite">
            <span className="l">{done.changeAmount > 0.004 ? "Give back" : "Change"}</span>
            <span className="tender-figure">{changeText({ usd: done.changeUsd, zig: done.changeZig })}</span>
          </div>
        ) : null}
        <dl className="attrs">
          {refs.map((payment, index) => (
            <React.Fragment key={index}>
              <dt>{refs.length > 1 ? `${paymentLabel(payment.tenderType, payment.currency)} reference` : "Reference"}</dt>
              <dd className="num text-left">{payment.reference}</dd>
            </React.Fragment>
          ))}
          {emptiesTaken ? (
            <>
              <dt>Empties</dt>
              <dd>{emptiesWords(emptiesTaken, done.empties)}</dd>
            </>
          ) : null}
          {fiscal ? (
            <>
              <dt>Receipt</dt>
              <dd>
                {fiscal.status === "SUCCESS"
                  ? "Fiscalised by ZIMRA"
                  : fiscal.status === "PENDING"
                    ? "Waiting for ZIMRA; the fiscal number prints when it answers"
                    : fiscalStatusLabel(fiscal.status)}
                {fiscal.fiscalNumber ? (
                  <>
                    , <span className="num text-left">{fiscal.fiscalNumber}</span>
                  </>
                ) : null}
              </dd>
            </>
          ) : null}
          {done.loyalty && done.customerName ? (
            <>
              <dt>{firstName(done.customerName)}</dt>
              <dd>
                +{done.loyalty.pointsEarned} points, {whole(done.loyalty.pointsBalance)} now
              </dd>
            </>
          ) : null}
          {done.heldAs ? (
            <>
              <dt>Was held as</dt>
              <dd>{done.heldAs}</dd>
            </>
          ) : null}
        </dl>
        <div className="btn-group is-full" role="group" aria-label="Receipt">
          <button type="button" className="btn btn-touch grow" onClick={() => printReceipt(receiptHref)}>
            <Printer className="ic" />
            Print receipt
          </button>
          <button type="button" className="btn btn-touch grow" onClick={onNext}>
            <X className="ic" />
            No receipt
          </button>
        </div>
        <div className="grow" />
        <button type="button" className="btn btn-primary btn-touch btn-block" onClick={onNext}>
          <CaretRight className="ic" />
          Next sale
          <EnterKey />
        </button>
      </>
    );
  } else if (saved) {
    label = "Saved on this till";
    body = (
      <>
        <div className="wait" role="status" aria-live="polite">
          <span className="status status-warning is-strong">
            Saved on this till
          </span>
          <span className="note num">
            {hhmm(saved.at)}
          </span>
        </div>
        <div className="tender is-quiet">
          <span className="l">{saved.change.value > 0.004 ? `Give back from ${usd(saved.handed)}` : "Change"}</span>
          <span className="tender-figure">{changeText(saved.change)}</span>
        </div>
        <p className="note">
          Its sale number and fiscal receipt come when it is sent. Nothing else to do: it goes up on its own.
        </p>
        <div className="btn-group is-full" role="group" aria-label="Receipt">
          {taken ? (
            <button
              type="button"
              className="btn btn-touch grow"
              onClick={(event) =>
                printSlip(
                  { ...taken, tag: saved.tag, at: saved.at, total: saved.total, change: saved.change },
                  context?.receipt ?? null,
                  event.currentTarget.closest(".tl")?.className ?? "tl",
                )
              }
            >
              <Printer className="ic" />
              Print a slip
            </button>
          ) : null}
          <Link className="btn btn-touch grow" href={getPosPortalHref("offline", isPosHost)} onClick={onNext}>
            <WifiSlash className="ic" />
            Waiting to send
          </Link>
        </div>
        <div className="grow" />
        <button type="button" className="btn btn-primary btn-touch btn-block" onClick={onNext}>
          <CaretRight className="ic" />
          Next sale
          <EnterKey />
        </button>
      </>
    );
  } else if (mode === "split") {
    label = "Split the payment";
    const setRow = (index: number, patch: Partial<PaymentRow>) => setRows(rows.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));
    body = (
      <>
        <div className="list is-framed">
          {rows.map((entry, index) => {
            const refShort = triedTake && entry.tenderType !== "CASH" && Boolean(referenceProblem(entry));
            const entryLabel = paymentLabel(entry.tenderType, entry.currency);
            return (
              <div key={index} className="row is-tender">
                <TenderMark tender={entry.tenderType} />
                <select
                  className="select width-132"
                  aria-label={`Way ${index + 1}, how`}
                  value={tenderKey({ tender: entry.tenderType, currency: entry.currency ?? null })}
                  onChange={(event) => {
                    const next = allChoices.find((option) => tenderKey(option) === event.target.value);
                    if (next) setRows(rows.map((current, i) => (i === index ? rowFor(next, current.amount, current.reference) : current)));
                  }}
                >
                  {allChoices.map((option) => (
                    <option key={tenderKey(option)} value={tenderKey(option)}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <label className="input-wrap grow min-96">
                  <span className="muted">{entry.currency === "ZWG" ? "ZiG" : "US$"}</span>
                  <input
                    className="num"
                    aria-label={`Way ${index + 1}, amount`}
                    inputMode="decimal"
                    value={entry.amount}
                    onChange={(event) => setRow(index, { amount: event.target.value.replace(/[^\d.]/g, "") })}
                  />
                </label>
                <button type="button" className="btn btn-quiet btn-icon" aria-label={`Remove way ${index + 1}`} onClick={() => setRows(rows.filter((_, i) => i !== index))}>
                  <Trash className="ic" />
                </button>
                {entry.tenderType !== "CASH" ? (
                  <input
                    className="input num w-full text-left"
                    aria-label={`Way ${index + 1}, ${inSentence(entryLabel)} reference`}
                    placeholder="Reference"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    aria-invalid={refShort || undefined}
                    aria-describedby={refShort ? `${refId}s` : undefined}
                    value={entry.reference}
                    onChange={(event) => setRow(index, { reference: event.target.value })}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="wait" role="status" aria-live="polite">
          <span className="status">Still due</span>
          <span className="num strong">
            {usd(splitStill)}
          </span>
        </div>
        {triedTake && !splitOk ? (
          <ErrorLine id={`${refId}s`}>
            {split.nonCashTotal > amountDue + 0.004
              ? "Only cash can come to more than the total."
              : splitRefProblem
                ? splitRefProblem
                : "The ways together have to cover the total."}
          </ErrorLine>
        ) : (
          <p className="note">
            Change only comes from cash, so only cash can come to more than the total.
          </p>
        )}
        <button
          type="button"
          className="btn self-start"
          onClick={() => setRows([...rows, rowFor(otherWay(CASH_ONLY), splitStill ? splitStill.toFixed(2) : "")])}
        >
          <Plus className="ic" />
          Add another way
        </button>
        <div className="grow" />
        <TakeButton label={`Take ${usd(Math.max(split.tenderedTotal, amountDue))}`} busy={postSalePending} disabled={false} onClick={take} />
        {refused}
      </>
    );
  } else if (tenderType === "CASH") {
    label = zigCash ? "Take cash in ZiG" : "Take cash";
    const quick = quickAmounts(dueHere);
    body = (
      <>
        {way.choices.length > 1 ? <WhichTender way={way} value={tenderKey(choice)} onChange={setChoiceKey} /> : null}
        <div className="tender">
          <span className="l">Cash handed over</span>
          <span className="tender-figure">{money(handedValue)}</span>
        </div>
        <div className="quick" role="group" aria-label="Quick amounts">
          {quick.map((value, index) => (
            <button
              key={value}
              type="button"
              className="btn btn-touch"
              aria-pressed={Math.abs(value - handedValue) < 0.004}
              aria-label={index === 0 ? `Exact, ${money(value)}` : `${money(value)} handed over`}
              onClick={() => setHanded(value.toFixed(2))}
            >
              {value.toFixed(2)}
            </button>
          ))}
        </div>
        <Keypad onKey={onKey} left="dot" />
        <div className="wait" role="status" aria-live="polite">
          <span className={`status is-strong ${covered ? "status-success" : "status-warning"}`}>
            {covered ? "Change due" : "Still due"}
          </span>
          <span className="num due-figure">
            {covered ? changeText(change) : zigCash && rate ? zig(inZig(short, rate)) : usd(short)}
          </span>
        </div>
        {zigCash && rate ? (
          <p className="note">
            {zig(dueHere)} at ZiG {formatZigRate(rate)} to US$1. Change comes in whole US dollars, then ZiG.
          </p>
        ) : null}
        {splitAllowed ? (
          <button type="button" className="btn btn-quiet self-start" onClick={() => startSplit()}>
            <Plus className="ic" />
            Split between two ways
          </button>
        ) : null}
        <div className="grow" />
        <TakeButton label={`Take ${money(handedValue)}`} busy={postSalePending} disabled={!covered} onClick={take} />
        {refused}
      </>
    );
  } else {
    label = `Take ${inSentence(choice.label)}`;
    const who = selectedCustomer ? firstName(selectedCustomer.name) : "the customer";
    const wallet = tenderType === "ECOCASH" || tenderType === "INNBUCKS";
    const refOk = !refProblem;
    body = (
      <>
        {way.choices.length > 1 ? <WhichTender way={way} value={tenderKey(choice)} onChange={setChoiceKey} /> : null}
        <div className="field">
          <label htmlFor={refId}>
            Reference{needsRef ? null : <span className="opt"> optional</span>}
          </label>
          <input
            id={refId}
            className="input input-lg num text-left"
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={reference}
            placeholder={wallet ? "From their confirmation message" : tenderType === "CARD" ? "From the card slip" : ""}
            aria-invalid={(triedTake && !refOk) || undefined}
            aria-describedby={refOk ? undefined : `${refId}e`}
            onChange={(event) => setReference(event.target.value)}
          />
          {/* The rule shows before Take is tried, so the greyed Take is never a guess. */}
          {refProblem ? (
            triedTake ? (
              <ErrorLine id={`${refId}e`}>{refProblem}</ErrorLine>
            ) : (
              <span id={`${refId}e`} className="help">
                {refProblem}
              </span>
            )
          ) : null}
        </div>
        {wallet ? (
          <p className="note">
            Ask {who} to show the message that says {usd(amountDue)} was sent to {context?.site.name ?? "this shop"}.
          </p>
        ) : null}
        {splitAllowed ? (
          <button type="button" className="btn btn-quiet self-start" onClick={() => startSplit()}>
            <Plus className="ic" />
            Split between two ways
          </button>
        ) : null}
        <div className="grow" />
        <TakeButton label={`Take ${usd(amountDue)}`} busy={postSalePending} disabled={!refOk} onClick={take} />
        {!refOk ? (
          <p className="help is-centred">
            Take is off until the reference is in.
          </p>
        ) : null}
        {refused}
      </>
    );
  }

  // Not portalled: the tray rises over the sale column, so it stays inside it.
  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open && closable) onClose();
      }}
    >
      <div className="over">
        <DialogPrimitive.Overlay className="scrim" />
        <DialogPrimitive.Content
          className="tray"
          aria-describedby={undefined}
          onCloseAutoFocus={returnFocus}
          onEscapeKeyDown={(event) => {
            if (!closable) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (!closable) event.preventDefault();
          }}
        >
          <DialogPrimitive.Title className="visually-hidden">{label}</DialogPrimitive.Title>
          {top}
          {body}
        </DialogPrimitive.Content>
      </div>
    </DialogPrimitive.Root>
  );
}

/** Which of the shop's other tenders, when one row in the sale column holds several. */
function WhichTender({ way, value, onChange }: { way: PayWay; value: string; onChange: (key: string) => void }) {
  return (
    <Segmented
      label="Which"
      className="self-start"
      value={value}
      options={way.choices.map((option) => ({ value: tenderKey(option), label: option.label }))}
      onChange={onChange}
    />
  );
}

function EnterKey() {
  return (
    <span className="kbd on-primary">
      Enter
    </span>
  );
}

function TakeButton({ label, busy, disabled, onClick }: { label: string; busy: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="btn btn-primary btn-touch btn-block"
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      onClick={onClick}
    >
      <Check className="ic" />
      {label}
      {/* Enter only shows while it would take the money. */}
      {disabled ? null : <EnterKey />}
    </button>
  );
}
