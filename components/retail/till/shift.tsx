"use client";

/**
 * The shift: opening it, what happened to the drawer, cash in or out, and
 * cash-up. The float and the cash-up are counted note by note on a keypad.
 * Cash up counts blind (US$, and ZiG where the shop takes it), asks for the
 * float left for tomorrow, then closes through the same `closeShift` as the
 * back office (FLR-04): the difference shows only once the server has it, and
 * a drawer out by more than US$1.00 comes back asking what happened. Closing
 * ends the session: Who's selling next? goes back to "Who is selling?" and the
 * till stays paired. The cash-drop prompt lands here with `?move=drop`, and
 * Cash in or out is always open on "Drop to the safe".
 */

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useToast } from "@/components/ui/use-toast";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  ArrowsClockwise,
  CaretLeft,
  CashRegister,
  Check,
  Coins,
  HandCoins,
  Money,
  PauseCircle,
  Receipt,
  Stamp,
  UserRound,
  UserSwitch,
  Vault,
  WarningCircle,
  type LucideIcon,
} from "@/lib/icons";
import {
  cashMovementWhy,
  type RetailCashMovementReasonCode,
  type RetailCashMovementTypeName,
} from "@/lib/retail/cash-movements";
import { DENOMINATIONS, floatLeftProblem, rowTotal, type CountCurrency } from "@/lib/retail/floor/count";
import { count, firstName, hhmm, paymentLabel, signedUsd, usd, weekdayDayMonth, whole } from "./format";
import { Avatar, ErrorLine, Keypad, Segmented, typeAmount, useKeypadKeys, useWindowKeys, type KeypadKey } from "./parts";
import { useApproval } from "./approval";
import { useHeldSummary } from "./shell";
import { useSignOut } from "./sign-out";
import { useTill } from "./state";

type Movement = {
  id: string;
  type: RetailCashMovementTypeName;
  amount: number;
  delta: number;
  reasonCode: RetailCashMovementReasonCode;
  reason: string | null;
  denominations: { lines?: Array<{ denomination: string; count: number }> } | Array<{ denomination: string; count: number }> | null;
  recordedByName: string | null;
  approvedByName: string | null;
  createdAt: string;
};

/** The till's three ways cash moves (W-38); no "Pay a supplier" (98-decisions C-33). The enum keeps every reason for the books. */
type MoveWhy = "DROP" | "TOP_UP" | "PETTY";
const MOVE_WAYS: Array<{ why: MoveWhy; direction: "OUT" | "IN"; label: string; icon: LucideIcon; verb: string; done: (amount: string) => string }> = [
  { why: "DROP", direction: "OUT", label: "Drop to the safe", icon: Vault, verb: "Move", done: (amount) => `${amount} moved to the safe` },
  { why: "PETTY", direction: "OUT", label: "Petty cash", icon: HandCoins, verb: "Pay out", done: (amount) => `${amount} paid out` },
  { why: "TOP_UP", direction: "IN", label: "Float top-up", icon: Coins, verb: "Bring in", done: (amount) => `${amount} brought in` },
];

function noteLabel(denomination: string) {
  const value = Number(denomination);
  return value < 1 ? `${Math.round(value * 100)}c` : `US$${value}`;
}

function bundleText(movement: Movement) {
  const lines = Array.isArray(movement.denominations) ? movement.denominations : (movement.denominations?.lines ?? []);
  return lines
    .filter((line) => line.count > 0)
    .map((line) => `${line.count} × ${noteLabel(line.denomination)}`)
    .join(", ");
}

function useMovements(shiftId: string | undefined) {
  return useQuery({
    queryKey: ["retail-cash-movements", shiftId ?? null],
    enabled: Boolean(shiftId),
    queryFn: () => fetchJson<{ data: Movement[] }>(`/api/v2/retail/pos/shifts/${shiftId}/cash-movements`),
  });
}

/* ─── Counting by note ───────────────────────────────────────────────── */

/** The notes a drawer is counted in: US$, then ZiG where the shop takes ZiG cash. Counts are keyed "USD:20". */
type CountNote = { key: string; currency: CountCurrency; denomination: string };

function countNotes(takesZig: boolean): CountNote[] {
  return (["USD", "ZWG"] as const)
    .filter((currency) => currency === "USD" || takesZig)
    .flatMap((currency) => DENOMINATIONS[currency].map((denomination) => ({ key: `${currency}:${denomination}`, currency, denomination })));
}

function useCountNotes(): CountNote[] {
  const { context } = useTill();
  return countNotes((context?.tenders ?? []).some((choice) => choice.tender === "CASH" && choice.currency === "ZWG"));
}

