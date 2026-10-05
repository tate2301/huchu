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
import type { SheetCtx, SheetKind, SheetRequest, SheetValues } from "@/lib/workspace/sheet-kind";

import {
  checkValues,
  discardAsk,
  doneSentence,
  fieldIds,
  initialValues,
  isDirty,
  resolve,
  shownSections,
  submitFailure,
} from "./model";
import { SheetField } from "./sheet-field";

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

async function send(request: SheetRequest): Promise<{ ok: boolean; status: number; payload: unknown }> {
  const response = await fetch(request.url, {
    method: request.method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: request.body === undefined ? undefined : JSON.stringify(request.body),
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
  const title = resolve(kind.title, ctx);
  const sub = resolve(kind.sub, ctx);

  const [initial, setInitial] = React.useState<SheetValues>(() => initialValues(kind, ctx));
  const [values, setValues] = React.useState<SheetValues>(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [footerError, setFooterError] = React.useState<string | null>(null);
  const [savedLine, setSavedLine] = React.useState<string | null>(null);
  const [unfolded, setUnfolded] = React.useState<Record<number, boolean>>({});
  const [saving, setSaving] = React.useState(false);
  const [asking, setAsking] = React.useState<null | "discard" | "danger">(null);
  const listsOpen = React.useRef(0);
  const bodyRef = React.useRef<HTMLDivElement>(null);

  // An edit kind starts from the record's current values.
  const { load } = kind;
  React.useEffect(() => {
    if (!load) return;
    let live = true;
    void load(ctx).then((loaded) => {
      if (!live) return;
      setInitial((current) => ({ ...current, ...loaded }));
      setValues((current) => ({ ...current, ...loaded }));
    });
    return () => {
      live = false;
    };
  }, [load, ctx]);

  const dirty = isDirty(initial, values);

  const requestClose = () => {
    if (saving) return;
    if (dirty) setAsking("discard");
    else onClose();
  };

  const setValue = (fieldId: string, value: unknown) => {
    setValues((current) => ({ ...current, [fieldId]: value }));
    setSavedLine(null);
    setFooterError(null);
    setErrors((current) => {
      if (!(fieldId in current)) return current;
      const next = { ...current };
      delete next[fieldId];
      return next;
    });
  };

  const onListOpen = (isOpen: boolean) => {
    listsOpen.current = Math.max(0, listsOpen.current + (isOpen ? 1 : -1));
  };

  const after = async (result: unknown, again: boolean) => {
    await Promise.all(kind.invalidate.map((key) => queryClient.invalidateQueries({ queryKey: key })));
    const sentence = doneSentence(kind, result);
    if (again) {
      const fresh = initialValues(kind, ctx);
      setInitial(fresh);
      setValues(fresh);
      setSavedLine(sentence);
      requestAnimationFrame(() => {
        const first = shownSections(kind, fresh)[0]?.fields[0];
        if (first) focusField(first.id);
      });
      return;
    }
    const href = kind.open?.(result) ?? null;
    toast({
      title: sentence,
      variant: "success",
      ...(href ? { action: { label: "Open", onClick: () => router.push(href) } } : {}),
    });
    onClose();
  };

  const submit = async (again: boolean) => {
    if (saving) return;
    setFooterError(null);
    setSavedLine(null);
    const problems = checkValues(kind, values, ctx);
    if (Object.keys(problems).length > 0) {
      setErrors(problems);
      const firstId = Object.keys(problems)[0]!;
      // A field in a folded section unfolds to show its message.
      kind.sections.forEach((section, index) => {
        if (section.fold && section.fields.some((field) => field.id in problems)) {
          setUnfolded((current) => ({ ...current, [index]: true }));
        }
      });
      requestAnimationFrame(() => focusField(firstId));
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const answer = await send(kind.submit(values, ctx));
      if (answer.ok) {
        const result = (answer.payload as { data?: unknown } | null)?.data ?? answer.payload;
        await after(result, again);
        return;
      }
      const failure = submitFailure(answer.status, answer.payload, fieldIds(kind));
      setErrors(failure.fieldErrors);
      setFooterError(failure.footer);
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
    const answer = await send(kind.danger.request(ctx));
    if (!answer.ok) {
      const failure = submitFailure(answer.status, answer.payload, []);
      throw new Error(failure.footer ?? "That did not work.");
    }
    await Promise.all(kind.invalidate.map((key) => queryClient.invalidateQueries({ queryKey: key })));
    toast({ title: kind.danger.done, variant: "success" });
    onClose();
  };

  const ask: Ask | null =
    asking === "discard" ? discardAsk(title) : asking === "danger" && kind.danger ? kind.danger.ask(ctx) : null;
  const secondary = kind.secondary ?? "Cancel";
  const again = kind.secondary !== undefined && kind.secondary !== "Cancel";
  const sections = shownSections(kind, values);
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
            className={cn("cx-sheet sf-sheet", kind.wide && "cx-sheet--wide")}
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
              // A toast is not the scrim.
              if ((event.target as HTMLElement | null)?.closest(".cx-toast-host")) return;
              requestClose();
            }}
          >
            <header className="cx-sheet__head">
              <div className="sf-head__text">
                <Dialog.Title className="cx-sheet__title sf-ellipsis">{title}</Dialog.Title>
                <span className="cx-sheet__sub sf-ellipsis">{sub}</span>
              </div>
              <button type="button" className="sf-close" aria-label="Close" onClick={requestClose}>
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
              {kind.guide ? (
                <div role="note" className="cx-note sf-guide">
                  {kind.guide}
                </div>
              ) : null}
              {sections.map((section) => {
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
                        {section.fields.map((field) => (
                          <div key={field.id} className={field.half ? "sf-cell sf-cell--half" : "sf-cell"}>
                            <SheetField
                              field={field}
                              controlId={fieldControlId(field.id)}
                              ctx={ctx}
                              values={values}
                              currency={kind.cur}
                              error={errors[field.id]}
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

            <footer className="cx-sheet__foot">
              {kind.danger ? (
                <button type="button" className="sf-danger" onClick={() => setAsking("danger")} disabled={saving}>
                  <Trash aria-hidden="true" />
                  {kind.danger.label}
                </button>
              ) : null}
              {footerError ? (
                <span role="alert" className="sf-foot__note sf-foot__note--bad">
                  {footerError}
                </span>
              ) : savedLine ? (
                <span role="status" className="sf-foot__note sf-foot__note--ok">
                  <CheckCircle aria-hidden="true" />
                  <span className="sf-ellipsis">{savedLine}</span>
                </span>
              ) : (
                <span className="sf-foot__note">{kind.note}</span>
              )}
              <Button size="field" onClick={() => (again ? void submit(true) : requestClose())} disabled={saving}>
                {secondary}
              </Button>
              <Button size="field" variant="primary" busy={saving} onClick={() => void submit(false)}>
                {kind.primary}
              </Button>
            </footer>
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
            else onClose();
          }}
        />
      ) : null}
    </>
  );
}
