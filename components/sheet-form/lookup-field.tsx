"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui/use-toast";
import { ApiError, fetchJson } from "@/lib/api-client";
import { ChevronDown, Plus } from "@/lib/icons";
import type { PickedOption } from "@/lib/workspace/sheet-kind";

/**
 * The `auto` field (00-foundations 5.7.5): a combobox over
 * `GET /api/v2/retail/lookup/<noun>?q=`, with the add option under the list
 * and the inline "New <noun>" panel, which posts the quick fields and picks
 * what comes back (F-3).
 */

type QuickField = { key: string; label: string; placeholder: string; value?: string };
type LookupPage = {
  options: PickedOption[];
  more: boolean;
  add: { quick: QuickField[] } | null;
};

export const lookupKey = (noun: string) => ["lookup", noun] as const;

function lookupUrl(noun: string, q: string, context?: Record<string, unknown>) {
  const params = new URLSearchParams({ q, limit: "8" });
  if (context) params.set("context", JSON.stringify(context));
  return `/api/v2/retail/lookup/${encodeURIComponent(noun)}?${params.toString()}`;
}

function useIdle<T>(value: T, ms: number): T {
  const [idle, setIdle] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setIdle(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return idle;
}

export type LookupFieldProps = {
  id: string;
  label: string;
  noun: string;
  value: PickedOption | null;
  onValueChange: (value: PickedOption | null) => void;
  placeholder?: string;
  context?: Record<string, unknown>;
  disabled?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  /** Whether a listbox is open, so Esc closes it rather than the sheet. */
  onOpenChange?: (open: boolean) => void;
};

export function LookupField({
  id,
  label,
  noun,
  value,
  onValueChange,
  placeholder,
  context,
  disabled = false,
  onOpenChange,
  ...aria
}: LookupFieldProps) {
  const queryClient = useQueryClient();
  const listId = `${id}-list`;
  const [open, setOpenState] = React.useState(false);
  const [typed, setTyped] = React.useState<string | null>(null);
  const [active, setActive] = React.useState(0);
  const [adding, setAdding] = React.useState<Record<string, string> | null>(null);
  const [addErrors, setAddErrors] = React.useState<Record<string, string>>({});
  const [addFailure, setAddFailure] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const firstQuickRef = React.useRef<HTMLInputElement>(null);

  const setOpen = React.useCallback(
    (next: boolean) => {
      setOpenState(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );

  // What the input shows: the text being typed, else the picked option.
  const text = typed ?? value?.label ?? "";
  const q = useIdle(typed ?? "", 150);
  const contextKey = context ? JSON.stringify(context) : "";

  const lookup = useQuery({
    queryKey: [...lookupKey(noun), q, contextKey],
    queryFn: () => fetchJson<LookupPage>(lookupUrl(noun, q, context)),
    enabled: open || adding !== null,
    staleTime: 15_000,
  });
  const page = lookup.data;
  const options = page?.options ?? [];
  const typedText = (typed ?? "").trim();
  const exact = options.some((option) => option.label.toLowerCase() === typedText.toLowerCase());
  const addLabel =
    typedText && !exact ? `Add ‘${typedText}’ as a new ${noun}` : `Add a new ${noun}`;
  const canAdd = Boolean(page?.add);
  const rows = options.length + (canAdd ? 1 : 0);

  React.useEffect(() => {
    if (adding) firstQuickRef.current?.focus();
  }, [adding]);

  // Closes when focus or a click goes elsewhere.
  React.useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
        setTyped(null);
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, setOpen]);

  const pick = (option: PickedOption) => {
    onValueChange(option);
    setTyped(null);
    setOpen(false);
  };

  const startAdd = () => {
    const quick = page?.add?.quick ?? [];
    const draft: Record<string, string> = {};
    quick.forEach((field, index) => {
      draft[field.key] = index === 0 && typedText && !exact ? typedText : (field.value ?? "");
    });
    setAddErrors({});
    setAddFailure(null);
    setAdding(draft);
    setOpen(false);
  };

  const cancelAdd = () => {
    setAdding(null);
    setTyped(null);
  };

  const doAdd = async () => {
    if (!adding) return;
    setSaving(true);
    setAddErrors({});
    setAddFailure(null);
    try {
      const answer = await fetchJson<{ option: PickedOption; notice?: string }>(
        `/api/v2/retail/lookup/${encodeURIComponent(noun)}`,
        { method: "POST", body: JSON.stringify({ fields: adding, ...(context ? { context } : {}) }) },
      );
      await queryClient.invalidateQueries({ queryKey: lookupKey(noun) });
      setAdding(null);
      pick(answer.option);
      // What the add could not do, said once ("WhatsApp is not set up, so give them their link from People.").
      if (answer.notice) toast({ title: answer.notice, variant: "warning" });
    } catch (error) {
      const details = error instanceof ApiError ? (error.details as { fieldErrors?: Record<string, string> }) : null;
      if (details?.fieldErrors && Object.keys(details.fieldErrors).length > 0) setAddErrors(details.fieldErrors);
      else setAddFailure(error instanceof Error ? error.message : "That was not added. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) setOpen(true);
      else setActive((current) => Math.min(rows - 1, current + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => Math.max(0, current - 1));
    } else if (event.key === "Enter") {
      if (!open) return;
      event.preventDefault();
      if (active < options.length) pick(options[active]!);
      else if (canAdd) startAdd();
    } else if (event.key === "Escape" && open) {
      setOpen(false);
      setTyped(null);
    }
  };

  const quick = page?.add?.quick ?? [];

  return (
    <div className="sf-auto" ref={wrapRef}>
      <div className="cx-pick" data-open={open ? "true" : undefined} data-invalid={aria["aria-invalid"] ? "true" : undefined}>
        <input
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && rows > 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          value={text}
          placeholder={placeholder}
          disabled={disabled}
          // A click or typing opens the list; landing on the field (the
          // sheet focuses its first field) does not.
          onClick={() => {
            if (!adding && !open) setOpen(true);
          }}
          onChange={(event) => {
            setTyped(event.target.value);
            setActive(0);
            if (!open) setOpen(true);
            if (event.target.value === "" && value) onValueChange(null);
          }}
          onKeyDown={onKeyDown}
          {...aria}
        />
        <span className="sf-auto__chev" aria-hidden="true">
          <ChevronDown />
        </span>
      </div>
      {open ? (
        <div role="listbox" id={listId} aria-label={label} className="sf-auto__list">
          {options.map((option, index) => (
            <div
              key={option.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className="sf-auto__option"
              onPointerDown={(event) => event.preventDefault()}
              onPointerEnter={() => setActive(index)}
              onClick={() => pick(option)}
            >
              <span className="sf-auto__label">{option.label}</span>
              {option.sub ? <span className="sf-auto__sub">{option.sub}</span> : null}
            </div>
          ))}
          {page && options.length === 0 ? <span className="sf-auto__none">Nothing matches.</span> : null}
          {!page && lookup.isFetching ? <span className="sf-auto__none">Looking…</span> : null}
          {lookup.error ? <span className="sf-auto__none">{(lookup.error as Error).message}</span> : null}
          {canAdd ? (
            <>
              <span className="sf-auto__rule" aria-hidden="true" />
              <div
                id={`${listId}-${options.length}`}
                role="option"
                aria-selected={active === options.length}
                className="sf-auto__option sf-auto__add"
                onPointerDown={(event) => event.preventDefault()}
                onPointerEnter={() => setActive(options.length)}
                onClick={startAdd}
              >
                <Plus aria-hidden="true" />
                {addLabel}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
      {adding ? (
        <div className="sf-quick" role="group" aria-label={`New ${noun}`}>
          <span className="sf-quick__title">New {noun}</span>
          {quick.map((field, index) => {
            const inputId = `${id}-quick-${field.key}`;
            const error = addErrors[field.key];
            return (
              <div key={field.key} className="cx-field">
                <label className="cx-label" htmlFor={inputId}>
                  {field.label}
                </label>
                <input
                  id={inputId}
                  ref={index === 0 ? firstQuickRef : undefined}
                  className="cx-input"
                  value={adding[field.key] ?? ""}
                  placeholder={field.placeholder}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${inputId}-error` : undefined}
                  onChange={(event) => setAdding((current) => ({ ...(current ?? {}), [field.key]: event.target.value }))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void doAdd();
                    } else if (event.key === "Escape") {
                      cancelAdd();
                    }
                  }}
                />
                {error ? (
                  <span id={`${inputId}-error`} className="cx-error">
                    {error}
                  </span>
                ) : null}
              </div>
            );
          })}
          {addFailure ? <span className="cx-error">{addFailure}</span> : null}
          <div className="sf-quick__actions">
            <button type="button" className="cx-btn" onClick={cancelAdd} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="cx-btn sf-quick__go" onClick={() => void doAdd()} disabled={saving} aria-busy={saving || undefined}>
              Add and use
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
