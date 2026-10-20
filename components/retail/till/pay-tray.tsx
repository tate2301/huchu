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

import { changeNoteWords } from "@/lib/retail/change-notes";
import { formatZigRate, splitChange, type ChangeSplit } from "@/lib/retail/payment-words";
import { getPosPortalHref } from "@/lib/retail/pos-host";
import { fiscalStatusLabel } from "@/lib/retail/words";
import { AddressBook, ArrowsCounterClockwise, ArrowsSplit, CaretRight, Check, Money, PauseCircle, Plus, Printer, Receipt, Stamp, Star, Ticket, Trash, Wallet, WifiSlash, X } from "@/lib/icons";
import { count, firstName, hhmm, paymentLabel, usd, whole, zig } from "./format";
import { printSlip, slipLines, type SlipSale } from "./offline-slip";
import { ErrorLine, Keypad, Segmented, typeAmount, useKeypadKeys, useReturnFocus, useWindowKeys, type KeypadKey } from "./parts";
import { useVoucherCheck } from "./floor-parts";
import { paymentSummary } from "./sale-rules";
import { cue } from "./sound";
import { useTill } from "./state";
import type { PaymentRow, TenderType, TillContext, TillTender } from "./types";
import { voucherPays, voucherProblem, VOUCHERS_OFFLINE } from "./vouchers";

/** Tenders without a reference to read off a slip or a message: one row in the sale column, chosen in the tray. */
const OTHER_TENDERS = new Set<string>(["TRANSFER", "ON_ACCOUNT", "VOUCHER"]);
/** Where the reference comes from, under the tender's name. */
const REFERENCE_FROM: Partial<Record<string, string>> = {
  CARD: "reference from the slip",
  ECOCASH: "reference from their message",
  INNBUCKS: "reference from their message",
};
/**
 * What the cashier tells the customer to pay by EcoCash, the way this shop
 * takes it: its merchant code, its EcoCash number, or the terminal at the
 * counter. Null while the shop has not said, and the tray keeps its general
 * sentence.
 */
function ecocashHow(ecocash: TillContext["ecocash"], amount: string, who: string) {
  if (ecocash?.method === "MERCHANT_CODE" && ecocash.merchantCode) {
    return {
      say: `Pay merchant ${ecocash.merchantCode}`,
      as: ecocash.name ? `Shows as ${ecocash.name}, for ${amount}` : `For ${amount}`,
      after: "The reference is on the message they get once it goes through.",
      terminal: false,
    };
  }
  if (ecocash?.method === "PHONE_NUMBER" && ecocash.phone) {
    return {
      say: `Send ${amount} to ${ecocash.phone}`,
      as: ecocash.name ? `Shows as ${ecocash.name}` : null,
      after: `Ask ${who} to show the message that says ${amount} was sent.`,
      terminal: false,
    };
  }
  if (ecocash?.method === "TERMINAL") {
    return {
      say: `Key ${amount} on the terminal`,
      as: "They pay on it with EcoCash",
      after: "The reference is on the slip the terminal prints.",
      terminal: true,
    };
  }
  return null;
}

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
export function tenderKey(choice: Pick<TillTender, "currency"> & { tender: string }) {
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
export function payWays(
  tenders: readonly TillTender[],
  zigRate: { rate: string } | null,
  ecocash: TillContext["ecocash"] = null,
): PayWay[] {
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
      meta:
        isZigCash(choice) && zigRate
          ? `ZiG ${formatZigRate(zigRate.rate)} to US$1`
          : choice.tender === "ECOCASH" && ecocash?.method === "TERMINAL"
            ? "on the terminal"
            : (REFERENCE_FROM[choice.tender] ?? null),
      choices: [choice],
    });
  }
  if (other) other.label = orList(other.choices.map((choice) => choice.label));
  return ways;
}

/** What goes back to the customer, the largest figure on Paid, with the notes that make it up under it. */
function ChangeBack({ label, change }: { label: string; change: Pick<ChangeSplit, "usd" | "zig"> }) {
  const notes = changeNoteWords(change);
  return (
    <div className="tender is-quiet is-change" aria-live="polite">
      <span className="l">{label}</span>
      <span className="tender-figure">{changeText(change)}</span>
      {notes ? <span className="notes">{notes}</span> : null}
    </div>
  );
}

