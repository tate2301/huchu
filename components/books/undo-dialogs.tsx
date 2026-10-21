"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";

import { Button, Icon, Input, Kit, Person, type IconName } from "@/components/core";
import type { MenuEntry } from "@/components/core/menu";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { bulkDeleteWord, REASON_MAX, REASON_MIN, REVISABLE, UNDO_NOUN, type BulkResult, type UndoChoices, type UndoKind, type UndoRights } from "@/lib/books/core/undo-rules";
import { deleteRuleRows, leadOf, outcomes, sharedWhy, voidWill, type Outcome, type Will } from "@/lib/books/core/undo-ui";

import { BkState, downloadCsv } from "./bk-list";

/**
 * Undo on Books' screens (books-final §4.1, §2.5, §5.13; P4): the record
 * page's Void, Revise and Delete permanently (BkVoidDialog, BkReviseDialog,
 * BkDeleteDialog), a list's bulk Void and Delete permanently, and the bulk
 * result (BkBulkResult). Each asks the core what this person may do
 * (`undoChoices`, `undoRights`); the server checks every row again.
 */

/* ── The dialog ───────────────────────────────────────────────────────── */

/** The boards' dialog (`.dialog.bk-dlg`): a head with Close, a body, a foot with its actions; centred over the scrim. */
export function BkDialog({
  open,
  onOpenChange,
  title,
  width = 520,
  busy = false,
  children,
  foot,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  width?: number;
  busy?: boolean;
  children: React.ReactNode;
  foot: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}>
      <Dialog.Portal>
        <Kit contents>
          <div className="sc-bk-b" style={{ display: "contents" }}>
            <Dialog.Overlay className="bk-dim" style={{ position: "fixed", zIndex: 80, padding: "var(--space-16)" }}>
              <Dialog.Content
                className="dialog bk-dlg"
                style={{ width, maxWidth: "100%", maxHeight: "calc(100dvh - 32px)" }}
                aria-describedby={undefined}
                onPointerDownOutside={(event) => (busy ? event.preventDefault() : undefined)}
                // Focus starts in the first field (the reason), not on Close.
                onOpenAutoFocus={(event) => {
                  const field = (event.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>("textarea, input:not([type=checkbox])");
                  if (!field) return;
                  event.preventDefault();
                  field.focus();
                }}
              >
                <div className="dialog-head">
                  <Dialog.Title asChild>
                    <h2>{title}</h2>
                  </Dialog.Title>
                  <div className="end">
                    <Dialog.Close asChild>
                      <Button variant="quiet" iconOnly icon="x" label="Close" disabled={busy} />
                    </Dialog.Close>
                  </div>
                </div>
                <div className="dialog-body" style={{ overflowY: "auto", minHeight: 0 }}>
                  {children}
                </div>
                <div className="dialog-foot" style={{ flexWrap: "wrap" }}>
                  <span style={{ flex: 1 }} />
                  {foot}
                </div>
              </Dialog.Content>
            </Dialog.Overlay>
          </div>
        </Kit>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** What happens, one line each, its icon at the top of the line (`.bk-what`). */
export function What({ items }: { items: Array<{ icon: IconName; text: React.ReactNode }> }) {
  if (!items.length) return null;
  return (
    <div className="bk-what">
      {items.map((item, index) => (
        <div key={index}>
          <Icon name={item.icon} />
          <span>{item.text}</span>
        </div>
      ))}
    </div>
  );
}

/** What happens, each line under its label: Credit note, Posting, Payments (the design's `k-will`). */
function WillList({ items }: { items: Will[] }) {
  if (!items.length) return null;
  return (
    <ol className="bk-will">
      {items.map((item) => (
        <li key={item.label}>
          <b>{item.label}</b>
          <span>{item.text}</span>
        </li>
      ))}
    </ol>
  );
}

/** A refusal: its fact in bold, the rest after it, one band (the design's `k-note is-bad`). */
function Refusal({ text }: { text: string }) {
  const { lead, rest } = leadOf(text);
  return (
    <div className="bk-warn bad" role="alert">
      <Icon name="block" />
      <span>
        <b>{lead}</b>
        {rest ? ` ${rest}` : ""}
      </span>
    </div>
  );
}

function ReasonField({ id, value, onChange, error, disabled }: { id: string; value: string; onChange: (value: string) => void; error: string | null; disabled: boolean }) {
  return (
    <div className="bk-fld">
      <label className="bk-lab" htmlFor={id}>
        Reason
      </label>
      <Input id={id} maxLength={REASON_MAX} value={value} disabled={disabled} autoComplete="off" aria-invalid={error ? true : undefined} onChange={(event) => onChange(event.target.value)} />
      {error ? (
        <span role="alert" style={{ fontSize: 12, color: "var(--color-danger)" }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

const SHORT = `${REASON_MIN} to ${REASON_MAX} characters.`;

function TypedField({ id, word, value, onChange, disabled }: { id: string; word: string; value: string; onChange: (value: string) => void; disabled: boolean }) {
  return (
    <div className="bk-fld">
      <label className="bk-lab" htmlFor={id}>
        To confirm, type <span className="mono">{word}</span>
      </label>
      <Input id={id} value={value} disabled={disabled} autoComplete="off" spellCheck={false} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

const Failed = ({ error }: { error: string | null }) =>
  error ? (
    <p role="alert" style={{ color: "var(--color-danger)", margin: 0 }}>
      {error}
    </p>
  ) : null;

/** Runs a dialog's action: the reason checked first, busy while it runs, the server's refusal shown in the dialog. */
function useRun() {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const run = async (work: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (caught) {
      setError(getApiErrorMessage(caught, fallback));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

const PAST: Record<UndoKind, string> = {
  invoice: "issued",
  "credit-note": "issued",
  receipt: "recorded",
  quote: "sent",
  bill: "recorded",
  "debit-note": "issued",
  payment: "paid",
  "purchase-order": "sent",
  requisition: "paid out",
  claim: "approved",
  voucher: "posted",
  journal: "posted",
  "bank-entry": "posted",
  "retail-sale": "rung up",
  layby: "taken",
  "school-fee-invoice": "issued",
  "school-fee-receipt": "recorded",
};

/** The credit note's reason as ZIMRA's credit note states it (§4.4). The design draws one Reason, so a void states Cancellation. */
const NOTE_REASON = "Cancellation";

/* ── One document ─────────────────────────────────────────────────────── */

export type UndoDone = { label: string; detail?: string; draft?: { kind: string; id: string; label: string } };

/** BkVoidDialog (design: bk-void): the reason, then what the void does line by line. */
export function VoidDialog({ choices, open, onOpenChange, onDone, amount }: { choices: UndoChoices; open: boolean; onOpenChange: (open: boolean) => void; onDone: (done: UndoDone) => void | Promise<void>; /** The document's total, as the page writes it ("$1,750.00"), for the credit note's sentence. */ amount?: string }) {
  const [reason, setReason] = React.useState("");
  const [missing, setMissing] = React.useState<string | null>(null);
  const { busy, error, setError, run } = useRun();
  const invoice = choices.kind === "invoice";
  React.useEffect(() => {
    if (open) return;
    setReason("");
    setMissing(null);
    setError(null);
  }, [open, setError]);

  const go = () => {
    if (reason.trim().length < REASON_MIN) return setMissing(SHORT);
    setMissing(null);
    void run(async () => {
      const text = invoice ? `${NOTE_REASON}: ${reason.trim()}` : reason.trim();
      const done = await fetchJson<UndoDone>(`/api/books/core/${choices.kind}/${choices.id}`, { method: "POST", body: JSON.stringify({ action: "void", reason: text.slice(0, REASON_MAX) }) });
      onOpenChange(false);
      await onDone(done);
    }, "It was not voided. Nothing was changed; try again.");
  };

  const refused = !choices.void.allowed ? choices.void.why : null;
  const lead = invoice
    ? `Voiding issues a full credit note${amount ? ` for ${amount}` : ""}${choices.fiscalised ? ", signed on the fiscal device against the original" : ""}. ${choices.label} stays, marked void.`
    : `${choices.label} stays, marked void.`;
  return (
    <BkDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      title={`Void ${choices.label}`}
      foot={
        <>
          <Button disabled={busy} shortcut="Esc" onClick={() => onOpenChange(false)}>
            Keep it
          </Button>
          <Button variant="danger" icon="x" shortcut="Ctrl ↵" busy={busy} disabled={busy || !choices.void.allowed} onClick={go}>
            {invoice ? "Void with a credit note" : `Void ${choices.label}`}
          </Button>
        </>
      }
    >
      {refused ? <Refusal text={refused} /> : null}
      <p>{lead}</p>
      <ReasonField id={`void-why-${choices.id}`} value={reason} onChange={setReason} error={missing} disabled={busy} />
      <WillList items={voidWill(choices)} />
      <Failed error={error} />
    </BkDialog>
  );
}

/** BkReviseDialog (design: bk-revise): a posted document is never edited in place; Revise voids it and opens a new draft linked to it (D7). */
export function ReviseDialog({ choices, open, onOpenChange, onRevised }: { choices: UndoChoices; open: boolean; onOpenChange: (open: boolean) => void; onRevised: (done: Required<Pick<UndoDone, "draft">> & UndoDone) => void | Promise<void> }) {
  const [reason, setReason] = React.useState("");
  const [missing, setMissing] = React.useState<string | null>(null);
  const { busy, error, setError, run } = useRun();
  const noun = UNDO_NOUN[choices.kind].noun;
  const verb = PAST[choices.kind];
  React.useEffect(() => {
    if (open) return;
    setReason("");
    setMissing(null);
    setError(null);
  }, [open, setError]);

  const go = () => {
    if (reason.trim().length < REASON_MIN) return setMissing(SHORT);
    setMissing(null);
    void run(async () => {
      const done = await fetchJson<Required<Pick<UndoDone, "draft">> & UndoDone>(`/api/books/core/${choices.kind}/${choices.id}`, { method: "POST", body: JSON.stringify({ action: "revise", reason: reason.trim() }) });
      onOpenChange(false);
      await onRevised(done);
    }, "It was not revised. Nothing was changed; try again.");
  };

  const refused = !choices.revise.allowed ? choices.revise.why : null;
  const items: Will[] = [{ label: choices.label, text: `Void, reads “Replaced by” its new ${noun}` }];
  if (choices.kind === "invoice") items.push({ label: "Credit note", text: `${choices.nextNote ?? "A credit note"}${choices.fiscalised ? ", signed on FDMS" : ""}` });
  items.push({ label: `New ${noun}`, text: `A draft with the same lines. It takes its number when it is ${verb}` });
  if (choices.onAccount.length) items.push({ label: "Payments", text: `${choices.onAccount.join(", ")} ${choices.onAccount.length === 1 ? "moves" : "move"} to the new ${noun} when it is ${verb}` });
  if (choices.kind === "bill") items.push({ label: "Input VAT", text: "Claimed once its FTI is Valid" });
  return (
    <BkDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      title={`Revise ${choices.label}`}
      foot={
        <>
          <Button disabled={busy} shortcut="Esc" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" icon="edit" shortcut="Ctrl ↵" busy={busy} disabled={busy || !choices.revise.allowed} onClick={go}>
            Void and revise
          </Button>
        </>
      }
    >
      {refused ? <Refusal text={refused} /> : null}
      <ReasonField id={`revise-why-${choices.id}`} value={reason} onChange={setReason} error={missing} disabled={busy} />
      <WillList items={items} />
      <Failed error={error} />
    </BkDialog>
  );
}

/** What a permanent delete keeps, under its label. */
function keepsWill(text: string): Will {
  if (/snapshot/i.test(text)) return { label: "Snapshot", text };
  if (/number/i.test(text)) return { label: "Number", text };
  return { label: "Payments", text };
}

/**
 * BkDeleteDialog (design: bk-delete-permanent, bk-delete-refused): a draft goes
 * at once; anything posted is the owner's, with a reason and its number typed;
 * a refusal says why and how to go on, with the four rules checked against it.
 */
export function DeleteDialog({ choices, open, onOpenChange, onDeleted, onVoid }: { choices: UndoChoices; open: boolean; onOpenChange: (open: boolean) => void; onDeleted: (done: UndoDone & { draft?: unknown }) => void | Promise<void>; /** Opens Void, the way forward from a refused delete. */ onVoid?: () => void }) {
  const [reason, setReason] = React.useState("");
  const [typed, setTyped] = React.useState("");
  const [missing, setMissing] = React.useState<string | null>(null);
  const { busy, error, setError, run } = useRun();
  const permanent = choices.delete.permanent;
  const typedOk = !permanent || typed.trim().toUpperCase() === choices.label.toUpperCase();
  React.useEffect(() => {
    if (open) return;
    setReason("");
    setTyped("");
    setMissing(null);
    setError(null);
  }, [open, setError]);

  const go = () => {
    if (permanent && reason.trim().length < REASON_MIN) return setMissing(SHORT);
    if (!typedOk) return;
    setMissing(null);
    void run(async () => {
      const done = await fetchJson<UndoDone>(`/api/books/core/${choices.kind}/${choices.id}`, { method: "DELETE", body: JSON.stringify(permanent ? { reason: reason.trim(), confirm: typed.trim() } : {}) });
      onOpenChange(false);
      await onDeleted(done);
    }, "It was not deleted. Nothing was changed; try again.");
  };

  if (!choices.delete.allowed) {
    const rules = deleteRuleRows(choices);
    const way = choices.void.allowed && onVoid;
    return (
      <BkDialog
        open={open}
        onOpenChange={onOpenChange}
        title={`${choices.label} can’t be deleted`}
        foot={
          <>
            <Button shortcut="Esc" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            {way ? (
              <Button
                variant="primary"
                icon="x"
                onClick={() => {
                  onOpenChange(false);
                  onVoid();
                }}
              >
                {choices.kind === "invoice" ? "Void with a credit note" : `Void ${choices.label}`}
              </Button>
            ) : null}
          </>
        }
      >
        <Refusal text={choices.delete.why ?? `${choices.label} can’t be deleted.`} />
        {rules ? (
          <table className="table bk-dense" aria-label="When delete is refused" style={{ boxShadow: "var(--shadow-ring)", borderRadius: 8, overflow: "hidden" }}>
            <thead>
              <tr>
                <th>Delete is refused when</th>
                <th style={{ width: 80 }}>Here</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((row) => (
                <tr key={row.rule}>
                  <td>{row.rule}</td>
                  <td>{row.here === "yes" ? <BkState tone="danger">Yes</BkState> : <span className="muted">{row.here === "no" ? "No" : "—"}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </BkDialog>
    );
  }

  const foot = (
    <>
      <Button disabled={busy} shortcut="Esc" onClick={() => onOpenChange(false)}>
        {permanent ? "Keep it" : "Cancel"}
      </Button>
      <Button variant="danger" icon="x" busy={busy} disabled={busy || !typedOk} onClick={go}>
        {permanent ? "Delete permanently" : "Delete the draft"}
      </Button>
    </>
  );
  if (!permanent) {
    return (
      <BkDialog open={open} onOpenChange={onOpenChange} busy={busy} title={`Delete ${choices.label}`} foot={foot} width={460}>
        <Failed error={error} />
      </BkDialog>
    );
  }
  return (
    <BkDialog open={open} onOpenChange={onOpenChange} busy={busy} title={`Delete ${choices.label} permanently`} foot={foot} width={500}>
      <WillList items={[{ label: "Removed", text: `${choices.label}, its lines and every entry it posted` }, ...choices.keeps.map(keepsWill)]} />
      <ReasonField id={`delete-why-${choices.id}`} value={reason} onChange={setReason} error={missing} disabled={busy} />
      <TypedField id={`delete-typed-${choices.id}`} word={choices.label} value={typed} onChange={setTyped} disabled={busy} />
      <Failed error={error} />
    </BkDialog>
  );
}

/* ── A record page's ▾ menu ───────────────────────────────────────────── */

type Move = "void" | "revise" | "delete";

/**
 * Void, Revise and Delete permanently for one document's ▾ menu, as the
 * core's `undoChoices` says: offered and pressable when allowed, faint with
 * the reason on hover when not (rule 12). `?action=void|revise|delete` (or the
 * older `?do=`) in the address opens that dialog once the choices are read.
 */
export function useUndoMenu(kind: UndoKind, id: string | null | undefined, handlers: { onVoided?: (done: UndoDone) => void | Promise<void>; onRevised?: (done: Required<Pick<UndoDone, "draft">> & UndoDone) => void | Promise<void>; onDeleted?: (done: UndoDone) => void | Promise<void>; initial?: string | null; /** The document's total as the page writes it, for a void's credit note. */ amount?: string }) {
  const choices = useQuery({
    queryKey: ["books", "undo", kind, id],
    queryFn: () => fetchJson<UndoChoices>(`/api/books/core/${kind}/${id}`),
    enabled: Boolean(id),
  });
  const [open, setOpen] = React.useState<Move | null>(null);
  const opened = React.useRef(false);
  const data = choices.data;
  React.useEffect(() => {
    if (opened.current || !data) return;
    const wanted = handlers.initial ?? new URLSearchParams(window.location.search).get("action");
    if (!wanted) return;
    opened.current = true;
    if (wanted === "void" || wanted === "revise" || wanted === "delete") setOpen(wanted);
  }, [data, handlers.initial]);

  const entries: MenuEntry[] = [];
  if (data) {
    const item = (move: Move, label: string, icon: IconName, danger: boolean, may: { allowed: boolean; why: string | null }): MenuEntry =>
      may.allowed ? { key: move, icon, label, danger, onSelect: () => setOpen(move) } : { key: move, icon, label, danger, disabled: true, title: may.why ?? undefined, onSelect: () => undefined };
    if (data.status === "posted") {
      if (REVISABLE.has(kind)) entries.push(item("revise", "Revise", "edit", false, data.revise));
      entries.push({ separator: true });
      entries.push(item("void", "Void", "x", true, data.void));
    } else {
      entries.push({ separator: true });
    }
    entries.push(item("delete", data.delete.permanent ? "Delete permanently" : "Delete the draft", "x", true, data.delete));
  }

  const refresh = () => choices.refetch();
  const node = data ? (
    <>
      <VoidDialog
        choices={data}
        amount={handlers.amount}
        open={open === "void"}
        onOpenChange={(next) => setOpen(next ? "void" : null)}
        onDone={async (done) => {
          await refresh();
          await handlers.onVoided?.(done);
        }}
      />
      {REVISABLE.has(kind) ? (
        <ReviseDialog
          choices={data}
          open={open === "revise"}
          onOpenChange={(next) => setOpen(next ? "revise" : null)}
          onRevised={async (done) => {
            await refresh();
            await handlers.onRevised?.(done);
          }}
        />
      ) : null}
      <DeleteDialog choices={data} open={open === "delete"} onOpenChange={(next) => setOpen(next ? "delete" : null)} onDeleted={async (done) => handlers.onDeleted?.(done)} onVoid={() => setOpen("void")} />
    </>
  ) : null;
  return { entries, node, choices: data, open: setOpen, refresh };
}

/* ── A list's selection ───────────────────────────────────────────────── */

/** One selected row, as a list knows it. The amount is the list's; the result names the party beside the number. */
export type BulkRow = { id: string; label: string; posted: boolean; party?: string; amount?: string };

type BulkMode = "void" | "delete";
type BulkAnswer = BulkResult & { summary: string };

const VERB: Record<BulkMode, { now: string; past: string }> = { void: { now: "Void", past: "voided" }, delete: { now: "Delete", past: "deleted" } };

/** How many rows are checked ahead before a permanent delete: beyond it the core checks each row as it goes. */
const PREFLIGHT_MAX = 100;

/** What delete would do with each row, read from the core's own answer for it (`undoChoices`): who goes, and who is refused and why. */
function usePreflight(kind: UndoKind, rows: BulkRow[], active: boolean) {
  const [state, setState] = React.useState<{ ok: BulkRow[]; refused: Array<BulkRow & { why: string }> } | null>(null);
  React.useEffect(() => {
    if (!active) return;
    setState(null);
    if (rows.length > PREFLIGHT_MAX) {
      setState({ ok: rows, refused: [] });
      return;
    }
    let stop = false;
    const found = new Map<string, { allowed: boolean; why: string | null }>();
    const queue = [...rows];
    const worker = async () => {
      for (let row = queue.shift(); row && !stop; row = queue.shift()) {
        try {
          const choices = await fetchJson<UndoChoices>(`/api/books/core/${kind}/${row.id}`);
          found.set(row.id, { allowed: choices.delete.allowed, why: choices.delete.why });
        } catch {
          // The core decides again when it runs; a row that could not be read goes forward.
          found.set(row.id, { allowed: true, why: null });
        }
      }
    };
    void Promise.all([worker(), worker(), worker(), worker()]).then(() => {
      if (stop) return;
      setState({
        ok: rows.filter((row) => found.get(row.id)?.allowed !== false),
        refused: rows.filter((row) => found.get(row.id)?.allowed === false).map((row) => ({ ...row, why: found.get(row.id)?.why ?? "It cannot be deleted." })),
      });
    });
    return () => {
      stop = true;
    };
  }, [kind, rows, active]);
  return state;
}

/** Void or Delete permanently over a selection: one reason for all, and "delete N" typed for the N that will go. */
function BulkUndoDialog({ kind, mode, rows, open, onOpenChange, onDone }: { kind: UndoKind; mode: BulkMode; rows: BulkRow[]; open: boolean; onOpenChange: (open: boolean) => void; onDone: (answer: BulkAnswer, reason: string) => void }) {
  const [reason, setReason] = React.useState("");
  const [typed, setTyped] = React.useState("");
  const [missing, setMissing] = React.useState<string | null>(null);
  const { busy, error, setError, run } = useRun();
  const noun = UNDO_NOUN[kind];
  const pre = usePreflight(kind, rows, mode === "delete" && open);
  const going = mode === "delete" ? (pre?.ok ?? []) : rows;
  const refused = mode === "delete" ? (pre?.refused ?? []) : [];
  const n = going.length;
  const word = bulkDeleteWord(n);
  const checking = mode === "delete" && pre === null;
  const typedOk = mode !== "delete" || typed.trim().toLowerCase() === word;
  React.useEffect(() => {
    if (open) return;
    setReason("");
    setTyped("");
    setMissing(null);
    setError(null);
  }, [open, setError]);

  const go = () => {
    if (reason.trim().length < REASON_MIN) return setMissing(SHORT);
    if (!typedOk || n === 0) return;
    setMissing(null);
    void run(async () => {
      const answer = await fetchJson<BulkAnswer>(`/api/books/core/${kind}/bulk/${mode}`, {
        method: "POST",
        body: JSON.stringify({ ids: going.map((row) => row.id), reason: reason.trim(), ...(mode === "delete" ? { confirm: typed.trim() } : {}) }),
      });
      const turned = refused.map((row) => ({ id: row.id, label: row.label, why: row.why }));
      onOpenChange(false);
      onDone({ ...answer, skipped: [...answer.skipped, ...turned] }, reason.trim());
    }, "Nothing was changed; try again.");
  };

  const many = `${rows.length} ${rows.length === 1 ? noun.noun : noun.plural}`;
  const will: Will[] =
    kind === "invoice"
      ? [
          { label: "Credit note", text: "One for each issued invoice, signed where it was" },
          { label: "Posting", text: "Each reversed, dated today" },
          { label: "Payments", text: "Stay on account" },
        ]
      : [
          { label: "Posting", text: "Each reversed, dated today" },
          ...(kind === "bill" ? [{ label: "Payments", text: "Stay on account" }] : []),
        ];
  return (
    <BkDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      width={mode === "delete" ? 680 : 520}
      title={mode === "void" ? `Void ${many}` : `Delete ${many} permanently`}
      foot={
        <>
          <Button disabled={busy} shortcut="Esc" onClick={() => onOpenChange(false)}>
            {mode === "void" ? "Cancel" : "Keep them"}
          </Button>
          <Button variant={mode === "void" ? "primary" : "danger"} icon="x" shortcut={mode === "void" ? "Ctrl ↵" : undefined} busy={busy || checking} disabled={busy || checking || !typedOk || n === 0} onClick={go}>
            {mode === "void" ? `Void ${n}` : `Delete ${n} permanently`}
          </Button>
        </>
      }
    >
      {mode === "delete" ? (
        <p>
          Deleting removes each {noun.noun}, its lines, every entry it posted and its sub-ledger lines, as if it had never been posted. A full copy of each is kept in the audit trail. The numbers are never used again.
        </p>
      ) : null}
      {mode === "delete" && pre ? (
        <div className="bk-tray">
          <div className="bk-brr">
            <BkState tone="success">Deleted</BkState>
            <span className="mono">{n}</span>
            <span className="why">Open month, not fiscalised, nothing reconciled</span>
          </div>
          {refused.length ? (
            <div className="bk-brr">
              <BkState tone="danger">Refused</BkState>
              <span className="mono">{refused.length}</span>
              <span className="why">{sharedWhy(refused)}</span>
            </div>
          ) : null}
        </div>
      ) : null}
      {mode === "delete" ? <TypedField id={`bulk-typed-${kind}`} word={word} value={typed} onChange={setTyped} disabled={busy || checking} /> : null}
      <ReasonField id={`bulk-why-${kind}`} value={reason} onChange={setReason} error={missing} disabled={busy} />
      {mode === "void" ? <WillList items={will} /> : null}
      <Failed error={error} />
    </BkDialog>
  );
}

const OUTCOME: Record<Exclude<Outcome, "done">, { word: string; tone: Parameters<typeof BkState>[0]["tone"] }> = {
  unchanged: { word: "Unchanged", tone: "plain" },
  skipped: { word: "Skipped", tone: "warning" },
  refused: { word: "Refused", tone: "danger" },
};

type ResultFocus = "all" | "skipped" | "refused";

/** BkBulkResult (design: bk-bulk-result): the four words with their counts, then each refused or skipped row with why; refusals can be tried again. */
export function BulkResultDialog({ answer, rows, reason, open, onOpenChange, onRetry, retrying = false }: { answer: BulkAnswer; rows: BulkRow[]; reason?: string; open: boolean; onOpenChange: (open: boolean) => void; onRetry?: (ids: string[]) => void; retrying?: boolean }) {
  const noun = UNDO_NOUN[answer.kind];
  const byId = new Map(rows.map((row) => [row.id, row]));
  const all = outcomes(answer);
  const total = all.length;
  const past = answer.action === "void" ? "voided" : answer.action === "delete" ? "deleted" : "done";
  const [focus, setFocus] = React.useState<ResultFocus>("all");
  const group = (outcome: Outcome) => all.filter((row) => row.outcome === outcome);
  const done = group("done");
  const unchanged = group("unchanged");
  const skipped = group("skipped");
  const refused = group("refused");
  const shown = all.filter((row) => (focus === "all" ? row.outcome === "skipped" || row.outcome === "refused" : row.outcome === focus));
  const party = rows.some((row) => row.party);
  const head = noun.noun.charAt(0).toUpperCase() + noun.noun.slice(1);
  const wordDone = past.charAt(0).toUpperCase() + past.slice(1);
  const doneWhy = answer.action === "void" ? (answer.kind === "invoice" ? "Each through a credit note." : "Each posting is reversed, dated today.") : "A full copy of each is kept in the audit trail.";
  const skippedWhy = answer.action === "void" && skipped.every((row) => /draft/i.test(row.why)) ? "Drafts are deleted, not voided. Select them under Drafts." : sharedWhy(skipped);
  const draftWord = (label: string) => /^draft /i.test(label);
  return (
    <BkDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${total} selected, ${done.length} ${past}`}
      width={760}
      foot={
        <Button variant="primary" icon="check" shortcut="↵" onClick={() => onOpenChange(false)}>
          Done
        </Button>
      }
    >
      {reason ? (
        <p>
          One reason for all: <span className="muted">“{reason}”</span>
        </p>
      ) : null}
      <div className="bk-tray">
        <div className="bk-brr">
          <BkState tone="success">{wordDone}</BkState>
          <span className="mono">{done.length}</span>
          <span className="why">{doneWhy}</span>
        </div>
        {unchanged.length ? (
          <div className="bk-brr">
            <BkState tone="plain">Unchanged</BkState>
            <span className="mono">{unchanged.length}</span>
            <span className="why">{sharedWhy(unchanged).replace(/^[^.]*is void already\./i, "Already void.")}</span>
          </div>
        ) : null}
        {skipped.length ? (
          <div className="bk-brr">
            <BkState tone="warning">Skipped</BkState>
            <span className="mono">{skipped.length}</span>
            <span className="why">{skippedWhy}</span>
            <Button icon="eye" onClick={() => setFocus("skipped")}>{`Show the ${skipped.length}`}</Button>
          </div>
        ) : null}
        {refused.length ? (
          <div className="bk-brr">
            <BkState tone="danger">Refused</BkState>
            <span className="mono">{refused.length}</span>
            <span className="why">{sharedWhy(refused)}</span>
            {onRetry ? (
              <Button icon="run" busy={retrying} disabled={retrying} onClick={() => onRetry(refused.map((row) => row.id))}>{`Retry ${refused.length}`}</Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {skipped.length + refused.length > 0 ? (
        <>
          <div className="bk-sh">
            <h2>Refused and skipped</h2>
            <span className="n">{skipped.length + refused.length}</span>
            <Button
              variant="quiet"
              icon="export"
              onClick={() =>
                downloadCsv(
                  `${answer.kind}-${answer.action}-not-done.csv`,
                  [head, "Result", "Why"],
                  [...refused, ...skipped].map((row) => [row.label, OUTCOME[row.outcome as Exclude<Outcome, "done">].word, row.why]),
                )
              }
            >
              Export the list
            </Button>
          </div>
          <div className="bk-tw">
            <table className="table bk-dense" aria-label="Refused and skipped" style={{ tableLayout: "fixed", width: "100%" }}>
              <colgroup>
                <col style={{ width: 130 }} />
                {party ? <col style={{ width: 190 }} /> : null}
                <col style={{ width: 110 }} />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th>{head}</th>
                  {party ? <th>{answer.kind === "bill" || answer.kind === "payment" || answer.kind === "debit-note" ? "Supplier" : "Customer"}</th> : null}
                  <th>Result</th>
                  <th>Why</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((line) => {
                  const row = byId.get(line.id);
                  const outcome = OUTCOME[line.outcome as Exclude<Outcome, "done">];
                  return (
                    <tr key={line.id}>
                      <td>
                        {draftWord(line.label) ? (
                          <span className="muted">No number</span>
                        ) : (
                          <span className="ref truncate" style={{ display: "block" }} title={line.label}>
                            {line.label}
                          </span>
                        )}
                      </td>
                      {party ? (
                        <td className="truncate">
                          {row?.party ? answer.kind === "bill" || answer.kind === "payment" || answer.kind === "debit-note" ? <span className="truncate">{row.party}</span> : <Person name={row.party} className="truncate" /> : null}
                        </td>
                      ) : null}
                      <td>
                        <BkState tone={outcome.tone}>{outcome.word}</BkState>
                      </td>
                      <td className="muted truncate" title={line.why}>
                        {line.why}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </BkDialog>
  );
}

/**
 * A list's bulk Void and Delete permanently (§5.13): offered only when the
 * person's role allows (`undoRights`), each row done on its own on the
 * server, and the result shown row by row.
 */
export function useBulkUndo(kind: UndoKind, onChanged?: () => void | Promise<void>) {
  const rights = useQuery({ queryKey: ["books", "rights", kind], queryFn: () => fetchJson<UndoRights>(`/api/books/core/rights?kind=${kind}`), staleTime: 60_000 });
  const [asking, setAsking] = React.useState<{ mode: BulkMode; rows: BulkRow[] } | null>(null);
  const [shown, setShown] = React.useState<{ answer: BulkAnswer; rows: BulkRow[]; reason: string } | null>(null);
  const [retrying, setRetrying] = React.useState(false);
  const noun = UNDO_NOUN[kind];

  const entries = (rows: BulkRow[]): MenuEntry[] => {
    const may = rights.data;
    if (!may || rows.length === 0) return [];
    const posted = rows.filter((row) => row.posted).length;
    const many = `${rows.length} ${rows.length === 1 ? noun.noun : noun.plural}`;
    const out: MenuEntry[] = [];
    if (may.void) {
      out.push(
        posted
          ? { key: "void", icon: "x", danger: true, label: `Void ${many}`, onSelect: () => setAsking({ mode: "void", rows }) }
          : { key: "void", icon: "x", danger: true, label: `Void ${many}`, disabled: true, title: "None of these is posted: a draft is deleted, not voided.", onSelect: () => undefined },
      );
    }
    if (may.deletePosted) out.push({ key: "delete-permanently", icon: "x", danger: true, label: `Delete ${many} permanently`, onSelect: () => setAsking({ mode: "delete", rows }) });
    return out;
  };

  // A void's refusals are tried again as they are, with the reason already given; a delete asks again, as it wants its word typed.
  const retry = async (ids: string[]) => {
    if (!shown) return;
    if (shown.answer.action !== "void") {
      const again = shown.rows.filter((row) => ids.includes(row.id));
      setShown(null);
      setAsking({ mode: "delete", rows: again });
      return;
    }
    setRetrying(true);
    try {
      const next = await fetchJson<BulkAnswer>(`/api/books/core/${kind}/bulk/void`, { method: "POST", body: JSON.stringify({ ids, reason: shown.reason }) });
      const again = new Set(ids);
      const keep = <T extends { id: string }>(list: T[]) => list.filter((row) => !again.has(row.id));
      setShown({
        ...shown,
        answer: { ...shown.answer, done: [...shown.answer.done, ...next.done], skipped: [...keep(shown.answer.skipped), ...next.skipped], failed: [...keep(shown.answer.failed), ...next.failed] },
      });
      await onChanged?.();
    } catch {
      // The rows stay as they were; the button is there to try again.
    } finally {
      setRetrying(false);
    }
  };

  const node = (
    <>
      {asking ? (
        <BulkUndoDialog
          kind={kind}
          mode={asking.mode}
          rows={asking.rows}
          open
          onOpenChange={(next) => (next ? undefined : setAsking(null))}
          onDone={(answer, reason) => {
            setShown({ answer, rows: asking.rows, reason });
            void onChanged?.();
          }}
        />
      ) : null}
      {shown ? <BulkResultDialog answer={shown.answer} rows={shown.rows} reason={shown.reason} open retrying={retrying} onOpenChange={(next) => (next ? undefined : setShown(null))} onRetry={(ids) => void retry(ids)} /> : null}
    </>
  );
  return { entries, node, rights: rights.data ?? null, verb: VERB };
}
