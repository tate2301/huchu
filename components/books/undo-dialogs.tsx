"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";

import { Button, Icon, Input, Kit, TextArea, type IconName } from "@/components/core";
import type { MenuEntry } from "@/components/core/menu";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { bulkDeleteWord, REASON_MAX, REASON_MIN, REVISABLE, UNDO_NOUN, type BulkResult, type UndoChoices, type UndoKind, type UndoRights } from "@/lib/books/core/undo-rules";

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

/** The icon for one of the core's effect lines. */
function iconFor(text: string): IconName {
  if (/credit note/i.test(text)) return /VAT return/.test(text) ? "vat" : "file";
  if (/account|credit with/i.test(text)) return "payments";
  if (/commission/i.test(text)) return "money";
  if (/bank line/i.test(text)) return "bank";
  if (/snapshot|audit/i.test(text)) return "history";
  if (/number/i.test(text)) return "lock";
  if (/VAT/.test(text)) return "vat";
  return "posting";
}

function ReasonField({ id, label, hint, value, onChange, error, disabled }: { id: string; label: string; hint: string; value: string; onChange: (value: string) => void; error: string | null; disabled: boolean }) {
  return (
    <div className="bk-fld">
      <label className="bk-lab" htmlFor={id}>
        {label}
      </label>
      <TextArea id={id} rows={3} maxLength={REASON_MAX} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} aria-invalid={error ? true : undefined} />
      {error ? (
        <span role="alert" style={{ fontSize: 12, color: "var(--color-danger)" }}>
          {error}
        </span>
      ) : (
        <span className="muted" style={{ fontSize: 12 }}>
          {hint}
        </span>
      )}
    </div>
  );
}

