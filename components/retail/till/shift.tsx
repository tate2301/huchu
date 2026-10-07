"use client";

/**
 * The shift: what happened to the drawer, with cash-up as the one action.
 * Cash up counts the notes blind (US$, and ZiG where the shop takes it), asks
 * for the float left for tomorrow, then closes through the same `closeShift`
 * as the back office (FLR-04): the difference shows only once the server
 * has it, and a drawer out by more than US$1.00 comes back asking what
 * happened. Closing ends the session: the till goes back to "Who is
 * selling?" and stays paired. The cash-drop prompt lands here with
 * `?move=drop`, and Move cash opens on "To the safe".
 */

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { ArrowsClockwise, CaretLeft, CaretRight, CashRegister, Check, Minus, Money, Plus, Vault, X } from "@/lib/icons";
import {
  getCashDenominations,
  cashMovementWhy,
  type RetailCashMovementReasonCode,
  type RetailCashMovementTypeName,
} from "@/lib/retail/cash-movements";
import { DENOMINATIONS, floatLeftProblem, rowTotal, type CountCurrency } from "@/lib/retail/floor/count";
import { count, dayMonth, hhmm, pairedWhen, usd, whole } from "./format";
import { Empty, ErrorLine, GateSide, Keypad, Segmented, TillDialog, useKeypadKeys, useWindowKeys, type KeypadKey } from "./parts";
import { ManagerFields, useManagerPin } from "./manager-pin";
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

