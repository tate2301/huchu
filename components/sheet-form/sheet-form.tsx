"use client";

import "./sheet-form.css";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui/use-toast";
import { Button } from "@/components/workspace/button";
import { ConfirmDialog } from "@/components/workspace/confirm-dialog";
import { CheckCircle, Plus, Trash, X } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { Ask } from "@/lib/workspace/ask";
import type { HandOverPanel, SheetCtx, SheetKind, SheetRequest, SheetValues } from "@/lib/workspace/sheet-kind";

import {
  checkValues,
  discardAsk,
  doneSentence,
  fieldIds,
  initialValues,
  isDirty,
  lineErrorsOf,
  sheetText,
  shownFields,
  shownSections,
  submitFailure,
  withDerived,
} from "./model";
import { HandOver } from "./hand-over";
import { SheetField } from "./sheet-field";
import { SheetView } from "./views";

/**
 * SheetForm — every create and edit form (00-foundations 5.7).
 *
 * A side sheet over the page it came from: 520px (760 when `wide`, full width
 * under 720), a 64px header with the title and its sub, the steps, the body in
 * sections, and a 68px footer with the note, the secondary and the primary.
 * It draws any `SheetKind`; `sheet-host.tsx` opens it from `?sheet=`.
 *
 * On Radix's dialog engine (portal, focus trap, scroll lock); the chrome is
 * the canvas's. Closing with unsaved input asks first.
 */

export type SheetFormProps = {
  kind: SheetKind;
  ctx: SheetCtx;
  open: boolean;
  /** Leave the sheet: the host takes `?sheet=` out of the address. */
  onClose: () => void;
};

/** A body holding a File goes as multipart form data (an import's spreadsheet). */
function multipart(body: unknown): FormData | null {
  if (!body || typeof body !== "object") return null;
  const entries = Object.entries(body as Record<string, unknown>);
  if (!entries.some(([, value]) => value instanceof File)) return null;
  const form = new FormData();
  for (const [key, value] of entries) {
    if (value instanceof File) form.set(key, value);
    else if (value !== null && value !== undefined) form.set(key, String(value));
  }
  return form;
}

async function send(request: SheetRequest, keepalive = false): Promise<{ ok: boolean; status: number; payload: unknown }> {
  const form = multipart(request.body);
  const response = await fetch(request.url, {
    method: request.method,
    credentials: "include",
    // A cancel sent as the page goes (a reload, another address) still lands.
    keepalive,
    ...(form
      ? { body: form }
      : { headers: { "Content-Type": "application/json" }, body: request.body === undefined ? undefined : JSON.stringify(request.body) }),
  });
  const payload: unknown = (response.headers.get("content-type") ?? "").includes("application/json")
    ? await response.json()
    : null;
  return { ok: response.ok, status: response.status, payload };
}

export const fieldControlId = (fieldId: string) => `sf-${fieldId}`;

function focusField(fieldId: string) {
  const node = document.getElementById(fieldControlId(fieldId));
  if (!node) return;
  const target = node.matches("input, textarea, button")
    ? node
    : node.querySelector<HTMLElement>("input, textarea, button:not([disabled])");
  target?.focus();
}

