"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Search } from "@/lib/icons";
import { groupedVariables } from "@/lib/crm/template-variables";

import styles from "./builder.module.css";

/**
 * The list of things a template can fill in, and a way to put one in.
 *
 * Offered as a picker rather than left to memory because the catalogue is the
 * contract: a variable somebody types from memory and spells slightly wrong
 * renders as itself in a draft and as a blank in the customer's copy. Picking
 * from a list means every variable in a template is one that resolves.
 */
export function VariablePicker({
  onPick,
  label = "Insert a variable",
}: {
  onPick: (token: string) => void;
  label?: string;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();

  const groups = groupedVariables()
    .map((group) => ({
      ...group,
      entries: needle
        ? group.entries.filter(
            (entry) =>
              entry.label.toLowerCase().includes(needle) ||
              entry.key.toLowerCase().includes(needle),
          )
        : group.entries,
    }))
    .filter((group) => group.entries.length > 0);

  return (
    <Popover>
      <PopoverTrigger asChild>
        {/* The inspector's own 32px rung, not the DS's 36px one — beside a
            field label at 12px a 36px button reads as the page's verb. */}
        <button type="button" className={styles.btn}>
          <Plus aria-hidden="true" />
          {label}
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-80 p-0">
        <div className="relative border-b border-[var(--border-subtle)] p-2">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[var(--text-subtle)]"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search variables"
            aria-label="Search variables"
            className="h-8 pl-8"
          />
        </div>

        <div className="max-h-80 overflow-y-auto p-1">
          {groups.map((group) => (
            <section key={group.group}>
              <p className={styles.pickerGroup}>{group.label}</p>
              <ul>
                {group.entries.map((entry) => (
                  <li key={entry.key}>
                    <button
                      type="button"
                      onClick={() => onPick(`{{${entry.key}}}`)}
                      className={styles.pickerItem}
                    >
                      <span className={styles.pickerLabel}>{entry.label}</span>
                      <span className={styles.pickerKey}>
                        {`{{${entry.key}}}`} · {entry.example}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {groups.length === 0 ? (
            <p className={styles.pickerEmpty}>Nothing matches that.</p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