/** The till's three: no "Pay a supplier" (98-decisions C-33); packet 60 brings the shared approval dialog. */
type MoveWhy = "DROP" | "TOP_UP" | "PETTY";
const MOVE_WAYS: Array<{ why: MoveWhy; direction: "OUT" | "IN"; label: string; action: (amount: number) => string }> = [
  { why: "DROP", direction: "OUT", label: "To the safe", action: (amount) => `Move ${usd(amount)} to the safe` },
  { why: "TOP_UP", direction: "IN", label: "In from the safe", action: (amount) => `Bring ${usd(amount)} in from the safe` },
  { why: "PETTY", direction: "OUT", label: "Petty cash", action: (amount) => `Pay out ${usd(amount)}` },
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

/** The notes the drawer is counted in: US$, then ZiG where the shop takes ZiG cash. Counts are keyed "USD:20". */
type CountNote = { key: string; currency: CountCurrency; denomination: string };

function useCountNotes(): CountNote[] {
  const { context } = useTill();
  const takesZig = (context?.tenders ?? []).some((choice) => choice.tender === "CASH" && choice.currency === "ZWG");
  return (["USD", "ZWG"] as const)
    .filter((currency) => currency === "USD" || takesZig)
    .flatMap((currency) => DENOMINATIONS[currency].map((denomination) => ({ key: `${currency}:${denomination}`, currency, denomination })));
}

const countNoteLabel = (note: CountNote) => (note.currency === "ZWG" ? `ZiG ${note.denomination}` : noteLabel(note.denomination));

function countedIn(notes: CountNote[], counts: Record<string, number>, currency: CountCurrency): number {
  return notes
    .filter((note) => note.currency === currency)
    .reduce((sum, note) => sum + Number(rowTotal({ denomination: note.denomination, count: counts[note.key] ?? 0 })), 0);
}

/** A shift just closed: its number, the drawer's difference, the held sales it ended, and the fiscal day it closed (SET-08). */
type Closed = { shiftNo: string; variance: number; held: number; fiscalDay: number | null };

export function ShiftScreen() {
  const { shiftHere, shiftLoading, context } = useTill();
  const [step, setStep] = React.useState<"shift" | "count" | "check" | "closed">("shift");
  const [counts, setCounts] = React.useState<Record<string, number>>({});
  const [closed, setClosed] = React.useState<Closed | null>(null);

  if (closed) return <ClosedScreen {...closed} />;
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
            const verb = movement.type === "DROP_TO_SAFE" ? "moved" : movement.type === "FLOAT_TOP_UP" ? "brought in" : "paid out";
            const bundle = bundleText(movement);
            return (
              <div key={movement.id} className="ev">
                <span className="ev-dot">
                  <Vault className="ic" />
                </span>
                <div className="ev-text">
                  <b>{movement.recordedByName ?? name}</b> {verb} <b className="nowrap">{usd(movement.amount)}</b>
                  {movement.type === "DROP_TO_SAFE" ? " to the safe" : movement.type === "FLOAT_TOP_UP" ? " from the safe" : ""}
                  {`, ${movement.reason || cashMovementWhy(movement.type, movement.reasonCode).toLowerCase()}`}
                  {movement.approvedByName && movement.approvedByName !== movement.recordedByName ? `, approved by ${movement.approvedByName}` : ""}
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
  const { shiftHere, context, canApprove } = useTill();
  const shift = shiftHere!;
  const notes = getCashDenominations(shift.baseCurrency ?? "USD") ?? [];
  const [way, setWay] = React.useState<MoveWhy>("DROP");
  const [bundle, setBundle] = React.useState<Record<string, number>>({});
  const [note, setNote] = React.useState("");
  const [problem, setProblem] = React.useState<string | null>(null);
  // FLR-03: every movement is approved; someone who cannot approve it picks a manager, who types their PIN.
  const manager = useManagerPin(canApprove ? null : "A manager has to approve this.");
  const ids = React.useId();
  const amount = Number(notes.reduce((sum, denomination) => sum + Number(denomination) * (bundle[denomination] ?? 0), 0).toFixed(2));
  const chosen = MOVE_WAYS.find((entry) => entry.why === way)!;

  const save = useMutation({
    mutationFn: () =>
      fetchJson(`/api/v2/retail/pos/shifts/${shift.id}/cash-movements`, {
        method: "POST",
        body: JSON.stringify({
          direction: chosen.direction,
          why: way,
          amount: amount.toFixed(2),
          currency: "USD",
          ...(note.trim() ? { note: note.trim() } : {}),
          denominations: notes.map((denomination) => ({ denomination, count: bundle[denomination] ?? 0 })).filter((line) => line.count > 0),
          ...manager.approver(),
        }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["retail-cash-movements"] });
      void queryClient.invalidateQueries({ queryKey: ["retail-current-shift"] });
      onClose();
    },
    onError: (error) => setProblem(manager.refused(error)),
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
            disabled={save.isPending || !manager.ready}
            aria-busy={save.isPending || undefined}
            onClick={() => {
              if (!amount) return setProblem("Count the notes that move.");
              if (way === "PETTY" && note.trim().length < 3) return setProblem("Say what it was for.");
              setProblem(null);
              save.mutate();
            }}
          >
            <Check className="ic" />
            {chosen.action(amount)}
          </button>
        </>
      }
    >
      <Segmented
        label="Which way"
        className="self-start"
        value={way}
        options={MOVE_WAYS.map((entry) => ({ value: entry.why, label: entry.label }))}
        onChange={(next) => setWay(next)}
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
      <div className="field">
        <label htmlFor={`${ids}n`}>
          {way === "PETTY" ? "What for" : "Note"} {way === "PETTY" ? null : <span className="opt">optional</span>}
        </label>
        <input
          id={`${ids}n`}
          className="input input-lg"
          value={note}
          placeholder={way === "PETTY" ? "Cleaning materials, for example" : undefined}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      <ManagerFields fields={manager} ids={ids} />
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
  const notes = useCountNotes();
  const [at, setAt] = React.useState(0);
  const current = notes[at];
  const typed = String(current ? (counts[current.key] ?? "") : "");
  const countedUsd = countedIn(notes, counts, "USD");
  const countedZig = countedIn(notes, counts, "ZWG");

  const onKey = (key: KeypadKey) => {
    if (!current) return;
    let next = typed;
    if (key.kind === "delete") next = typed.slice(0, -1);
    else if (key.kind === "clear") next = "";
    else if (key.kind === "digit" && typed.length < 5) next = typed === "0" ? key.value : typed + key.value;
    else return;
    setCounts({ ...counts, [current.key]: next ? Number(next) : 0 });
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
            {notes.map((note, index) => {
              const n = counts[note.key] ?? 0;
              const comes = Number(rowTotal({ denomination: note.denomination, count: n }));
              return (
                <tr
                  key={note.key}
                  className="is-pickable"
                  aria-current={index === at || undefined}
                  onClick={() => setAt(index)}
                >
                  <td>
                    <span className="cell-lead num text-left">
                      {countNoteLabel(note)}
                    </span>
                  </td>
                  <td className="num ink weight-500">
                    {n}
                  </td>
                  <td className={`num${n ? "" : " muted"}`}>{n ? (note.currency === "ZWG" ? `ZiG ${comes.toFixed(2)}` : usd(comes)) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>Counted</td>
              <td />
              <td className="num">
                {usd(countedUsd)}
                {countedZig > 0 ? ` and ZiG ${countedZig.toFixed(2)}` : ""}
              </td>
            </tr>
          </tfoot>
        </table>
      </main>
      <aside className="bench-side" aria-label="Counting">
        <div className="bar">
          <h1>{current ? `${countNoteLabel(current)} notes` : "Counting"}</h1>
        </div>
        <div className="rail-body">
          <div className="tender">
            <span className="l">How many</span>
            <span className="tender-figure">{typed || "0"}</span>
          </div>
          <Keypad onKey={onKey} />
          <div className="grow" />
          <p className="note">
            Count the notes without looking at the till. The difference shows once you close. Card and mobile money need no counting.
          </p>
          <button type="button" className="btn btn-primary btn-touch btn-block" onClick={onNext}>
            <Check className="ic" />
            Next: the float
          </button>
        </div>
      </aside>
    </div>
  );
}

/* ─── Cash up, 2: the float left, then close (blind) ──────────────────── */

type CloseAnswer = { data: { shiftNo: string; difference: string; state: "BALANCED" | "SHORT" | "OVER"; fiscalDayClosed: number | null } };

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
  const [problem, setProblem] = React.useState<{ field: "floatLeft" | "note" | null; message: string } | null>(null);
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
        setProblem({ field, message: getApiErrorMessage(error) });
        if (field === "note") requestAnimationFrame(() => noteRef.current?.focus());
        throw error;
      }
    },
    onMutate: () => setProblem(null),
    onSuccess: (result) => {
      onClosed({
        shiftNo: result.data.shiftNo ?? shift.shiftNo,
        variance: Number(result.data.difference),
        held,
        fiscalDay: result.data.fiscalDayClosed ?? null,
      });
      void queryClient.invalidateQueries({ queryKey: ["retail-current-shift"] });
    },
  });

  const out = outBy === null ? 0 : Number(outBy);
  // The float comes out of the US$ counted: said here, so a blind count never meets it after the difference.
  const closeNow = () => {
    const typed = floatLeft.trim() || "0";
    const tooMuch = /^\d+(\.\d{1,2})?$/.test(typed) ? floatLeftProblem(typed, countedUsd.toFixed(2)) : null;
    if (tooMuch) {
      setProblem({ field: "floatLeft", message: tooMuch });
      return;
    }
    close.mutate();
  };

  return (
    <div className="main is-scroll">
      <div className="bar">
        <button type="button" className="btn btn-quiet" onClick={onBack}>
          <CaretLeft className="ic" />
          Count
        </button>
        <h1>Close the shift</h1>
        <div className="end">
          <span className="note">
            <span className="num">{shift.shiftNo}</span> · 2 of 2
          </span>
        </div>
      </div>
      <div className="page">
        <p className="lede-figure">
          {outBy === null ? (
            <>
              You counted <span className="num">{usd(countedUsd)}</span>
              {countedZig > 0 ? (
                <>
                  {" "}and <span className="num">ZiG {countedZig.toFixed(2)}</span>
                </>
              ) : null}
              .{" "}
              <span className="q">The difference shows once you close.</span>
            </>
          ) : (
            <>
              {out < 0 ? "Short by" : "Over by"} <span className="num">{usd(Math.abs(out))}</span>.{" "}
              <span className="q">Say what happened, then close.</span>
            </>
          )}
        </p>
        <div className="field">
          <label htmlFor={`${id}f`}>Float left for tomorrow</label>
          <input
            id={`${id}f`}
            className="input input-lg num text-left"
            inputMode="decimal"
            aria-invalid={problem?.field === "floatLeft" || undefined}
            value={floatLeft}
            onChange={(event) => setFloatLeft(event.target.value)}
          />
          <span className="help">In US$ notes, left in the drawer. The rest goes to the safe.</span>
        </div>
        {outBy !== null ? (
          <div className="field">
            <label htmlFor={id}>What happened</label>
            <input
              ref={noteRef}
              id={id}
              className="input input-lg"
              aria-invalid={problem?.field === "note" || undefined}
              placeholder="For example: gave change for US$20 instead of US$10"
              maxLength={500}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <span className="help">A manager signs it off.</span>
          </div>
        ) : null}
        {closesDay ? (
          <p className="help">
            If no other shift is open in the shop, fiscal day <span className="num">{context?.fiscal.dayNo}</span> closes with this
            one and its report goes to ZIMRA.
          </p>
        ) : null}
        {problem ? <ErrorLine large>{problem.message}</ErrorLine> : null}
        <div className="actions">
          <button type="button" className="btn btn-lg" onClick={onBack}>
            <ArrowsClockwise className="ic" />
            Count again
          </button>
          <button type="button" className="btn btn-primary btn-lg" disabled={close.isPending} aria-busy={close.isPending || undefined} onClick={closeNow}>
            <Check className="ic" />
            Close the shift
          </button>
        </div>
      </div>
    </div>
  );
}

function ClosedScreen({ shiftNo, variance, held, fiscalDay }: Closed) {
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
            {fiscalDay !== null ? (
              <>
                {" "}Fiscal day <span className="num">{fiscalDay}</span> closed with it.
              </>
            ) : null}
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

