"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "@/lib/api-client";
import { X } from "@/lib/icons";
import type { PickedOption } from "@/lib/workspace/sheet-kind";

import { lookupKey } from "./lookup-field";

/**
 * A `tags` field over a lookup noun (00-foundations 5.7.5; first used by
 * Start a count): picked records drawn as the board's chips, each with a ×,
 * then an input that searches `GET /api/v2/retail/lookup/<noun>?q=` as the
 * person types. Enter takes the highlighted option, Backspace in an empty
 * input takes the last chip off. The value is the picked options.
 */

type LookupPage = { options: PickedOption[]; more: boolean };

function lookupUrl(noun: string, q: string, context?: Record<string, unknown>) {
  const params = new URLSearchParams({ q, limit: "8" });
  if (context) params.set("context", JSON.stringify(context));
  return `/api/v2/retail/lookup/${encodeURIComponent(noun)}?${params.toString()}`;
}

export type LookupTagsProps = {
  id: string;
  label: string;
  noun: string;
  value: PickedOption[];
  onValueChange: (value: PickedOption[]) => void;
  placeholder?: string;
  context?: Record<string, unknown>;
  disabled?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function LookupTags({
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
}: LookupTagsProps) {
  const listId = `${id}-list`;
  const [draft, setDraft] = React.useState("");
  const [open, setOpenState] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const [q, setQ] = React.useState("");
  const wrapRef = React.useRef<HTMLDivElement>(null);

  const setOpen = React.useCallback(
    (next: boolean) => {
      setOpenState(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );

  React.useEffect(() => {
    const timer = setTimeout(() => setQ(draft.trim()), 150);
    return () => clearTimeout(timer);
  }, [draft]);

  const contextKey = context ? JSON.stringify(context) : "";
  const lookup = useQuery({
    queryKey: [...lookupKey(noun), q, contextKey],
    queryFn: () => fetchJson<LookupPage>(lookupUrl(noun, q, context)),
    enabled: open,
    staleTime: 15_000,
  });
  const taken = new Set(value.map((option) => option.id));
  const options = (lookup.data?.options ?? []).filter((option) => !taken.has(option.id));

  React.useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, setOpen]);

  const pick = (option: PickedOption) => {
    onValueChange([...value, { id: option.id, label: option.label, sub: option.sub ?? null }]);
    setDraft("");
    setActive(0);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) setOpen(true);
      else setActive((current) => Math.min(options.length - 1, current + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => Math.max(0, current - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = options[active];
      if (open && option) pick(option);
    } else if (event.key === "Escape" && open) {
      event.stopPropagation();
      setOpen(false);
    } else if (event.key === "Backspace" && draft === "" && value.length > 0) {
      onValueChange(value.slice(0, -1));
    }
  };

  return (
    <div className="sf-auto" ref={wrapRef}>
      <div className="cx-tags" data-invalid={aria["aria-invalid"] ? "true" : undefined}>
        {value.map((option) => (
          <span key={option.id} className="cx-tag">
            {option.label}
            {!disabled ? (
              <button
                type="button"
                className="cx-tag__remove"
                aria-label={`Remove ${option.label}`}
                onClick={() => onValueChange(value.filter((other) => other.id !== option.id))}
              >
                <X aria-hidden />
              </button>
            ) : null}
          </span>
        ))}
        <input
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && options.length > 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          value={draft}
          placeholder={disabled ? undefined : placeholder}
          disabled={disabled}
          onClick={() => {
            if (!open) setOpen(true);
          }}
          onChange={(event) => {
            setDraft(event.target.value);
            setActive(0);
            if (!open) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setOpen(false)}
          {...aria}
        />
      </div>
      {open ? (
        <div role="listbox" id={listId} aria-label={label} className="sf-auto__list sf-tags__list">
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
          {lookup.data && options.length === 0 ? <span className="sf-auto__none">Nothing matches.</span> : null}
          {!lookup.data && lookup.isFetching ? <span className="sf-auto__none">Looking…</span> : null}
          {lookup.error ? <span className="sf-auto__none">{(lookup.error as Error).message}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