const countNoteLabel = (note: CountNote) => (note.currency === "ZWG" ? `ZiG ${note.denomination}` : noteLabel(note.denomination));
/** What the keypad side is headed with: "US$20 notes", "50c coins". */
const countNoteName = (note: CountNote) => `${countNoteLabel(note)} ${Number(note.denomination) < 1 ? "coins" : "notes"}`;
const inCurrency = (currency: CountCurrency, value: number) => (currency === "ZWG" ? `ZiG ${value.toFixed(2)}` : usd(value));

function countedIn(notes: CountNote[], counts: Record<string, number>, currency: CountCurrency): number {
  return notes
    .filter((note) => note.currency === currency)
    .reduce((sum, note) => sum + Number(rowTotal({ denomination: note.denomination, count: counts[note.key] ?? 0 })), 0);
}

/** A key on a count: digits, delete and clear; five digits at most, no leading zero. */
function typeCount(typed: string, key: KeypadKey): string | null {
  if (key.kind === "delete") return typed.slice(0, -1);
  if (key.kind === "clear") return "";
  if (key.kind !== "digit") return null;
  if (typed.length >= 5) return typed;
  return typed === "0" ? key.value : typed + key.value;
}

/** The target of a key is inside a dialog: its own keys, not the screen's. */
const inDialog = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest("[role='dialog'], [role='alertdialog']"));

/**
 * The count's keys: digits into the chosen row, Up and Down between rows, and
 * Enter for the screen's one action.
 */
