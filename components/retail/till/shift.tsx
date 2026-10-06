"use client";

/**
 * The shift: what happened to the drawer, with cash-up as the one action.
 * Cash up counts the notes blind, then shows what the till expected beside
 * what was counted, then closes. Closing ends the session: the till goes back
 * to "Who is selling?" and stays paired. The cash-drop prompt lands here with
 * `?move=drop`, and Move cash opens on "To the safe".
 */

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { ArrowsClockwise, CaretLeft, CaretRight, CashRegister, Check, Minus, Money, Plus, Vault, X } from "@/lib/icons";
import {
  getCashDenominations,
  RETAIL_CASH_MOVEMENT_REASON_LABELS,
  RETAIL_CASH_MOVEMENT_REASONS,
  type RetailCashMovementReasonCode,
  type RetailCashMovementTypeName,
} from "@/lib/retail/cash-movements";
import { count, dayMonth, hhmm, pairedWhen, usd, whole } from "./format";
import { Empty, ErrorLine, GateSide, Keypad, Segmented, TillDialog, useKeypadKeys, useWindowKeys, type KeypadKey } from "./parts";
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
  createdAt: string;
};

const MOVE_WAYS: Array<{ type: RetailCashMovementTypeName; label: string; verb: string; action: (amount: number) => string }> = [
  { type: "DROP_TO_SAFE", label: "To the safe", verb: "moved", action: (amount) => `Move ${usd(amount)} to the safe` },
  { type: "FLOAT_TOP_UP", label: "In from the safe", verb: "brought in", action: (amount) => `Bring ${usd(amount)} in from the safe` },
  { type: "PAYOUT", label: "Paid out", verb: "paid out", action: (amount) => `Pay out ${usd(amount)}` },
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

export function ShiftScreen() {
  const { shiftHere, shiftLoading, context } = useTill();
  const [step, setStep] = React.useState<"shift" | "count" | "check" | "closed">("shift");
  const [counts, setCounts] = React.useState<Record<string, number>>({});
  const [closed, setClosed] = React.useState<{ shiftNo: string; variance: number; held: number } | null>(null);

  if (closed) return <ClosedScreen shiftNo={closed.shiftNo} variance={closed.variance} held={closed.held} />;
  if (shiftLoading) {
    return (
      <div className="main is-grow" aria-busy="true">
        <div className="bar">
          <h1>Shift</h1>
        </div>
        <div className="finding">
          <span className="skeleton is-lede" />
        </div>
      </div>
    );
  }
  if (!shiftHere) {
    return (
      <div className="main is-grow">
        <div className="bar">
          <h1>Shift</h1>
        </div>
        <Empty icon={CashRegister} title={`No shift is open on ${context?.till.name ?? "this till"}`}>
          Open one from the till: count the float into the drawer and the shift starts.
        </Empty>
      </div>
    );
  }
  if (step === "count") return <CountScreen counts={counts} setCounts={setCounts} onBack={() => setStep("shift")} onNext={() => setStep("check")} />;
  if (step === "check") {
    return <CheckScreen counts={counts} onBack={() => setStep("count")} onClosed={(result) => setClosed(result)} />;
  }
  return <ShiftRecord onCashUp={() => setStep("count")} />;
}

function ShiftRecord({ onCashUp }: { onCashUp: () => void }) {
  const { shiftHere, context } = useTill();
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const held = useHeldSummary();
  const movements = useMovements(shiftHere?.id);
  // From the cash-drop prompt: the drop is the thing to do here.
  const dropAsked = useSearchParams().get("move") === "drop";
  const [moving, setMoving] = React.useState(dropAsked);
  const shift = shiftHere!;
  const closeMove = () => {
    setMoving(false);
    router.replace(pathname);
  };
  const name = session?.user?.name ?? "You";
  const moves = [...(movements.data?.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  // The feed is headed by the day of its newest line, so a shift past midnight reads right.
  const top = dayMonth(moves[0]?.createdAt ?? shift.openedAt);

  return (
    <div className="with-rail">
      <main className="main is-scroll">
        <div className="bar">
          <h1>Shift</h1>
        </div>
        <div className="rec-head">
          <div className="grow">
            <h1>Shift {shift.shiftNo}</h1>
            <p className="sub">
              {name} on {context?.till.name ?? shift.registerName} · open since {hhmm(shift.openedAt)}
            </p>
          </div>
          <div className="end">
            <div className="btn-group" role="group" aria-label="This shift">
              <button type="button" className="btn" onClick={() => setMoving(true)}>
                <Vault className="ic" />
                Move cash
              </button>
            </div>
            <button type="button" className="btn btn-primary" onClick={onCashUp}>
              <Money className="ic" />
              Cash up
            </button>
          </div>
        </div>
        <div className="feed lead-8">
          <div className="feed-day">{top === dayMonth(new Date()) ? "Today" : top}</div>
          {moves.map((movement) => {
            const way = MOVE_WAYS.find((entry) => entry.type === movement.type);
            const bundle = bundleText(movement);
            return (
              <div key={movement.id} className="ev">
                <span className="ev-dot">
                  <Vault className="ic" />
                </span>
                <div className="ev-text">
                  <b>{movement.recordedByName ?? name}</b> {way?.verb ?? "moved"} <b className="nowrap">{usd(movement.amount)}</b>
                  {movement.type === "DROP_TO_SAFE" ? " to the safe" : movement.type === "FLOAT_TOP_UP" ? " from the safe" : ""}
                  {movement.type === "PAYOUT" && movement.reason
                    ? ` to ${movement.reason}`
                    : `, ${movement.reason || RETAIL_CASH_MOVEMENT_REASON_LABELS[movement.reasonCode].toLowerCase()}`}
                  {bundle ? `, ${bundle}` : ""}
                </div>
                <time>{hhmm(movement.createdAt)}</time>
              </div>
            );
          })}
          <div className="ev">
            <span className="ev-dot is-money">
              <Money className="ic" />
            </span>
            <div className="ev-text">
              {count(shift.saleCount, "sale")}, <b className="nowrap">{usd(Number(shift.netSalesValue))}</b>
              {shift.refundCount || shift.voidCount
                ? `; ${count(shift.refundCount, "refund")}, ${count(shift.voidCount, "void")}`
                : ""}
            </div>
            <time>{count(shift.saleCount + shift.refundCount + shift.voidCount, "event")}</time>
          </div>
          <div className="ev end">
            <span className="ev-dot">
              <CashRegister className="ic" />
            </span>
            <div className="ev-text">
              <b>{name}</b> opened the shift with a float of <b className="nowrap">{usd(Number(shift.openingFloat))}</b>
            </div>
            <time>{hhmm(shift.openedAt)}</time>
          </div>
        </div>
      </main>
      <aside className="rail" aria-label="This shift">
        <section>
          <div className="sec-title">Taken</div>
          <div className="figure">{usd(Number(shift.netSalesValue))}</div>
          <dl className="attrs">
            <dt>Cash</dt>
            <dd className="num text-left">
              {usd(Number(shift.cashSales))}
            </dd>
            <dt>Card and mobile</dt>
            <dd className="num text-left">
              {usd(Number(shift.nonCashSales))}
            </dd>
            <dt>Held</dt>
            <dd>
              {held.count ? (
                <>
                  {whole(held.count)}, <span className="num">{usd(held.total)}</span>
                </>
              ) : (
                <span className="muted">None</span>
              )}
            </dd>
          </dl>
        </section>
        <section>
          <div className="sec-title">The drawer</div>
          <p className="note pretty">
            Counted blind at cash-up. What it should hold shows after the count.
          </p>
        </section>
      </aside>
      {moving ? <MoveCashDialog onClose={closeMove} /> : null}
    </div>
  );
}

/* ─── Move cash ──────────────────────────────────────────────────────── */

function MoveCashDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { shiftHere, context } = useTill();
  const shift = shiftHere!;
  const notes = getCashDenominations(shift.baseCurrency ?? "USD") ?? [];
  const [way, setWay] = React.useState<RetailCashMovementTypeName>("DROP_TO_SAFE");
  const [bundle, setBundle] = React.useState<Record<string, number>>({});
  const [reasonCode, setReasonCode] = React.useState<RetailCashMovementReasonCode>("CASH_LEVEL_TOO_HIGH");
  const [note, setNote] = React.useState("");
  const [problem, setProblem] = React.useState<string | null>(null);
  const ids = React.useId();
  const amount = Number(notes.reduce((sum, denomination) => sum + Number(denomination) * (bundle[denomination] ?? 0), 0).toFixed(2));
  const reasons = RETAIL_CASH_MOVEMENT_REASONS[way];

  const save = useMutation({
    mutationFn: () =>
      fetchJson(`/api/v2/retail/pos/shifts/${shift.id}/cash-movements`, {
        method: "POST",
        body: JSON.stringify({
          type: way,
          amount,
          reasonCode,
          reason: note.trim() || null,
          denominations: notes.map((denomination) => ({ denomination, count: bundle[denomination] ?? 0 })).filter((line) => line.count > 0),
        }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["retail-cash-movements"] });
      void queryClient.invalidateQueries({ queryKey: ["retail-current-shift"] });
      onClose();
    },
    onError: (error) => setProblem(getApiErrorMessage(error)),
  });

  return (
    <TillDialog
      open
      large
      compact
      onOpenChange={(open) => !open && onClose()}
      title="Move cash"
      meta={
        <>
          <span className="num">{shift.shiftNo}</span> · {context?.till.name}
        </>
      }
      foot={
        <>
          <span className="start">
            Comes to <span className="num ink weight-600">{usd(amount)}</span>
          </span>
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
              if (!amount) return setProblem("Count the notes that move.");
              if (reasonCode === "OTHER" && !note.trim()) return setProblem("Say what it was for.");
              setProblem(null);
              save.mutate();
            }}
          >
            <Check className="ic" />
            {MOVE_WAYS.find((entry) => entry.type === way)?.action(amount)}
          </button>
        </>
      }
    >
      <Segmented
        label="Which way"
        className="self-start"
        value={way}
        options={MOVE_WAYS.map((entry) => ({ value: entry.type, label: entry.label }))}
        onChange={(next) => {
          setWay(next);
          setReasonCode(RETAIL_CASH_MOVEMENT_REASONS[next][0]);
        }}
      />
      <div className="list is-framed">
        {notes.map((denomination) => {
          const value = bundle[denomination] ?? 0;
          return (
            <div key={denomination} className="row is-split">
              <span className="num text-left ink weight-500">
                {noteLabel(denomination)}
              </span>
              <span className="qty" role="group" aria-label={`${noteLabel(denomination)} notes`}>
                <button type="button" aria-label={`One fewer ${noteLabel(denomination)}`} disabled={!value} onClick={() => setBundle({ ...bundle, [denomination]: value - 1 })}>
                  <Minus className="ic" />
                </button>
                <span>{value}</span>
                <button type="button" aria-label={`One more ${noteLabel(denomination)}`} onClick={() => setBundle({ ...bundle, [denomination]: value + 1 })}>
                  <Plus className="ic" />
                </button>
              </span>
            </div>
          );
        })}
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor={`${ids}r`}>Why</label>
          <select id={`${ids}r`} className="select input-lg" value={reasonCode} onChange={(event) => setReasonCode(event.target.value as RetailCashMovementReasonCode)}>
            {reasons.map((code) => (
              <option key={code} value={code}>
                {RETAIL_CASH_MOVEMENT_REASON_LABELS[code]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${ids}n`}>
            {way === "PAYOUT" ? "To whom, for what" : "Note"} {reasonCode === "OTHER" ? null : <span className="opt">optional</span>}
          </label>
          <input id={`${ids}n`} className="input input-lg" value={note} onChange={(event) => setNote(event.target.value)} />
        </div>
      </div>
      {problem ? <ErrorLine>{problem}</ErrorLine> : null}
    </TillDialog>
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
  const notes = getCashDenominations(shiftHere?.baseCurrency ?? "USD") ?? [];
  const [at, setAt] = React.useState(0);
  const denomination = notes[at];
  const typed = String(counts[denomination] ?? "");
  const counted = notes.reduce((sum, value) => sum + Number(value) * (counts[value] ?? 0), 0);

  const onKey = (key: KeypadKey) => {
    if (!denomination) return;
    let next = typed;
    if (key.kind === "delete") next = typed.slice(0, -1);
    else if (key.kind === "clear") next = "";
    else if (key.kind === "digit" && typed.length < 5) next = typed === "0" ? key.value : typed + key.value;
    else return;
    setCounts({ ...counts, [denomination]: next ? Number(next) : 0 });
  };
  useKeypadKeys(onKey);
  useWindowKeys((event) => {
    if (event.key === "ArrowDown" || event.key === "Enter") {
      event.preventDefault();
      if (event.key === "Enter" && at === notes.length - 1) onNext();
      else setAt((current) => Math.min(current + 1, notes.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setAt((current) => Math.max(current - 1, 0));
    }
  });

  return (
    <div className="bench">
      <main className="main is-scroll">
        <div className="bar">
          <button type="button" className="btn btn-quiet" onClick={onBack}>
            <CaretLeft className="ic" />
            Shift
          </button>
          <h1>Count the drawer</h1>
          <div className="end">
            <span className="note">
              <span className="num">{shiftHere?.shiftNo}</span> · 1 of 2
            </span>
          </div>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Note</th>
              <th className="num">How many</th>
              <th className="num">Comes to</th>
            </tr>
          </thead>
          <tbody>
            {notes.map((value, index) => {
              const n = counts[value] ?? 0;
              return (
                <tr
                  key={value}
                  className="is-pickable"
                  aria-current={index === at || undefined}
                  onClick={() => setAt(index)}
                >
                  <td>
                    <span className="cell-lead num text-left">
                      {noteLabel(value)}
                    </span>
                  </td>
                  <td className="num ink weight-500">
                    {n}
                  </td>
                  <td className={`num${n ? "" : " muted"}`}>{n ? usd(Number(value) * n) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>Counted</td>
              <td />
              <td className="num">{usd(counted)}</td>
            </tr>
          </tfoot>
        </table>
      </main>
      <aside className="bench-side" aria-label="Counting">
        <div className="bar">
          <h1>{denomination ? `${noteLabel(denomination)} ${Number(denomination) < 1 ? "coins" : "notes"}` : "Counting"}</h1>
        </div>
        <div className="rail-body">
          <div className="tender">
            <span className="l">How many</span>
            <span className="tender-figure">{typed || "0"}</span>
          </div>
          <Keypad onKey={onKey} />
          <div className="grow" />
          <p className="note">
            Count first. What the till expected shows on the next step. Card and mobile money need no counting.
          </p>
          <button type="button" className="btn btn-primary btn-touch btn-block" onClick={onNext}>
            <Check className="ic" />
            Check against the till
          </button>
        </div>
      </aside>
    </div>
  );
}

/* ─── Cash up, 2: what the till expected beside what was counted ─────── */

function CheckScreen({
  counts,
  onBack,
  onClosed,
}: {
  counts: Record<string, number>;
  onBack: () => void;
  onClosed: (result: { shiftNo: string; variance: number; held: number }) => void;
}) {
  const queryClient = useQueryClient();
  const { shiftHere } = useTill();
  const shift = shiftHere!;
  const movements = useMovements(shift.id);
  // Read while the shift is still open: closing ends its held sales.
  const held = useHeldSummary().count;
  const notes = getCashDenominations(shift.baseCurrency ?? "USD") ?? [];
  const counted = Number(notes.reduce((sum, value) => sum + Number(value) * (counts[value] ?? 0), 0).toFixed(2));
  const expected = Number(shift.expectedCash);
  const list = movements.data?.data ?? [];
  const moved = list.reduce((sum, movement) => sum + movement.delta, 0);
  const cameIn = list.some((movement) => movement.type === "FLOAT_TOP_UP");
  const wentOut = list.some((movement) => movement.type !== "FLOAT_TOP_UP");
  const float = Number(shift.openingFloat);
  const takings = Number((expected - float - moved).toFixed(2));
  const variance = Number((counted - expected).toFixed(2));
  const [note, setNote] = React.useState("");
  const id = React.useId();

  const close = useMutation({
    mutationFn: () =>
      fetchJson<{ shiftNo: string; variance: number | string }>(`/api/v2/retail/pos/shifts/${shift.id}/close`, {
        method: "POST",
        body: JSON.stringify({ countedCash: counted, notes: note.trim() || null }),
      }),
    onSuccess: (result) => {
      onClosed({ shiftNo: result.shiftNo ?? shift.shiftNo, variance: Number(result.variance ?? variance), held });
      void queryClient.invalidateQueries({ queryKey: ["retail-current-shift"] });
    },
  });

  const verdict = Math.abs(variance) < 0.005 ? "Spot on." : variance < 0 ? <>Short by <span className="num">{usd(-variance)}</span>.</> : <>Over by <span className="num">{usd(variance)}</span>.</>;
  const closeLabel = Math.abs(variance) < 0.005 ? "Close shift" : variance < 0 ? `Close shift, short ${usd(-variance)}` : `Close shift, over ${usd(variance)}`;

  return (
    <div className="main is-scroll">
      <div className="bar">
        <button type="button" className="btn btn-quiet" onClick={onBack}>
          <CaretLeft className="ic" />
          Count
        </button>
        <h1>Check the difference</h1>
        <div className="end">
          <span className="note">
            <span className="num">{shift.shiftNo}</span> · 2 of 2
          </span>
        </div>
      </div>
      <div className="page">
        <p className="lede-figure">
          {verdict}{" "}
          <span className="q">
            The till expected {usd(expected)}; you counted {usd(counted)}.
          </span>
        </p>
        <dl className="attrs is-widest">
          <dt>Float</dt>
          <dd className="num text-left">
            {usd(float)}
          </dd>
          <dt>Cash takings, after change</dt>
          <dd className="num text-left">
            {usd(takings)}
          </dd>
          {Math.abs(moved) > 0.004 ? (
            <>
              <dt>{cameIn && wentOut ? "Moved in and out" : cameIn ? "In from the safe" : "To the safe and paid out"}</dt>
              <dd className="num text-left">
                {usd(moved)}
              </dd>
            </>
          ) : null}
          <dt>Expected</dt>
          <dd className="num text-left ink">
            {usd(expected)}
          </dd>
          <dt>Counted</dt>
          <dd className="num text-left ink">
            {usd(counted)}
          </dd>
        </dl>
        {Math.abs(variance) >= 0.005 ? (
          <div className="field">
            <label htmlFor={id}>
              What happened, if you know <span className="opt">optional</span>
            </label>
            <input id={id} className="input input-lg" aria-describedby={`${id}h`} value={note} onChange={(event) => setNote(event.target.value)} />
            <span id={`${id}h`} className="help">
              {`The manager sees this beside the ${variance < 0 ? "shortfall" : "difference"}.`}
            </span>
          </div>
        ) : null}
        {close.isError ? <ErrorLine large>{getApiErrorMessage(close.error)}</ErrorLine> : null}
        <div className="actions">
          <button type="button" className="btn btn-lg" onClick={onBack}>
            <ArrowsClockwise className="ic" />
            Count again
          </button>
          <button type="button" className="btn btn-primary btn-lg" disabled={close.isPending} aria-busy={close.isPending || undefined} onClick={() => close.mutate()}>
            <Check className="ic" />
            {closeLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ClosedScreen({ shiftNo, variance, held }: { shiftNo: string; variance: number; held: number }) {
  const { context } = useTill();
  const { requestSignOut } = useSignOut();
  const what =
    Math.abs(variance) < 0.005
      ? "The drawer matched the till."
      : `${variance < 0 ? "Short" : "Over"} ${usd(Math.abs(variance))}. A manager sees it in the back office and signs it off.`;
  return (
    <div className="gate is-over">
      <div className="gate-form">
        <div>
          <h1 className="text-display">
            Shift <span className="num">{shiftNo}</span> closed
          </h1>
          <p className="under">
            {what}
            {held ? ` The ${count(held, "held sale")} ended with the shift.` : ""}
          </p>
        </div>
        <button type="button" className="btn btn-primary btn-touch btn-block" onClick={() => requestSignOut()}>
          <CaretRight className="ic" />
          Who is selling next?
        </button>
      </div>
      <GateSide
        lede={context ? `${context.till.name} at ${context.site.name}.` : ""}
        quiet={context ? `Paired ${pairedWhen(context.device.pairedAt)} by ${context.device.pairedBy}.` : ""}
        step="done"
        till={context?.till.name}
      />
    </div>
  );
}