/** Paid: a tick that draws itself once, where the status dot would be. */
function PaidTick() {
  return (
    <svg className="paid-tick" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" pathLength={1} />
    </svg>
  );
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
  onWay,
  onClose,
  onTake,
  onNext,
}: {
  way: PayWay;
  /** Every way the shop takes, for a split. */
  ways: PayWay[];
  /** Choose another way: the tray starts again on it. */
  onWay: (key: string) => void;
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
    context,
    cart,
    lineStopped,
    idChecked,
    isOffline,
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
  const voucherShort = rows.some((entry) => entry.tenderType === "VOUCHER" && (isOffline || !entry.voucherCode?.trim() || !entry.voucherSecret?.trim()));
  const splitOk =
    splitStill < 0.005 &&
    split.nonCashTotal <= amountDue + 0.004 &&
    !splitRefProblem &&
    !voucherShort &&
    rows.every((entry) => Number(entry.amount || "0") > 0);

  const keep = (payments: PaymentRow[]) => {
    setEmptiesTaken(emptiesBackCount);
    setTaken({
      tillLine: [context?.till.name, session?.user?.name ? firstName(session.user.name) : null].filter(Boolean).join(", "),
      customerName: selectedCustomer?.name ?? null,
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
    // A voucher is checked and taken from its own panel.
    if (tenderType === "VOUCHER") return;
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

  // Escape and the scrim close it while it is still asking; while money is moving, nothing does;
  // once it is paid or saved, anything does, and that is the next sale.
  const closable = !done && !saved && !postSalePending;
  const finished = Boolean(done || saved);
  // The money is in: two rising notes, once.
  React.useEffect(() => {
    if (finished) cue("paid");
  }, [finished]);

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
      <div className="tray-amount">
        <span className="tray-k">{done || saved ? "Total" : "Take"}</span>
        <span className="figure">{usd(done ? done.totalAmount + done.depositAmount + (done.vouchersSoldAmount ?? 0) : saved ? saved.total : amountDue)}</span>
      </div>
      {!done && !saved && !postSalePending ? (
        <button type="button" className="btn btn-icon is-touch" aria-label="Back to the sale" title="Back to the sale  Esc" onClick={onClose}>
          <X className="ic" />
        </button>
      ) : null}
    </div>
  );
  // How they are paying: one chip a way, and Split. A chip starts the tray again on its way.
  const tenders =
    done || saved ? null : (
      <div className="tender-chips" role="radiogroup" aria-label="How they are paying">
        {ways.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="radio"
            className="tender-chip"
            aria-checked={mode === "single" && entry.key === way.key}
            onClick={() => (entry.key === way.key ? setMode("single") : onWay(entry.key))}
          >
            <TenderMark single tender={entry.choices.length === 1 ? entry.choices[0].tender : entry.key} />
            {entry.label}
          </button>
        ))}
        {splitAllowed && allChoices.length > 1 ? (
          <button type="button" role="radio" className="tender-chip" aria-checked={mode === "split"} onClick={() => (mode === "split" ? null : startSplit())}>
            <ArrowsSplit className="ic" />
            Split
          </button>
        ) : null}
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
    const change = { usd: done.changeUsd, zig: done.changeZig };
    const changeNotes = tookCash ? changeNoteWords(change) : null;
    const cash = done.payments.filter((payment) => payment.tenderType === "CASH");
    body = (
      <>
        <div className="paid" role="status" aria-live="polite">
          <span className="paid-mark">
            <PaidTick />
          </span>
          <span className="paid-k">{tookCash ? (done.changeAmount > 0.004 ? "Change" : "No change") : `Paid by ${methods.map(inSentence).join(" and ")}`}</span>
          <span className="paid-v">{tookCash ? changeText(change) : usd(done.totalAmount + done.depositAmount + (done.vouchersSoldAmount ?? 0))}</span>
          {changeNotes ? <span className="paid-z">{changeNotes}</span> : null}
        </div>
        <dl className="facts">
          <div className="fact">
            <Receipt className="ic" />
            <dt>Sale</dt>
            <dd>
              {done.saleNo} · {hhmm(done.postedAt)}
            </dd>
          </div>
          {refs.map((payment, index) => (
            <div key={`ref-${index}`} className="fact">
              <TenderMark single tender={payment.tenderType} />
              <dt>{paymentLabel(payment.tenderType, payment.currency)}</dt>
              <dd>{payment.reference}</dd>
            </div>
          ))}
          {cash.map((payment, index) => (
            <div key={`cash-${index}`} className="fact">
              <Money className="ic" />
              <dt>{allCash && cash.length === 1 ? "Cash" : paymentLabel(payment.tenderType, payment.currency)}</dt>
              <dd>{payment.currency === "ZWG" ? zig(payment.amount) : usd(payment.amount)}</dd>
            </div>
          ))}
          {(done.vouchersSold ?? []).map((voucher) => (
            <div key={voucher.id} className="fact">
              <Ticket className="ic" />
              <dt>Gift voucher {usd(Number(voucher.value))}</dt>
              <dd>
                {voucher.code} · secret {voucher.secret}
              </dd>
            </div>
          ))}
          {emptiesTaken ? (
            <div className="fact">
              <ArrowsCounterClockwise className="ic" />
              <dt>Empties</dt>
              <dd>{count(emptiesTaken, "bottle")}</dd>
            </div>
          ) : null}
          {fiscal ? (
            <div className="fact">
              <Stamp className="ic" />
              <dt>
                {fiscal.status === "SUCCESS" ? "Fiscalised by ZIMRA" : fiscal.status === "PENDING" ? "Fiscal code" : fiscalStatusLabel(fiscal.status)}
              </dt>
              <dd>{fiscal.fiscalNumber ?? (fiscal.status === "PENDING" ? "to follow" : "")}</dd>
            </div>
          ) : null}
          {done.loyalty && done.customerName ? (
            <div className="fact">
              <Star className="ic" />
              <dt>{firstName(done.customerName)}</dt>
              <dd>
                +{done.loyalty.pointsEarned} points, {whole(done.loyalty.pointsBalance)} now
              </dd>
            </div>
          ) : null}
          {done.heldAs ? (
            <div className="fact">
              <PauseCircle className="ic" />
              <dt>Was held as</dt>
              <dd>{done.heldAs}</dd>
            </div>
          ) : null}
        </dl>
        <div className="grow" />
        <div className="sale-keys">
          <button type="button" className="hold-key" aria-label="Print the receipt" title="Print the receipt" onClick={() => printReceipt(receiptHref)}>
            <Printer className="ic" />
          </button>
          <button type="button" className="take-key" onClick={onNext}>
            Next sale
            <span className="kbd on-primary" aria-hidden="true">
              ↵
            </span>
          </button>
        </div>
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
        <ChangeBack label={saved.change.value > 0.004 ? `Give back from ${usd(saved.handed)}` : "Change"} change={saved.change} />
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
        <p className="help is-centred">Or tap anywhere else. The shelf works while this shows.</p>
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
                {entry.tenderType === "VOUCHER" ? (
                  <span className="voucher-check w-full">
                    <input
                      className="input num text-left"
                      aria-label={`Way ${index + 1}, voucher code`}
                      placeholder="GV-0019"
                      value={entry.voucherCode ?? ""}
                      onChange={(event) => setRow(index, { voucherCode: event.target.value.toUpperCase(), reference: event.target.value.toUpperCase() })}
                    />
                    <input
                      className="input num text-left"
                      aria-label={`Way ${index + 1}, voucher secret`}
                      placeholder="Secret"
                      value={entry.voucherSecret ?? ""}
                      onChange={(event) => setRow(index, { voucherSecret: event.target.value.toUpperCase() })}
                    />
                  </span>
                ) : entry.tenderType !== "CASH" ? (
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
            {voucherShort
              ? isOffline
                ? VOUCHERS_OFFLINE
                : "Type the voucher's code and secret."
              : split.nonCashTotal > amountDue + 0.004
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
        <div className="grow" />
        <TakeButton label={`Take ${money(handedValue)}`} busy={postSalePending} disabled={!covered} onClick={take} />
        {refused}
      </>
    );
  } else if (tenderType === "VOUCHER") {
    label = "Take a voucher";
    body = (
      <>
        {way.choices.length > 1 ? <WhichTender way={way} value={tenderKey(choice)} onChange={setChoiceKey} /> : null}
        <VoucherTender
          due={amountDue}
          offline={isOffline}
          busy={postSalePending}
          splitAllowed={splitAllowed}
          onTake={(voucherRow) => {
            keep([voucherRow]);
            onTake([voucherRow]);
          }}
          onSplit={(voucherRow) => {
            const rest = Number(Math.max(amountDue - Number(voucherRow.amount), 0).toFixed(2));
            setRows([voucherRow, rowFor(otherWay(choice), rest.toFixed(2))]);
            setMode("split");
            setTriedTake(false);
          }}
        />
        {refused}
      </>
    );
  } else {
    label = `Take ${inSentence(choice.label)}`;
    const who = selectedCustomer ? firstName(selectedCustomer.name) : "the customer";
    const wallet = tenderType === "ECOCASH" || tenderType === "INNBUCKS";
    // How this shop takes EcoCash, when it has said so: what the cashier tells the customer.
    const how = tenderType === "ECOCASH" ? ecocashHow(context?.ecocash ?? null, usd(amountDue), who) : null;
    const refOk = !refProblem;
    body = (
      <>
        {way.choices.length > 1 ? <WhichTender way={way} value={tenderKey(choice)} onChange={setChoiceKey} /> : null}
        {how ? (
          <div className="pay-how">
            <span className="label">Tell {who}</span>
            <span className="say">{how.say}</span>
            {how.as ? <span className="as">{how.as}</span> : null}
          </div>
        ) : null}
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
            placeholder={how?.terminal ? "From the terminal slip" : wallet ? "From their confirmation message" : tenderType === "CARD" ? "From the card slip" : ""}
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
        {how ? (
          how.after ? <p className="note">{how.after}</p> : null
        ) : wallet ? (
          <p className="note">
            Ask {who} to show the message that says {usd(amountDue)} was sent to {context?.site.name ?? "this shop"}.
          </p>
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
    // Paid or saved, the tray stops holding the till: no scrim, the shelf works, and a press
    // anywhere else is the next sale (a product pressed is added to it).
    <DialogPrimitive.Root
      open
      modal={!finished}
      onOpenChange={(open) => {
        if (open) return;
        if (finished) onNext();
        else if (closable) onClose();
      }}
    >
      <div className="over">
        {finished ? null : <DialogPrimitive.Overlay className="scrim" />}
        <DialogPrimitive.Content
          className="tray"
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            // A field that asks to be typed in takes the keys; else the tray does, so Enter takes the money.
            event.preventDefault();
            const tray = event.currentTarget as HTMLElement;
            (tray.querySelector<HTMLElement>("[autofocus]") ?? tray).focus();
          }}
          onCloseAutoFocus={finished ? (event) => event.preventDefault() : returnFocus}
          onEscapeKeyDown={(event) => {
            if (!closable && !finished) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (!closable && !finished) event.preventDefault();
          }}
          onFocusOutside={(event) => {
            // Paid stays put while the search takes focus for the next scan; a press is what moves on.
            if (finished) event.preventDefault();
          }}
        >
          <DialogPrimitive.Title className="visually-hidden">{label}</DialogPrimitive.Title>
          {done ? null : top}
          {tenders}
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
    <span className="kbd on-primary" aria-hidden="true">
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

/**
 * The VOUCHER tender (PRD-10, W-18): the voucher's code and secret, checked
 * online first. It pays what is left on it, at most what is due; less than
 * the total, the rest goes another way. Offline it is off: a voucher is money
 * the server holds.
 */
export function VoucherTender({
  due,
  offline,
  busy,
  splitAllowed,
  onTake,
  onSplit,
}: {
  due: number;
  offline: boolean;
  busy: boolean;
  splitAllowed: boolean;
  onTake: (row: PaymentRow) => void;
  onSplit: (row: PaymentRow) => void;
}) {
  const [code, setCode] = React.useState("");
  const [secret, setSecret] = React.useState("");
  const voucher = useVoucherCheck(due);
  const ids = React.useId();
  if (offline) return <p className="help">{VOUCHERS_OFFLINE}</p>;
  const problem = voucher.failed ?? voucherProblem(voucher.answer, "MONEY");
  const left = voucher.answer?.usable && !problem ? (voucher.answer.data?.left ?? 0) : null;
  const pays = left === null ? 0 : voucherPays(left, due);
  const row: PaymentRow = { tenderType: "VOUCHER", amount: pays.toFixed(2), reference: code.trim(), voucherCode: code.trim(), voucherSecret: secret.trim() };
  const covers = left !== null && pays >= due - 0.004;
  return (
    <>
      <div className="voucher-check">
        <div className="field">
          <label htmlFor={`${ids}c`}>Code</label>
          <input
            id={`${ids}c`}
            className="input input-lg num text-left"
            autoFocus
            autoComplete="off"
            placeholder="GV-0019"
            value={code}
            onChange={(event) => {
              setCode(event.target.value.toUpperCase());
              voucher.reset();
            }}
          />
        </div>
        <div className="field">
          <label htmlFor={`${ids}s`}>Secret</label>
          <input
            id={`${ids}s`}
            className="input input-lg num text-left"
            autoComplete="off"
            value={secret}
            onChange={(event) => {
              setSecret(event.target.value.toUpperCase());
              voucher.reset();
            }}
          />
        </div>
        <button
          type="button"
          className="btn btn-lg"
          disabled={!code.trim() || !secret.trim() || voucher.busy}
          aria-busy={voucher.busy || undefined}
          onClick={() => void voucher.check(code, secret)}
        >
          Check
        </button>
      </div>
      {problem ? (
        <ErrorLine>{problem}</ErrorLine>
      ) : left !== null ? (
        <div className="wait" role="status" aria-live="polite">
          <span className="status status-success is-strong">{usd(left)} left on it</span>
          <span className="num strong">{covers ? "Covers the sale" : `${usd(due - pays)} still due`}</span>
        </div>
      ) : (
        <p className="help">Type the code and the secret printed on it, then Check.</p>
      )}
      <div className="grow" />
      {left !== null && !covers ? (
        <TakeButton
          label={splitAllowed ? `Take ${usd(pays)}, the rest another way` : "It does not cover the sale"}
          busy={busy}
          disabled={!splitAllowed || pays <= 0}
          onClick={() => onSplit(row)}
        />
      ) : (
        <TakeButton label={`Take ${usd(due)}`} busy={busy} disabled={!covers} onClick={() => onTake(row)} />
      )}
    </>
  );
}