function useCountKeys({
  notes,
  counts,
  setCounts,
  at,
  setAt,
  onEnter,
}: {
  notes: CountNote[];
  counts: Record<string, number>;
  setCounts: (next: Record<string, number>) => void;
  at: number;
  setAt: React.Dispatch<React.SetStateAction<number>>;
  onEnter: () => void;
}) {
  const current = notes[at];
  const onKey = (key: KeypadKey) => {
    if (!current) return;
    const next = typeCount(String(counts[current.key] || ""), key);
    if (next === null) return;
    setCounts({ ...counts, [current.key]: next ? Number(next) : 0 });
  };
  useKeypadKeys(onKey);
  useWindowKeys((event) => {
    if (inDialog(event.target)) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setAt((now) => Math.min(Math.max(now + step, 0), notes.length - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      onEnter();
    }
  });
  return { current, typed: current ? String(counts[current.key] ?? 0) : "0", onKey };
}

/** One currency's notes: how many of each, what they come to, and the total at the foot. */
function CountTable({
  notes,
  counts,
  current,
  onPick,
  foot,
  slim,
}: {
  notes: CountNote[];
  counts: Record<string, number>;
  current: string | undefined;
  onPick: (key: string) => void;
  foot: string;
  slim?: boolean;
}) {
  const currency = notes[0]?.currency ?? "USD";
  return (
    <div className={slim ? "tally is-slim" : "tally"} role="group" aria-label={currency === "ZWG" ? "ZiG" : "US$"}>
      <div className="tally-h" aria-hidden="true">
        <span>Note</span>
        <span>How many</span>
        <span>Comes to</span>
      </div>
      {notes.map((note) => {
        const n = counts[note.key] ?? 0;
        return (
          <button
            key={note.key}
            type="button"
            className={n ? "tally-r" : "tally-r is-zero"}
            aria-current={note.key === current || undefined}
            aria-label={`${countNoteLabel(note)}: ${n}`}
            onClick={() => onPick(note.key)}
          >
            <span>{countNoteLabel(note)}</span>
            <span>{n}</span>
            <span>{n ? inCurrency(currency, Number(rowTotal({ denomination: note.denomination, count: n }))) : "—"}</span>
          </button>
        );
      })}
      <div className="tally-f">
        <span>{foot}</span>
        <span className="num">{inCurrency(currency, countedIn(notes, counts, currency))}</span>
      </div>
    </div>
  );
}

/** The count's tables: US$ alone, or US$ and ZiG side by side. */
function CountTables({
  notes,
  counts,
  current,
  onPick,
  foot,
}: {
  notes: CountNote[];
  counts: Record<string, number>;
  current: string | undefined;
  onPick: (key: string) => void;
  foot: string;
}) {
  const zig = notes.filter((note) => note.currency === "ZWG");
  const dollars = notes.filter((note) => note.currency === "USD");
  if (!zig.length) return <CountTable notes={dollars} counts={counts} current={current} onPick={onPick} foot={foot} />;
  return (
    <div className="tally-two">
      <CountTable notes={dollars} counts={counts} current={current} onPick={onPick} foot={foot} slim />
      <CountTable notes={zig} counts={counts} current={current} onPick={onPick} foot={foot} slim />
    </div>
  );
}

/** The keypad side of a count: the note being counted, how many, the keys, then the screen's one key. */
function CountSide({ note, typed, onKey, disabled, children }: { note: CountNote | undefined; typed: string; onKey: (key: KeypadKey) => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <aside className="shift-side" aria-label="Counting">
      <h2 className="shift-side-t">{note ? countNoteName(note) : "Counting"}</h2>
      <div className="shift-fig">
        <span className="k">How many</span>
        <span className="v" aria-live="polite">
          {typed}
        </span>
      </div>
      <Keypad onKey={onKey} disabled={disabled} />
      <div className="shift-foot">{children}</div>
    </aside>
  );
}

/** The orange key a screen ends in: the words, the amount when there is one, and ↵. */
function GoKey({ children, amount, disabled, busy, onClick }: { children: React.ReactNode; amount?: string; disabled?: boolean; busy?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="take-key" disabled={disabled || busy} aria-busy={busy || undefined} onClick={onClick}>
      {children}
      {amount ? <span className="num">{amount}</span> : null}
      {disabled ? null : (
        <span className="kbd on-primary" aria-hidden="true">
          ↵
        </span>
      )}
    </button>
  );
}

/* ─── Open the shift ─────────────────────────────────────────────────── */

/**
 * Open the shift (T6-1): the float counted note by note into the drawer, US$
 * and ZiG where the shop counts a ZiG float (W-37), then Open (↵). The till's
 * sell screen shows it while no shift is open here, and so does Shift.
 */
export function OpenShiftScreen() {
  const { context } = useTill();
  const { requestSignOut } = useSignOut();
  const queryClient = useQueryClient();
  // Whether the shop counts a ZiG float (W-37).
  const defaults = useQuery({
    queryKey: ["retail-pos-shift-defaults"],
    queryFn: async () => (await fetchJson<{ data: { float: string; hint: string; takesZig: boolean; zigFloat: string } }>("/api/v2/retail/pos/shifts/new")).data,
    staleTime: 0,
  });
  const takesZig = Boolean(defaults.data?.takesZig);
  const notes = React.useMemo(() => countNotes(takesZig), [takesZig]);
  const [counts, setCounts] = React.useState<Record<string, number>>({});
  const [at, setAt] = React.useState(0);
  const float = countedIn(notes, counts, "USD");
  const zigFloat = countedIn(notes, counts, "ZWG");
  const open = useMutation({
    mutationFn: () =>
      fetchJson("/api/v2/retail/pos/shifts", {
        method: "POST",
        body: JSON.stringify({ openingFloat: float.toFixed(2), ...(takesZig ? { openingFloatZig: zigFloat.toFixed(2) } : {}) }),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["retail-current-shift"] }),
  });
  const keys = useCountKeys({
    notes,
    counts,
    setCounts,
    at,
    setAt,
    onEnter: () => {
      if (!open.isPending) open.mutate();
    },
  });
  const today = weekdayDayMonth(new Date());

  return (
    <div className="shift-bench">
      <main className="shift-main" aria-label="Open the shift">
        <div className="shift-h">
          <h1>Open the shift</h1>
          <span className="sub">
            {context?.nextShiftNo ? (
              <>
                <span className="num">{context.nextShiftNo}</span> ·{" "}
              </>
            ) : null}
            {context?.till.name ? `${context.till.name} · ` : ""}
            {today}
          </span>
          <span className="end">
            <button type="button" className="shift-back" onClick={() => requestSignOut()}>
              <UserSwitch className="ic" />
              Someone else
            </button>
          </span>
        </div>
        <CountTables notes={notes} counts={counts} current={keys.current?.key} onPick={(key) => setAt(notes.findIndex((note) => note.key === key))} foot="Float" />
      </main>
      <CountSide note={keys.current} typed={keys.typed} onKey={keys.onKey} disabled={open.isPending}>
        {open.isError ? <ErrorLine large>{getApiErrorMessage(open.error)}</ErrorLine> : null}
        <GoKey amount={zigFloat > 0 ? `${usd(float)} · ZiG ${zigFloat.toFixed(2)}` : usd(float)} busy={open.isPending} onClick={() => open.mutate()}>
          {zigFloat > 0 ? "Open" : "Open the shift"}
        </GoKey>
      </CountSide>
    </div>
  );
}

/* ─── The shift ──────────────────────────────────────────────────────── */

/** A shift just closed: its number, the drawer's difference and what was expected, the held sales it ended, and the fiscal day it closed (SET-08). */
type Closed = { shiftNo: string; variance: number; expected: number; held: number; fiscalDay: number | null; takings: number; sales: number };

export function ShiftScreen() {
  const { shiftHere, shiftLoading } = useTill();
  const [step, setStep] = React.useState<"shift" | "count" | "check">("shift");
  const [counts, setCounts] = React.useState<Record<string, number>>({});
  const [closed, setClosed] = React.useState<Closed | null>(null);

  if (closed) return <ClosedScreen {...closed} />;
  if (shiftLoading) {
    return (
      <div className="shift-bench" aria-busy="true">
        <main className="shift-main">
          <span className="skeleton is-lede" />
        </main>
        <aside className="shift-side" aria-label="Cash in or out" />
      </div>
    );
  }
  if (!shiftHere) return <OpenShiftScreen />;
  if (step === "count") return <CountScreen counts={counts} setCounts={setCounts} onBack={() => setStep("shift")} onNext={() => setStep("check")} />;
  if (step === "check") {
    return <CheckScreen counts={counts} onBack={() => setStep("count")} onClosed={(result) => setClosed(result)} />;
  }
  return <ShiftRecord onCashUp={() => setStep("count")} />;
}

function ShiftRecord({ onCashUp }: { onCashUp: () => void }) {
  const { shiftHere, context } = useTill();
  const { data: session } = useSession();
  const held = useHeldSummary();
  const movements = useMovements(shiftHere?.id);
  const shift = shiftHere!;
  const name = session?.user?.name ?? "You";
  const moves = [...(movements.data?.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  // Each tender but cash that took money, in the payment screen's order.
  const takes = (context?.tenders ?? []).map((entry) => entry.tender).filter((tender) => tender !== "CASH");
  const byTender = (Object.entries(shift.nonCashByTender) as Array<[keyof typeof shift.nonCashByTender, number]>)
    .filter(([, amount]) => Math.abs(amount) > 0.004)
    .sort(([a], [b]) => (takes.includes(a) ? takes.indexOf(a) : takes.length) - (takes.includes(b) ? takes.indexOf(b) : takes.length));

  return (
    <div className="shift-bench">
      <main className="shift-main" aria-label="Shift">
        <div className="shift-h">
          <h1>Shift</h1>
          <span className="sub">
            <span className="num">{shift.shiftNo}</span> · {name} · since <span className="num">{hhmm(shift.openedAt)}</span>
          </span>
          <span className="end">
            <button type="button" className="shift-back" onClick={onCashUp}>
              <Money className="ic" />
              Cash up
            </button>
          </span>
        </div>
        <div className="shift-stats">
          <Stat k="Taken" v={usd(Number(shift.netSalesValue))} />
          <Stat k="Cash" v={usd(Number(shift.cashSales))} />
          <Stat k="Sales" v={whole(shift.saleCount)} />
          {byTender.map(([tender, amount]) => (
            <Stat key={tender} k={paymentLabel(tender)} v={usd(amount)} />
          ))}
          {held.count ? <Stat k="Held" v={`${whole(held.count)} · ${usd(held.total)}`} /> : null}
        </div>
        <div className="shift-log">
          {moves.map((movement) => {
            const verb = movement.type === "DROP_TO_SAFE" ? "moved" : movement.type === "FLOAT_TOP_UP" ? "brought in" : "paid out";
            const bundle = bundleText(movement);
            return (
              <div key={movement.id} className="shift-log-r">
                <span className="g">
                  {movement.type === "DROP_TO_SAFE" ? <Vault className="ic" /> : movement.type === "FLOAT_TOP_UP" ? <Coins className="ic" /> : <HandCoins className="ic" />}
                </span>
                <span>
                  <b>{firstName(movement.recordedByName ?? name)}</b> {verb} <span className="num">{usd(movement.amount)}</span>
                  {movement.type === "DROP_TO_SAFE" ? " to the safe" : movement.type === "FLOAT_TOP_UP" ? " from the safe" : ""}
                  {`, ${movement.reason || cashMovementWhy(movement.type, movement.reasonCode).toLowerCase()}`}
                  {movement.approvedByName && movement.approvedByName !== movement.recordedByName ? `, approved by ${movement.approvedByName}` : ""}
                  {bundle ? `, ${bundle}` : ""}
                </span>
                <time>{hhmm(movement.createdAt)}</time>
              </div>
            );
          })}
          {shift.refundCount || shift.voidCount ? (
            <div className="shift-log-r">
              <span className="g">
                <Receipt className="ic" />
              </span>
              <span>
                {count(shift.refundCount, "refund")}
                {shift.refundCount ? (
                  <>
                    , <span className="num">{usd(Number(shift.refundValue))}</span>
                  </>
                ) : null}
                ; {count(shift.voidCount, "void")}
              </span>
              <time />
            </div>
          ) : null}
          <div className="shift-log-r">
            <span className="g">
              <CashRegister className="ic" />
            </span>
            <span>
              <b>{firstName(name)}</b> opened the shift with a float of <span className="num">{usd(Number(shift.openingFloat))}</span>
            </span>
            <time>{hhmm(shift.openedAt)}</time>
          </div>
        </div>
      </main>
      <CashPanel />
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="shift-stat">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}

/* ─── Cash in or out ─────────────────────────────────────────────────── */

/**
 * Cash in or out (W-38), always open beside the shift: the way (a drop, petty
 * cash or a float top-up), the notes counted, or the amount typed, in US$ or
 * ZiG, and what it was for. Every movement is approved: someone who holds
 * `retail.cash-control:approve` approves their own; anyone else's goes through
 * the approval dialog with a manager's PIN.
 */
function CashPanel() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const dropAsked = useSearchParams().get("move") === "drop";
  const { toast } = useToast();
  const { shiftHere, context, approvers, isOffline } = useTill();
  const shift = shiftHere!;
  const takesZig = (context?.tenders ?? []).some((choice) => choice.tender === "CASH" && choice.currency === "ZWG");
  const [way, setWay] = React.useState<MoveWhy>("DROP");
  const [currency, setCurrency] = React.useState<CountCurrency>("USD");
  // The cell the keypad types into: a note's count, or the amount itself.
  const [at, setAt] = React.useState<string>(DENOMINATIONS.USD[0]);
  const [bundle, setBundle] = React.useState<Record<string, number>>({});
  const [typed, setTyped] = React.useState("");
  const [note, setNote] = React.useState("");
  const [problem, setProblem] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const ids = React.useId();
  const notes = DENOMINATIONS[currency];
  const counted = Number(notes.reduce((sum, denomination) => sum + Number(rowTotal({ denomination, count: bundle[denomination] ?? 0 })), 0).toFixed(2));
  const counting = counted > 0;
  const amount = counting ? counted : Number(typed || "0");
  const money = (value: number) => inCurrency(currency, value);
  const chosen = MOVE_WAYS.find((entry) => entry.why === way)!;
  const approval = useApproval({ approvers: approvers.cashControl, reason: `Cash ${chosen.direction === "OUT" ? "out" : "in"} ${money(amount)}` });

  const reset = () => {
    setBundle({});
    setTyped("");
    setNote("");
    setAt(DENOMINATIONS[currency][0]);
  };

  const save = () => {
    if (busy || isOffline) return;
    if (!amount) return setProblem("Count the notes that move.");
    if (way === "PETTY" && note.trim().length < 3) return setProblem("Say what it was for.");
    setProblem(null);
    setBusy(true);
    const body = {
      direction: chosen.direction,
      why: way,
      amount: amount.toFixed(2),
      currency,
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(counting ? { denominations: notes.map((denomination) => ({ denomination, count: bundle[denomination] ?? 0 })).filter((line) => line.count > 0) } : {}),
    };
    approval
      .run((approver) =>
        fetchJson(`/api/v2/retail/pos/shifts/${shift.id}/cash-movements`, {
          method: "POST",
          body: JSON.stringify({ ...body, ...(approver ? { approver } : {}) }),
        }),
      )
      .then((done) => {
        if (!done) return;
        void queryClient.invalidateQueries({ queryKey: ["retail-cash-movements"] });
        void queryClient.invalidateQueries({ queryKey: ["retail-current-shift"] });
        toast({ title: `${chosen.done(money(amount))}.`, variant: "success" });
        reset();
        if (dropAsked) router.replace(pathname);
      })
      .catch((error: unknown) => setProblem(getApiErrorMessage(error)))
      .finally(() => setBusy(false));
  };

  const onKey = (key: KeypadKey) => {
    if (at === "amount") {
      setBundle({});
      setTyped((current) => typeAmount(current, key));
      return;
    }
    const next = typeCount(String(bundle[at] || ""), key);
    if (next === null) return;
    setTyped("");
    setBundle({ ...bundle, [at]: next ? Number(next) : 0 });
  };
  useKeypadKeys(onKey, !approval.asking);
  const cells = [...notes, "amount"];
  useWindowKeys((event) => {
    if (approval.asking || inDialog(event.target)) return;
    if (event.key === "Enter") {
      event.preventDefault();
      save();
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.tagName === "INPUT") return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const step = event.key === "ArrowRight" ? 1 : -1;
      setAt(cells[Math.min(Math.max(cells.indexOf(at) + step, 0), cells.length - 1)]);
    }
  });

  return (
    <aside className="shift-side" aria-label="Cash in or out">
      <div className="shift-side-head">
        <h2 className="shift-side-t">Cash in or out</h2>
        {takesZig ? (
          <Segmented
            label="Currency"
            value={currency}
            options={[
              { value: "USD", label: "US$" },
              { value: "ZWG", label: "ZiG" },
            ]}
            onChange={(next) => {
              setCurrency(next);
              setBundle({});
              setTyped("");
              setAt(DENOMINATIONS[next][0]);
            }}
          />
        ) : null}
      </div>
      <div className="shift-ways" role="radiogroup" aria-label="Why">
        {MOVE_WAYS.map((entry) => (
          <button key={entry.why} type="button" role="radio" aria-checked={entry.why === way} onClick={() => setWay(entry.why)}>
            <entry.icon className="ic" />
            {entry.label}
          </button>
        ))}
      </div>
      <div className="shift-notes" role="group" aria-label="Notes">
        {notes.map((denomination) => {
          const label = currency === "ZWG" ? `ZiG ${denomination}` : noteLabel(denomination);
          return (
            <button key={denomination} type="button" aria-current={at === denomination || undefined} aria-label={`${label}: ${bundle[denomination] ?? 0}`} onClick={() => setAt(denomination)}>
              {bundle[denomination] ?? 0}
              <small>{label}</small>
            </button>
          );
        })}
        <button type="button" className="is-amount" aria-current={at === "amount" || undefined} onClick={() => setAt("amount")}>
          {counting ? counted.toFixed(2) : typed || "0.00"}
          <small>Amount</small>
        </button>
      </div>
      <Keypad onKey={onKey} left={at === "amount" ? "dot" : "none"} disabled={busy} />
      <input
        id={`${ids}n`}
        className="shift-note"
        aria-label={way === "PETTY" ? "What for" : "Note"}
        placeholder={way === "PETTY" ? "What for" : "Note"}
        maxLength={500}
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      <div className="shift-foot">
        {problem ? <ErrorLine large>{problem}</ErrorLine> : null}
        <GoKey
          amount={money(amount)}
          disabled={isOffline}
          busy={busy}
          onClick={save}
        >
          {chosen.verb}
        </GoKey>
      </div>
      {approval.dialog}
    </aside>
  );
}

/* ─── Cash up, 1: count by note, blind ───────────────────────────────── */

function CountScreen({
  counts,
  setCounts,
  onBack,
  onNext,
}: {
  counts: Record<string, number>;
  setCounts: (next: Record<string, number>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const { shiftHere } = useTill();
  const notes = useCountNotes();
  const [at, setAt] = React.useState(0);
  const keys = useCountKeys({ notes, counts, setCounts, at, setAt, onEnter: onNext });

  return (
    <div className="shift-bench">
      <main className="shift-main" aria-label="Count the drawer">
        <div className="shift-h is-nav">
          <button type="button" className="shift-back" onClick={onBack}>
            <CaretLeft className="ic" />
            Shift
          </button>
          <h1>Count the drawer</h1>
          <span className="end sub">
            <span className="num">{shiftHere?.shiftNo}</span> · 1 of 2
          </span>
        </div>
        <CountTables notes={notes} counts={counts} current={keys.current?.key} onPick={(key) => setAt(notes.findIndex((note) => note.key === key))} foot="Counted" />
      </main>
      <CountSide note={keys.current} typed={keys.typed} onKey={keys.onKey}>
        <GoKey onClick={onNext}>Next: the float</GoKey>
      </CountSide>
    </div>
  );
}

/* ─── Cash up, 2: the float left, then close (blind) ──────────────────── */

type CloseAnswer = {
  data: { shiftNo: string; difference: string; state: "BALANCED" | "SHORT" | "OVER"; fiscalDayClosed: number | null; takings: string; sales: number };
};

function CheckScreen({
  counts,
  onBack,
  onClosed,
}: {
  counts: Record<string, number>;
  onBack: () => void;
  onClosed: (result: Closed) => void;
}) {
  const queryClient = useQueryClient();
  const { shiftHere, context } = useTill();
  const shift = shiftHere!;
  const notes = useCountNotes();
  // "Close the fiscal day · With the last shift" (SET-08): said before, since only the server knows if it is the last.
  const closesDay = Boolean(context?.fiscal.deviceId && context.fiscal.dayNo !== null && context.fiscal.dayClose === "WITH_LAST_SHIFT");
  // Read while the shift is still open: closing ends its held sales.
  const held = useHeldSummary().count;
  const countedUsd = countedIn(notes, counts, "USD");
  const countedZig = countedIn(notes, counts, "ZWG");
  const [floatLeft, setFloatLeft] = React.useState(shift.floatLeft);
  const [note, setNote] = React.useState("");
  // The difference, once the server has said it: the count is blind until then.
  const [outBy, setOutBy] = React.useState<string | null>(null);
  const [problem, setProblem] = React.useState<{ field: "floatLeft" | "note" | null; message: string; asked: boolean } | null>(null);
  const noteRef = React.useRef<HTMLInputElement>(null);
  const id = React.useId();

  const close = useMutation({
    mutationFn: async () => {
      const lines = (currency: CountCurrency) =>
        notes.filter((entry) => entry.currency === currency).map((entry) => ({ denomination: entry.denomination, count: counts[entry.key] ?? 0 }));
      try {
        return await fetchJson<CloseAnswer>(`/api/v2/retail/pos/shifts/${shift.id}/close`, {
          method: "POST",
          body: JSON.stringify({
            counts: { USD: lines("USD"), ...(notes.some((entry) => entry.currency === "ZWG") ? { ZWG: lines("ZWG") } : {}) },
            floatLeft: floatLeft.trim() || "0",
            ...(note.trim() ? { note: note.trim() } : {}),
          }),
        });
      } catch (error) {
        // A blind count learns its difference here: the 400 that asks what happened carries it.
        const details = (error instanceof ApiError ? error.details : null) as { difference?: string; fieldErrors?: Record<string, string> } | null;
        if (details?.difference !== undefined) setOutBy(details.difference);
        const field = details?.fieldErrors?.note ? "note" : details?.fieldErrors?.floatLeft ? "floatLeft" : null;
        // The first ask says what "Out by" already says: the field it points at is enough.
        setProblem({ field, message: getApiErrorMessage(error), asked: details?.difference !== undefined && !note.trim() });
        if (field === "note") requestAnimationFrame(() => noteRef.current?.focus());
        throw error;
      }
    },
    onMutate: () => setProblem(null),
    onSuccess: (result) => {
      const variance = Number(result.data.difference);
      onClosed({
        shiftNo: result.data.shiftNo ?? shift.shiftNo,
        variance,
        expected: shift.expectedCash,
        held,
        fiscalDay: result.data.fiscalDayClosed ?? null,
        takings: Number(result.data.takings),
        sales: result.data.sales,
      });
      void queryClient.invalidateQueries({ queryKey: ["retail-current-shift"] });
    },
  });

  const out = outBy === null ? 0 : Number(outBy);
  // The float comes out of the US$ counted: said here, so a blind count never meets it after the difference.
  const closeNow = () => {
    if (close.isPending) return;
    const typed = floatLeft.trim() || "0";
    const tooMuch = /^\d+(\.\d{1,2})?$/.test(typed) ? floatLeftProblem(typed, countedUsd.toFixed(2)) : null;
    if (tooMuch) {
      setProblem({ field: "floatLeft", message: tooMuch, asked: false });
      return;
    }
    close.mutate();
  };
  useWindowKeys((event) => {
    if (event.key !== "Enter" || inDialog(event.target)) return;
    event.preventDefault();
    closeNow();
  });

  return (
    <div className="shift-page" aria-label="Close the shift">
      <div className="shift-h is-nav">
        <button type="button" className="shift-back" onClick={onBack}>
          <CaretLeft className="ic" />
          Count
        </button>
        <h1>Close the shift</h1>
        <span className="end sub">
          <span className="num">{shift.shiftNo}</span> · 2 of 2
        </span>
      </div>
      {outBy !== null ? (
        <p className="shift-lede">
          Out by <span className={Math.abs(out) < 0.005 ? "num" : "num is-bad"}>{signedUsd(out)}</span>
        </p>
      ) : null}
      <div className="shift-fields">
        <div className="shift-field">
          <span className="label">Counted</span>
          <div className="shift-box">
            <span className="num">{usd(countedUsd)}</span>
            {countedZig > 0 ? (
              <small>
                and <span className="num">ZiG {countedZig.toFixed(2)}</span>
              </small>
            ) : null}
          </div>
        </div>
        <div className="shift-field">
          <label htmlFor={`${id}f`}>Float left for tomorrow</label>
          <div className="shift-input is-money">
            <small>US$</small>
            <input
              id={`${id}f`}
              inputMode="decimal"
              aria-invalid={problem?.field === "floatLeft" || undefined}
              value={floatLeft}
              onChange={(event) => setFloatLeft(event.target.value)}
            />
          </div>
        </div>
      </div>
      {outBy !== null ? (
        <div className="shift-field is-wide">
          <label htmlFor={id}>What happened</label>
          <div className="shift-input">
            <input ref={noteRef} id={id} aria-invalid={(problem?.field === "note" && !problem.asked) || undefined} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
          </div>
        </div>
      ) : null}
      {closesDay ? (
        <p className="shift-fact">
          <Stamp className="ic" />
          Fiscal day <span className="num">{context?.fiscal.dayNo}</span> closes with the shop&apos;s last shift
        </p>
      ) : null}
      {problem && !problem.asked ? <ErrorLine large>{problem.message}</ErrorLine> : null}
      <div className="shift-acts">
        <button type="button" className="shift-btn" onClick={onBack}>
          <ArrowsClockwise className="ic" />
          Count again
        </button>
        <button type="button" className="shift-btn is-go" disabled={close.isPending} aria-busy={close.isPending || undefined} onClick={closeNow}>
          <Check className="ic" />
          Close the shift
          <span className="kbd on-primary" aria-hidden="true">
            ↵
          </span>
        </button>
      </div>
    </div>
  );
}

/* ─── Closed ─────────────────────────────────────────────────────────── */

function ClosedScreen({ shiftNo, variance, expected, held, fiscalDay, takings, sales }: Closed) {
  const { context } = useTill();
  const { data: session } = useSession();
  const { requestSignOut } = useSignOut();
  const name = session?.user?.name ?? "You";
  const matched = Math.abs(variance) < 0.005;
  useWindowKeys((event) => {
    if (event.key !== "Enter" || inDialog(event.target)) return;
    event.preventDefault();
    requestSignOut();
  });
  return (
    <div className="shift-done">
      <main className="shift-done-main" aria-label="Shift closed">
        <span className="shift-done-mark" aria-hidden="true">
          <Vault className="ic" />
        </span>
        <h1>
          Shift <span className="num">{shiftNo}</span> closed
        </h1>
        <dl className="facts">
          <div className="fact">
            <Receipt className="ic" aria-hidden="true" />
            <dt>{count(sales, "sale")}</dt>
            <dd>{usd(takings)}</dd>
          </div>
          <div className="fact">
            <Money className="ic" aria-hidden="true" />
            <dt>Cash expected</dt>
            <dd>{usd(expected)}</dd>
          </div>
          {matched ? (
            <div className="fact">
              <Check className="ic" aria-hidden="true" />
              <dt>Matched</dt>
              <dd>{usd(0)}</dd>
            </div>
          ) : (
            <>
              <div className="fact is-bad">
                <WarningCircle className="ic" aria-hidden="true" />
                <dt>{variance < 0 ? "Short" : "Over"}</dt>
                <dd>{usd(Math.abs(variance))}</dd>
              </div>
              <div className="fact">
                <UserRound className="ic" aria-hidden="true" />
                <dt>Signs it off</dt>
                <dd className="is-name">{context?.signOff ? firstName(context.signOff.name) : "A manager"}</dd>
              </div>
            </>
          )}
          {held ? (
            <div className="fact">
              <PauseCircle className="ic" aria-hidden="true" />
              <dt>Held sales ended</dt>
              <dd>{whole(held)}</dd>
            </div>
          ) : null}
          {fiscalDay !== null ? (
            <div className="fact">
              <Stamp className="ic" aria-hidden="true" />
              <dt>Fiscal day closed</dt>
              <dd>{fiscalDay}</dd>
            </div>
          ) : null}
        </dl>
      </main>
      <aside className="shift-done-side" aria-label={name}>
        <Avatar name={name} image={session?.user?.image} size={40} />
        <div className="who">{name}</div>
        <div className="sub">
          {context?.till.name ? `${context.till.name} · ` : ""}
          {weekdayDayMonth(new Date())}
        </div>
        <GoKey onClick={() => requestSignOut()}>Who&apos;s selling next?</GoKey>
      </aside>
    </div>
  );
}