export function SheetForm({ kind, ctx, open, onClose }: SheetFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [initial, setInitial] = React.useState<SheetValues>(() => initialValues(kind, ctx));
  const [values, setValues] = React.useState<SheetValues>(initial);
  const readOnly = kind.readOnly?.(ctx, values) ?? false;
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [footerError, setFooterError] = React.useState<string | null>(null);
  const [savedLine, setSavedLine] = React.useState<string | null>(null);
  const [unfolded, setUnfolded] = React.useState<Record<number, boolean>>({});
  const [saving, setSaving] = React.useState(false);
  // Fields the person has typed in: a derived field stops following once touched.
  const touched = React.useRef(new Set<string>());
  const [asking, setAsking] = React.useState<null | "discard" | "danger" | "confirm">(null);
  const listsOpen = React.useRef(0);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  // A save that could not deliver its secret: the hand-over replaces the body until Done.
  const [panel, setPanel] = React.useState<HandOverPanel | null>(null);
  const [headBusy, setHeadBusy] = React.useState(false);

  // An edit kind starts from the record's current values.
  const { load } = kind;
  // What the load made, for an undo sent before it arrived (Pair a till's till).
  const loading = React.useRef<Promise<SheetValues | null>>(Promise.resolve(null));
  React.useEffect(() => {
    if (!load) return;
    let live = true;
    const loadedPromise = load(ctx);
    loading.current = loadedPromise.catch(() => null);
    void loadedPromise.then((loaded) => {
      if (!live) return;
      setInitial((current) => withDerived(kind, { ...current, ...loaded }, touched.current));
      setValues((current) => withDerived(kind, { ...current, ...loaded }, touched.current));
    }, (error: unknown) => {
      if (live) setFooterError(error instanceof Error ? error.message : "That could not be read. Close it and try again.");
    });
    return () => {
      live = false;
    };
  }, [kind, load, ctx]);

  const valuesRef = React.useRef(values);
  valuesRef.current = values;

  // Leaving, once: polling stops at once, and what the kind opened with (the
  // till Pair a till made, a live pairing code) is undone after the load and
  // any poll in flight have settled, so nothing either does lands after the
  // undo. Saving leaves without the undo.
  const [left] = React.useState(() => new AbortController());
  const inflight = React.useRef<Promise<unknown>>(Promise.resolve());
  const latest = React.useRef({ kind, ctx });
  latest.current = { kind, ctx };
  const settle = React.useCallback(
    (undo: boolean, keepalive = false) => {
      if (left.signal.aborted) return;
      left.abort();
      if (!undo) return;
      const { kind: leaving, ctx: leavingCtx } = latest.current;
      if (!leaving.cancel) return;
      const go = (loaded: SheetValues | null) => {
        const request = leaving.cancel?.(leavingCtx, { ...loaded, ...valuesRef.current }) ?? null;
        if (!request) return;
        void send(request, keepalive)
          .then(() => Promise.all(leaving.invalidate.map((key) => queryClient.invalidateQueries({ queryKey: key }))))
          .catch(() => undefined);
      };
      // A page that is going cannot wait.
      if (keepalive) go(null);
      else void Promise.all([loading.current, inflight.current]).then(([loaded]) => go(loaded));
    },
    [left, queryClient],
  );

  // A kind that polls (a pairing code's state) merges each answer into the
  // values and into what counts as unchanged, so polling never makes it dirty.
  const { poll } = kind;
  React.useEffect(() => {
    if (!poll || !open) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const signal = left.signal;
    const stopped = () => !live || signal.aborted;
    const tick = async () => {
      if (stopped()) return;
      const run = poll.run(ctx, valuesRef.current, signal);
      inflight.current = run.catch(() => null);
      try {
        const polled = await run;
        if (!stopped() && polled) {
          setInitial((current) => ({ ...current, ...polled }));
          setValues((current) => ({ ...current, ...polled }));
        }
      } catch {
        // The next tick asks again.
      }
      if (!stopped()) timer = setTimeout(() => void tick(), poll.every);
    };
    timer = setTimeout(() => void tick(), poll.every);
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [poll, open, ctx, left]);

  // Left some other way than the sheet's own buttons: Back or a link took
  // `?sheet=` out of the address, another sheet replaced it, or the page is
  // going (reload, another address). Each still undoes. The unmount check
  // waits a tick, so React's development double mount is not a leave.
  const wasOpen = React.useRef(open);
  React.useEffect(() => {
    if (open) wasOpen.current = true;
    else if (wasOpen.current) settle(true);
  }, [open, settle]);
  const mounted = React.useRef(false);
  React.useEffect(() => {
    mounted.current = true;
    const onHide = () => settle(true, true);
    window.addEventListener("pagehide", onHide);
    return () => {
      mounted.current = false;
      window.removeEventListener("pagehide", onHide);
      setTimeout(() => {
        if (!mounted.current) settle(true);
      }, 0);
    };
  }, [settle]);

  const dirty = !readOnly && isDirty(initial, values);
  const title = sheetText(kind.title, ctx, values);
  const sub = sheetText(kind.sub, ctx, values);

  // Leaving without saving: what the kind undoes, then close — or go on to
  // `to` (the secondary link, "Pair another device").
  const leaveTo = React.useRef<string | null>(null);
  const leave = () => {
    settle(true);
    const to = leaveTo.current;
    if (to) router.replace(to, { scroll: false });
    else onClose();
  };

  /** Close, or follow `to`; with unsaved input it asks first. */
  const requestClose = (to: string | null = null) => {
    if (saving) return;
    leaveTo.current = to;
    if (dirty) setAsking("discard");
    else leave();
  };

  const setValue = (fieldId: string, value: unknown) => {
    touched.current.add(fieldId);
    const next = withDerived(kind, { ...values, [fieldId]: value }, touched.current);
    setValues((current) => withDerived(kind, { ...current, [fieldId]: value }, touched.current));
    setSavedLine(null);
    setFooterError(null);
    setErrors((current) => {
      const stale = Object.keys(current).filter((key) => key === fieldId || key.startsWith(`${fieldId}.`));
      if (stale.length === 0) return current;
      const kept = { ...current };
      for (const key of stale) delete kept[key];
      return kept;
    });
    // Other values that follow this one (From drops the lines not kept there).
    const follow = kind.sections.flatMap((section) => section.fields).find((field) => field.id === fieldId)?.follow;
    if (follow) {
      void follow(value, next, ctx).then(
        (followed) => {
          if (!followed) return;
          setValues((current) =>
            current[fieldId] === value ? withDerived(kind, { ...current, ...followed }, touched.current) : current,
          );
        },
        () => undefined,
      );
    }
  };

  const onListOpen = (isOpen: boolean) => {
    listsOpen.current = Math.max(0, listsOpen.current + (isOpen ? 1 : -1));
  };

  const after = async (result: unknown, again: boolean, payload: unknown = result) => {
    await Promise.all(kind.invalidate.map((key) => queryClient.invalidateQueries({ queryKey: key })));
    const handOver = kind.handOver?.(payload, values) ?? null;
    if (handOver) {
      setInitial(values);
      setPanel(handOver);
      return;
    }
    const sentence = doneSentence(kind, result, values, payload);
    if (again) {
      // What the load brought (`_` facts) stays, and the fields the kind keeps;
      // every other field starts again empty.
      const keep = new Set(kind.again?.keep ?? []);
      const kept = Object.fromEntries(Object.entries(values).filter(([key]) => key.startsWith("_") || keep.has(key)));
      const fresh = withDerived(kind, { ...initialValues(kind, ctx), ...kept });
      setInitial(fresh);
      setValues(fresh);
      setSavedLine(sentence);
      requestAnimationFrame(() => {
        const first = shownSections(kind, fresh, ctx)[0]?.fields[0];
        if (first) focusField(first.id);
      });
      return;
    }
    const href = kind.open?.(result, values) ?? null;
    toast({
      title: sentence,
      variant: "success",
      ...(href ? { action: { label: (typeof kind.openLabel === "function" ? kind.openLabel(result, values) : kind.openLabel) ?? "Open", onClick: () => router.push(href) } } : {}),
    });
    settle(false);
    const next = kind.next?.(result, values) ?? null;
    if (next) router.replace(next);
    else onClose();
  };

  // A field in a folded section unfolds to show its message.
  const unfoldFor = (problems: Record<string, string>) => {
    kind.sections.forEach((section, index) => {
      if (section.fold && section.fields.some((field) => field.id in problems)) {
        setUnfolded((current) => ({ ...current, [index]: true }));
      }
    });
  };

  const submit = async (again: boolean) => {
    if (saving || readOnly || kind.primaryDisabled?.(values)) return;
    setFooterError(null);
    setSavedLine(null);
    const problems = checkValues(kind, values, ctx);
    if (Object.keys(problems).length > 0) {
      setErrors(problems);
      const firstId = Object.keys(problems)[0]!;
      unfoldFor(problems);
      requestAnimationFrame(() => focusField(firstId));
      return;
    }
    setErrors({});
    if (kind.confirm) {
      setAsking("confirm");
      return;
    }
    await sendChecked(again);
  };

  // After the check, and the ask when the kind has one.
  const sendChecked = async (again: boolean) => {
    setSaving(true);
    try {
      const request = kind.submit(values, ctx);
      if (!request) {
        await after(null, again);
        return;
      }
      const answer = await send(request);
      if (answer.ok) {
        const result = (answer.payload as { data?: unknown } | null)?.data ?? answer.payload;
        await after(result, again, answer.payload);
        return;
      }
      const refused = kind.onRefused?.(answer.payload, values) ?? null;
      if (refused) setValues((current) => ({ ...current, ...refused }));
      const failure = submitFailure(answer.status, answer.payload, fieldIds(kind));
      setErrors(failure.fieldErrors);
      setFooterError(failure.footer);
      unfoldFor(failure.fieldErrors);
      const firstId = Object.keys(failure.fieldErrors)[0];
      if (firstId) requestAnimationFrame(() => focusField(firstId));
    } catch {
      setFooterError("That did not reach the server. Nothing was saved; try again.");
    } finally {
      setSaving(false);
    }
  };

  const runDanger = async () => {
    if (!kind.danger) return;
    const answer = await send(kind.danger.request(ctx, values));
    if (!answer.ok) {
      const payload = answer.payload as { error?: unknown; fieldErrors?: Record<string, unknown> } | null;
      const fieldMessage = Object.values(payload?.fieldErrors ?? {}).find((value) => typeof value === "string");
      const failure = submitFailure(answer.status, { error: fieldMessage ?? payload?.error }, []);
      throw new Error(failure.footer ?? "That did not work.");
    }
    await Promise.all(kind.invalidate.map((key) => queryClient.invalidateQueries({ queryKey: key })));
    const done = kind.danger.done;
    toast({ title: typeof done === "function" ? done(values, answer.payload) : done, variant: "success" });
    settle(false);
    onClose();
  };

  // The danger action: asked first when it has an ask, else sent at once.
  const startDanger = async () => {
    if (!kind.danger) return;
    if (kind.danger.ask(ctx, values)) {
      setAsking("danger");
      return;
    }
    setSaving(true);
    setFooterError(null);
    try {
      await runDanger();
    } catch (error) {
      setFooterError(error instanceof Error ? error.message : "That did not work. Nothing was changed; try again.");
    } finally {
      setSaving(false);
    }
  };

  const headLink = !readOnly && !panel ? (kind.headLink?.(ctx, values) ?? null) : null;
  const runHeadLink = async () => {
    if (!headLink || headBusy) return;
    setHeadBusy(true);
    setFooterError(null);
    try {
      const answer = await send(headLink.request);
      if (!answer.ok) {
        setFooterError(submitFailure(answer.status, answer.payload, []).footer);
        return;
      }
      await Promise.all(kind.invalidate.map((key) => queryClient.invalidateQueries({ queryKey: key })));
      const handOver = kind.handOver?.(answer.payload, values) ?? null;
      if (handOver) setPanel(handOver);
      else toast({ title: headLink.done(answer.payload), variant: "success" });
    } catch {
      setFooterError("That did not reach the server. Nothing was sent; try again.");
    } finally {
      setHeadBusy(false);
    }
  };
  const finishHandOver = () => {
    settle(false);
    onClose();
  };

  const ask: Ask | null =
    asking === "discard"
      ? discardAsk(title, { record: typeof kind.title === "function" && kind.load !== undefined })
      : asking === "danger" && kind.danger
        ? kind.danger.ask(ctx, values)
        : asking === "confirm" && kind.confirm
          ? kind.confirm(values, ctx)
          : null;
  const secondaryLink = readOnly ? null : (kind.secondaryLink?.(ctx, values) ?? null);
  const secondary = readOnly ? "Close" : (secondaryLink?.label ?? kind.secondary ?? "Cancel");
  const again = !readOnly && kind.secondary !== undefined && kind.secondary !== "Cancel";
  const sections = shownSections(kind, values, ctx);
  const danger = !readOnly && kind.danger && (kind.danger.show?.(ctx, values) ?? true) ? kind.danger : null;
  const dangerLabel = danger ? (typeof danger.label === "function" ? danger.label(values) : danger.label) : "";
  const dangerAsks = danger ? danger.ask(ctx, values) !== null : false;
  const note = typeof kind.note === "function" ? kind.note(values) : kind.note;
  const primaryLabel = typeof kind.primary === "function" ? kind.primary(values) : kind.primary;
  const guide = typeof kind.guide === "function" ? kind.guide(values) : kind.guide;
  const primaryDisabled = kind.primaryDisabled?.(values) ?? false;
  const noteLink = readOnly ? null : (kind.noteLink?.(values) ?? null);
  const steps = kind.steps ?? [];
  const at = kind.at ?? 0;

  return (
    <>
      <Dialog.Root
        open={open}
        onOpenChange={(next) => {
          if (!next) requestClose();
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="cx-scrim sf-scrim" />
          <Dialog.Content
            className={cn("cx-sheet sf-sheet", kind.wide && "cx-sheet--wide", kind.size === "matrix" && "sf-sheet--matrix")}
            aria-describedby={undefined}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              const first = bodyRef.current?.querySelector<HTMLElement>(
                "input:not([disabled]), textarea:not([disabled]), button:not([disabled])",
              );
              first?.focus();
            }}
            onEscapeKeyDown={(event) => {
              // Esc closes an open list or the quick-add panel first.
              const target = event.target as HTMLElement | null;
              if (listsOpen.current > 0 || target?.closest(".sf-quick")) {
                event.preventDefault();
                return;
              }
              event.preventDefault();
              requestClose();
            }}
            onInteractOutside={(event) => {
              event.preventDefault();
              // A toast is not the scrim, nor is the sheet's own ask: focus
              // moving into it is not a click outside.
              if ((event.target as HTMLElement | null)?.closest(".cx-toast-host, [role='alertdialog']")) return;
              if (asking !== null) return;
              requestClose();
            }}
          >
            <header className="cx-sheet__head">
              <div className="sf-head__text">
                <Dialog.Title className="cx-sheet__title sf-ellipsis">{title}</Dialog.Title>
                <span className="cx-sheet__sub sf-ellipsis">{sub}</span>
                {headLink ? (
                  <button type="button" className="sf-head__link" onClick={() => void runHeadLink()} disabled={headBusy}>
                    {headLink.label}
                  </button>
                ) : null}
              </div>
              <button type="button" className="sf-close" aria-label="Close" onClick={() => requestClose()}>
                <X aria-hidden="true" />
              </button>
            </header>

            {steps.length > 0 ? (
              <ol aria-label="What happens next" className="sf-steps">
                {steps.map((step, index) => {
                  const state = index < at ? "done" : index === at ? "current" : "todo";
                  return (
                    <li key={step} className="sf-step" data-state={state} aria-current={state === "current" ? "step" : undefined}>
                      <span className="sf-step__mark">{state === "done" ? "✓" : index + 1}</span>
                      {step}
                      {index < steps.length - 1 ? <span className="sf-step__joint" aria-hidden="true" /> : null}
                    </li>
                  );
                })}
              </ol>
            ) : null}

            <div
              ref={bodyRef}
              className="cx-sheet__body"
              inert={saving || undefined}
              onKeyDown={(event) => {
                // Enter in a one-line input sends the sheet, as a form would.
                const target = event.target as HTMLElement;
                if (
                  event.key === "Enter" &&
                  target.tagName === "INPUT" &&
                  target.getAttribute("role") !== "combobox" &&
                  !target.closest(".sf-quick, .cx-tags, .sf-lines")
                ) {
                  event.preventDefault();
                  void submit(false);
                }
              }}
            >
              {panel ? <HandOver panel={panel} /> : null}
              {!panel && kind.view ? <SheetView name={kind.view} ctx={ctx} /> : null}
              {!panel && guide ? (
                <div role="note" className="cx-note sf-guide">
                  {guide}
                </div>
              ) : null}
              {(panel ? [] : sections).map((section) => {
                const index = kind.sections.indexOf(section);
                const folded = section.fold && !unfolded[index];
                return (
                  <section key={index} className="cx-sheet__section">
                    {section.title ? <h3 className="cx-sheet__section-title">{section.title}</h3> : null}
                    {folded && section.fold ? (
                      <button
                        type="button"
                        className="sf-fold"
                        aria-expanded="false"
                        onClick={() => setUnfolded((current) => ({ ...current, [index]: true }))}
                      >
                        <Plus aria-hidden="true" />
                        <span className="sf-fold__label">{section.fold[0]}</span>
                        <span className="sf-fold__hint">{section.fold[1]}</span>
                      </button>
                    ) : (
                      <div className="sf-grid">
                        {shownFields(section, values, ctx).map((field) => (
                          <div key={field.id} className={field.half ? "sf-cell sf-cell--half" : "sf-cell"}>
                            <SheetField
                              field={field}
                              controlId={fieldControlId(field.id)}
                              ctx={ctx}
                              values={values}
                              currency={kind.cur}
                              error={errors[field.id]}
                              lineErrors={field.t === "lines" ? lineErrorsOf(field.id, errors) : undefined}
                              readOnly={readOnly}
                              onChange={(value) => setValue(field.id, value)}
                              onListOpen={onListOpen}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>

            {panel ? (
              <footer className="cx-sheet__foot">
                <span className="sf-foot__note" />
                <Button size="field" variant="primary" onClick={finishHandOver}>
                  Done
                </Button>
              </footer>
            ) : (
            <footer className="cx-sheet__foot">
              {danger ? (
                <button type="button" className="sf-danger" onClick={() => void startDanger()} disabled={saving}>
                  {dangerAsks ? <Trash aria-hidden="true" /> : null}
                  {dangerLabel}
                </button>
              ) : null}
              {footerError ? (
                <span role="alert" className="sf-foot__note sf-foot__note--bad">
                  {footerError}
                </span>
              ) : savedLine ? (
                <span role="status" className="sf-foot__note sf-foot__note--ok">
                  <CheckCircle aria-hidden="true" />
                  <span>{savedLine}</span>
                </span>
              ) : (
                <span className="sf-foot__note">
                  {readOnly ? "" : note}
                  {noteLink ? (
                    <>
                      {" "}
                      <a className="sf-foot__link" href={noteLink.href}>
                        {noteLink.label}
                      </a>
                    </>
                  ) : null}
                </span>
              )}
              <Button
                size="field"
                onClick={() => {
                  if (secondaryLink) requestClose(secondaryLink.href);
                  else if (again) void submit(true);
                  else requestClose();
                }}
                disabled={saving}
              >
                {secondary}
              </Button>
              {readOnly ? null : (
                <Button
                  size="field"
                  variant={kind.primaryTone === "danger" ? "danger" : "primary"}
                  busy={saving}
                  disabled={primaryDisabled}
                  onClick={() => void submit(false)}
                >
                  {primaryLabel}
                </Button>
              )}
            </footer>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {ask ? (
        <ConfirmDialog
          ask={ask}
          open={asking !== null}
          onOpenChange={(next) => {
            if (!next) setAsking(null);
          }}
          onConfirm={async () => {
            if (asking === "danger") await runDanger();
            else if (asking === "confirm") {
              setAsking(null);
              await sendChecked(false);
            } else leave();
          }}
        />
      ) : null}
    </>
  );
}