function TypedField({ id, word, value, onChange, disabled }: { id: string; word: string; value: string; onChange: (value: string) => void; disabled: boolean }) {
  return (
    <div className="bk-fld">
      <label className="bk-lab" htmlFor={id}>
        Type {word} to confirm
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

/** The credit note's reason, as ZIMRA's credit note states it (§4.4). */
const NOTE_REASONS = ["Return", "Price correction", "Cancellation", "Discount", "Bad debt"] as const;

/* ── One document ─────────────────────────────────────────────────────── */

export type UndoDone = { label: string; detail?: string; draft?: { kind: string; id: string; label: string } };

/** BkVoidDialog: what the void does, the fiscal note, what stands on it, and why (kept in the audit trail). */
export function VoidDialog({ choices, open, onOpenChange, onDone }: { choices: UndoChoices; open: boolean; onOpenChange: (open: boolean) => void; onDone: (done: UndoDone) => void | Promise<void> }) {
  const [reason, setReason] = React.useState("");
  const [noteReason, setNoteReason] = React.useState<(typeof NOTE_REASONS)[number]>("Cancellation");
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
    if (reason.trim().length < REASON_MIN) return setMissing("Say why, in a few words.");
    setMissing(null);
    void run(async () => {
      const text = invoice ? `${noteReason}: ${reason.trim()}` : reason.trim();
      const done = await fetchJson<UndoDone>(`/api/books/core/${choices.kind}/${choices.id}`, { method: "POST", body: JSON.stringify({ action: "void", reason: text.slice(0, REASON_MAX) }) });
      onOpenChange(false);
      await onDone(done);
    }, "It was not voided. Nothing was changed; try again.");
  };

  const lead = choices.fiscalNote ?? (invoice ? `${choices.label} is voided with a full credit note. It stays in Invoices, marked void.` : `${choices.label} is voided and stays, marked void.`);
  const go_label = invoice ? `Void and issue ${choices.nextNote ?? "a credit note"}` : `Void ${choices.label}`;
  return (
    <BkDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      title={`Void ${choices.label}`}
      foot={
        <>
          <Button variant="quiet" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" icon="x" shortcut="Ctrl ↵" busy={busy} disabled={busy || !choices.void.allowed} onClick={go}>
            {go_label}
          </Button>
        </>
      }
    >
      <p>{lead}</p>
      <What items={choices.effects.map((text) => ({ icon: iconFor(text), text }))} />
      {choices.dependents.length ? <p className="muted">Standing on it: {choices.dependents.join(", ")}. Void them first.</p> : null}
      {invoice ? (
        <div className="bk-fld">
          <span className="bk-lab" id={`note-reason-${choices.id}`}>
            Reason on the credit note
          </span>
          <div className="bk-chips" role="radiogroup" aria-labelledby={`note-reason-${choices.id}`}>
            {NOTE_REASONS.map((option) => (
              <span
                key={option}
                role="radio"
                tabIndex={0}
                aria-checked={noteReason === option}
                className={noteReason === option ? "on" : undefined}
                style={{ cursor: "pointer" }}
                onClick={() => setNoteReason(option)}
                onKeyDown={(event) => (event.key === " " || event.key === "Enter" ? (event.preventDefault(), setNoteReason(option)) : undefined)}
              >
                {option}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <ReasonField id={`void-why-${choices.id}`} label="Why are you voiding it?" hint="Kept in the audit trail" value={reason} onChange={setReason} error={missing} disabled={busy} />
      <Failed error={error} />
    </BkDialog>
  );
}

/** BkReviseDialog: a posted document is never edited in place; Revise voids it and opens a new draft linked to it (D7). */
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
    if (reason.trim().length < REASON_MIN) return setMissing("Say why, in a few words.");
    setMissing(null);
    void run(async () => {
      const done = await fetchJson<Required<Pick<UndoDone, "draft">> & UndoDone>(`/api/books/core/${choices.kind}/${choices.id}`, { method: "POST", body: JSON.stringify({ action: "revise", reason: reason.trim() }) });
      onOpenChange(false);
      await onRevised(done);
    }, "It was not revised. Nothing was changed; try again.");
  };

  const items: Array<{ icon: IconName; text: React.ReactNode }> = [{ icon: "x", text: `${choices.label} is voided and shows “Replaced by” the new ${noun}` }];
  if (choices.kind === "invoice") items.push({ icon: "file", text: choices.fiscalised ? `A credit note, signed on FDMS, takes ${choices.label} off` : `A credit note takes ${choices.label} off` });
  if (choices.onAccount.length) items.push({ icon: "payments", text: `${choices.onAccount.join(", ")} ${choices.onAccount.length === 1 ? "moves" : "move"} to the new ${noun} when it is ${verb}` });
  if (choices.kind === "bill") items.push({ icon: "vat", text: "Input VAT is claimed once its FTI is Valid" });
  return (
    <BkDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      title={`Revise ${choices.label}`}
      foot={
        <>
          <Button variant="quiet" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" icon="edit" shortcut="Ctrl ↵" busy={busy} disabled={busy || !choices.revise.allowed} onClick={go}>
            Void and revise
          </Button>
        </>
      }
    >
      <p>
        A posted {noun} isn’t edited in place. Revising voids {choices.label} and opens a new draft with its lines, for your changes. It takes the next number when it is {verb}.
      </p>
      <What items={items} />
      <ReasonField id={`revise-why-${choices.id}`} label="Why are you revising it?" hint={`Kept with both ${UNDO_NOUN[choices.kind].plural} and in the audit trail`} value={reason} onChange={setReason} error={missing} disabled={busy} />
      <Failed error={error} />
    </BkDialog>
  );
}

/** BkDeleteDialog: a draft goes at once; anything posted is the owner's, with a reason and its number typed, as if it was never written. */
export function DeleteDialog({ choices, open, onOpenChange, onDeleted }: { choices: UndoChoices; open: boolean; onOpenChange: (open: boolean) => void; onDeleted: (done: UndoDone & { draft?: unknown }) => void | Promise<void> }) {
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
    if (permanent && reason.trim().length < REASON_MIN) return setMissing("Say why, in a few words.");
    if (!typedOk) return;
    setMissing(null);
    void run(async () => {
      const done = await fetchJson<UndoDone>(`/api/books/core/${choices.kind}/${choices.id}`, { method: "DELETE", body: JSON.stringify(permanent ? { reason: reason.trim(), confirm: typed.trim() } : {}) });
      onOpenChange(false);
      await onDeleted(done);
    }, "It was not deleted. Nothing was changed; try again.");
  };

  const foot = (
    <>
      <Button variant="quiet" disabled={busy} onClick={() => onOpenChange(false)}>
        Cancel
      </Button>
      <Button variant="danger" icon="x" shortcut="Ctrl ↵" busy={busy} disabled={busy || !typedOk || !choices.delete.allowed} onClick={go}>
        {permanent ? "Delete permanently" : "Delete the draft"}
      </Button>
    </>
  );
  if (!permanent) {
    return (
      <BkDialog open={open} onOpenChange={onOpenChange} busy={busy} title={`Delete ${choices.label}`} foot={foot} width={460}>
        <p>A draft has no number and nothing was posted, so it simply goes.</p>
        <Failed error={error} />
      </BkDialog>
    );
  }
  return (
    <BkDialog open={open} onOpenChange={onOpenChange} busy={busy} title={`Delete ${choices.label} permanently`} foot={foot} width={500}>
      <p>
        This removes {choices.label} as if it was never {PAST[choices.kind]}. Delete is for duplicates and test data.
      </p>
      <What items={[{ icon: "x" as IconName, text: `${choices.label}, its lines and every entry it posted go` }, ...choices.keeps.map((text) => ({ icon: iconFor(text), text }))]} />
      <ReasonField id={`delete-why-${choices.id}`} label="Reason" hint="Kept in the audit trail with the snapshot" value={reason} onChange={setReason} error={missing} disabled={busy} />
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
 * the reason on hover when not (rule 12). `?do=void|revise|delete` in the
 * address opens that dialog once the choices are read.
 */
export function useUndoMenu(kind: UndoKind, id: string | null | undefined, handlers: { onVoided?: (done: UndoDone) => void | Promise<void>; onRevised?: (done: Required<Pick<UndoDone, "draft">> & UndoDone) => void | Promise<void>; onDeleted?: (done: UndoDone) => void | Promise<void>; initial?: string | null }) {
  const choices = useQuery({
    queryKey: ["books", "undo", kind, id],
    queryFn: () => fetchJson<UndoChoices>(`/api/books/core/${kind}/${id}`),
    enabled: Boolean(id),
  });
  const [open, setOpen] = React.useState<Move | null>(null);
  const opened = React.useRef(false);
  const data = choices.data;
  React.useEffect(() => {
    if (opened.current || !data || !handlers.initial) return;
    opened.current = true;
    if (handlers.initial === "void" || handlers.initial === "revise" || handlers.initial === "delete") setOpen(handlers.initial);
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
      <DeleteDialog choices={data} open={open === "delete"} onOpenChange={(next) => setOpen(next ? "delete" : null)} onDeleted={async (done) => handlers.onDeleted?.(done)} />
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

/** Void or Delete permanently over a selection: one reason for all, and "delete N" typed. */
function BulkUndoDialog({ kind, mode, rows, open, onOpenChange, onDone }: { kind: UndoKind; mode: BulkMode; rows: BulkRow[]; open: boolean; onOpenChange: (open: boolean) => void; onDone: (answer: BulkAnswer) => void }) {
  const [reason, setReason] = React.useState("");
  const [typed, setTyped] = React.useState("");
  const [missing, setMissing] = React.useState<string | null>(null);
  const { busy, error, setError, run } = useRun();
  const noun = UNDO_NOUN[kind];
  const n = rows.length;
  const word = bulkDeleteWord(n);
  const typedOk = mode !== "delete" || typed.trim().toLowerCase() === word;
  React.useEffect(() => {
    if (open) return;
    setReason("");
    setTyped("");
    setMissing(null);
    setError(null);
  }, [open, setError]);

  const go = () => {
    if (reason.trim().length < REASON_MIN) return setMissing("Say why, in a few words.");
    if (!typedOk) return;
    setMissing(null);
    void run(async () => {
      const answer = await fetchJson<BulkAnswer>(`/api/books/core/${kind}/bulk/${mode}`, {
        method: "POST",
        body: JSON.stringify({ ids: rows.map((row) => row.id), reason: reason.trim(), ...(mode === "delete" ? { confirm: typed.trim() } : {}) }),
      });
      onOpenChange(false);
      onDone(answer);
    }, "Nothing was changed; try again.");
  };

  const many = `${n} ${n === 1 ? noun.noun : noun.plural}`;
  const items: Array<{ icon: IconName; text: string }> =
    mode === "void"
      ? [
          ...(kind === "invoice" ? [{ icon: "file" as IconName, text: "Each issued one gets a full credit note, signed where it was" }] : [{ icon: "posting" as IconName, text: "Each posting is reversed, dated today" }]),
          ...(kind === "invoice" || kind === "bill" ? [{ icon: "payments" as IconName, text: "Payments on them stay on account" }] : []),
          { icon: "history", text: "Drafts, and rows the rules refuse, are skipped with why" },
        ]
      : [
          { icon: "x", text: "Drafts, and posted ones in open months, go with their postings" },
          { icon: "lock", text: "Fiscalised ones are skipped: void them instead" },
          { icon: "payments", text: "Payments on them stay on account" },
          { icon: "history", text: "A snapshot of each is kept in the audit trail" },
        ];
  return (
    <BkDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      title={mode === "void" ? `Void ${many}` : `Delete ${many} permanently`}
      foot={
        <>
          <Button variant="quiet" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant={mode === "void" ? "primary" : "danger"} icon="x" shortcut="Ctrl ↵" busy={busy} disabled={busy || !typedOk} onClick={go}>
            {mode === "void" ? `Void ${n}` : `Delete ${n} permanently`}
          </Button>
        </>
      }
    >
      <p>{mode === "void" ? "Each is voided on its own, with this one reason." : "Each is deleted on its own, as if it was never written. Only the owner can."}</p>
      <What items={items} />
      <ReasonField id={`bulk-why-${kind}`} label={mode === "void" ? "Why are you voiding them?" : "Reason"} hint="One reason goes with every row, kept in the audit trail" value={reason} onChange={setReason} error={missing} disabled={busy} />
      {mode === "delete" ? <TypedField id={`bulk-typed-${kind}`} word={`“${word}”`} value={typed} onChange={setTyped} disabled={busy} /> : null}
      <Failed error={error} />
    </BkDialog>
  );
}

/** BkBulkResult: per row, done, skipped with why, or failed; the failed ones can be tried again. */
export function BulkResultDialog({ answer, rows, open, onOpenChange, onRetry }: { answer: BulkAnswer; rows: BulkRow[]; open: boolean; onOpenChange: (open: boolean) => void; onRetry?: (ids: string[]) => void }) {
  const noun = UNDO_NOUN[answer.kind];
  const byId = new Map(rows.map((row) => [row.id, row]));
  const total = answer.done.length + answer.skipped.length + answer.failed.length;
  const past = answer.action === "void" ? "voided" : answer.action === "delete" ? "deleted" : "done";
  const verb = answer.action === "void" ? "Void" : answer.action === "delete" ? "Delete" : "Bulk";
  const party = rows.some((row) => row.party);
  const lines = [
    ...answer.done.map((row) => ({ ...row, result: "Done" as const, why: row.detail ?? "" })),
    ...answer.skipped.map((row) => ({ ...row, result: "Skipped" as const })),
    ...answer.failed.map((row) => ({ ...row, result: "Failed" as const })),
  ];
  const tone = { Done: "status-success", Skipped: "status-warning", Failed: "status-danger" } as const;
  const head = noun.noun.charAt(0).toUpperCase() + noun.noun.slice(1);
  return (
    <BkDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${verb} ${total} ${total === 1 ? noun.noun : noun.plural}`}
      width={760}
      foot={
        <>
          {answer.failed.length && onRetry ? (
            <Button icon="run" onClick={() => onRetry(answer.failed.map((row) => row.id))}>
              {`Retry ${answer.failed.length} failed`}
            </Button>
          ) : null}
          <Button variant="primary" icon="check" shortcut="↵" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", gap: 16, alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ fontSize: 28, fontWeight: 600, color: "var(--color-ink)", letterSpacing: "var(--tracking-display)" }}>
          {answer.done.length} {past}
        </span>
        <span className="muted" style={{ fontSize: 14 }}>
          {[answer.skipped.length ? `${answer.skipped.length} skipped` : null, answer.failed.length ? `${answer.failed.length} failed` : null].filter(Boolean).join(" · ") || "Nothing skipped"}
        </span>
      </div>
      <div className="bk-tw">
        <table className="table" aria-label="What happened to each">
          <thead>
            <tr>
              <th>{head}</th>
              {party ? <th>{answer.kind === "bill" || answer.kind === "payment" ? "Supplier" : "Customer"}</th> : null}
              <th>Result</th>
              <th className="fill">Why</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const row = byId.get(line.id);
              return (
                <tr key={line.id}>
                  <td>
                    <span className="mono">{line.label}</span>
                  </td>
                  {party ? (
                    <td>
                      <span className="truncate" style={{ maxWidth: 160, display: "inline-block" }}>
                        {row?.party ?? ""}
                      </span>
                    </td>
                  ) : null}
                  <td>
                    <span className={`status ${tone[line.result]}`}>{line.result === "Done" ? past.charAt(0).toUpperCase() + past.slice(1) : line.result}</span>
                  </td>
                  <td className="fill">
                    <span className="muted" style={{ whiteSpace: "normal" }}>
                      {line.why}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
  const [shown, setShown] = React.useState<{ answer: BulkAnswer; rows: BulkRow[] } | null>(null);
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

  const node = (
    <>
      {asking ? (
        <BulkUndoDialog
          kind={kind}
          mode={asking.mode}
          rows={asking.rows}
          open
          onOpenChange={(next) => (next ? undefined : setAsking(null))}
          onDone={(answer) => {
            setShown({ answer, rows: asking.rows });
            void onChanged?.();
          }}
        />
      ) : null}
      {shown ? (
        <BulkResultDialog
          answer={shown.answer}
          rows={shown.rows}
          open
          onOpenChange={(next) => (next ? undefined : setShown(null))}
          onRetry={(ids) => {
            const again = shown.rows.filter((row) => ids.includes(row.id));
            setShown(null);
            setAsking({ mode: shown.answer.action === "delete" ? "delete" : "void", rows: again });
          }}
        />
      ) : null}
    </>
  );
  return { entries, node, rights: rights.data ?? null, verb: VERB };
}
