"use client";

import { useMemo } from "react";

import { formatAccountingSourceType } from "../source-types";
import type { PostingRuleRecord } from "../api-client";
import { cn } from "@corelithzw/ui/lib/utils";

/**
 * The rule index — grouped by what triggers them, in the order they are tried.
 *
 * Grouping is by source type because that is how somebody arrives: they have a
 * retail sale that posted wrongly, so they want the retail sale rules, and
 * within those they want to know which one won. Priority order is preserved
 * inside each group and shown, because in a rules engine the order *is* the
 * behaviour — the first match wins, and a rule that never fires looks
 * identical to one that does until you can see where it sits in the queue.
 *
 * The 3px edge on each row carries state: brand for the selected rule, amber
 * for a fallback, and nothing at all for an inactive one — which also drops to
 * muted text, so a switched-off rule reads as switched off at a glance rather
 * than only in a Status column at the far right.
 */
export function PostingRuleList({
  rules,
  selectedId,
  onSelect,
  className,
}: {
  rules: PostingRuleRecord[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}) {
  const groups = useMemo(() => {
    const bySource = new Map<string, PostingRuleRecord[]>();
    for (const rule of rules) {
      const key = rule.sourceType;
      const list = bySource.get(key);
      if (list) list.push(rule);
      else bySource.set(key, [rule]);
    }
    // Lowest priority number first — the order the engine tries them in.
    for (const list of bySource.values()) {
      list.sort((a, b) => a.priority - b.priority);
    }
    return Array.from(bySource.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rules]);

  return (
    <section
      className={cn(
        "overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface)]",
        className,
      )}
    >
      <header className="flex h-[34px] items-center gap-2 border-b border-[var(--border-subtle)] px-[13px]">
        <h2 className="text-sm font-bold text-[var(--text-strong)]">Rules</h2>
        <span className="ml-auto font-mono text-sm text-[var(--text-subtle)]">{rules.length}</span>
      </header>

      <div className="max-h-[calc(var(--content-viewport)-8rem)] overflow-y-auto px-1.5 pb-2 pt-1">
        {groups.length === 0 ? (
          <p className="px-2 py-4 text-sm text-[var(--text-muted)]">No rules yet.</p>
        ) : (
          groups.map(([sourceType, groupRules]) => (
            <div key={sourceType}>
              <div className="acct-rail-heading px-2 pb-[3px] pt-2.5">
                {formatAccountingSourceType(sourceType)}
              </div>
              {groupRules.map((rule) => {
                const selected = rule.id === selectedId;
                return (
                  <button
                    key={rule.id}
                    type="button"
                    onClick={() => onSelect(rule.id)}
                    aria-current={selected ? "true" : undefined}
                    className={cn(
                      "flex w-full items-stretch gap-2 rounded-[7px] px-2 py-1.5 text-left",
                      selected ? "bg-[var(--brand-soft)]" : "hover:bg-[var(--surface-muted)]",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="w-[3px] shrink-0 rounded-sm"
                      style={{
                        background: selected
                          ? "var(--brand)"
                          : rule.isFallback
                            ? "var(--tone-warn)"
                            : rule.isActive
                              ? "var(--border-strong)"
                              : "transparent",
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-sm",
                          selected ? "font-bold text-[var(--brand-strong)]" : "font-medium",
                          !rule.isActive && "text-[var(--text-subtle)]",
                          rule.isActive && !selected && "text-[var(--text-body)]",
                        )}
                      >
                        {rule.name}
                      </span>
                      <span className="acct-rail-sub block truncate">
                        {rule.isFallback ? "fallback · " : ""}
                        {rule.isActive ? "" : "inactive · "}
                        {rule.lines.length} line{rule.lines.length === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className="acct-rail-sub shrink-0 self-center">{rule.priority}</span>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
