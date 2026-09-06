"use client";

import { Badge } from "@corelithzw/ui/components/badge";
import { formatFieldValue, type FieldDefinition } from "@corelithzw/module-records/custom-fields";
import type { CrmFieldDefinitionRecord } from "@/lib/crm/crm-v2";

/**
 * Custom fields as they read on a record page, grouped into the sections an
 * administrator arranged them into. Empty fields still show, so a half-filled
 * qualification section is visibly half-filled rather than silently short.
 */
export function CustomFieldDisplay({
  definitions,
  values,
}: {
  definitions: CrmFieldDefinitionRecord[];
  values: Record<string, unknown> | null;
}) {
  if (definitions.length === 0) return null;

  const sections = new Map<string, CrmFieldDefinitionRecord[]>();
  for (const definition of [...definitions].sort((a, b) => a.position - b.position)) {
    const key = definition.section?.trim() || "Additional details";
    const bucket = sections.get(key);
    if (bucket) bucket.push(definition);
    else sections.set(key, [definition]);
  }

  return (
    <>
      {Array.from(sections.entries()).map(([section, fields]) => (
        <section key={section} className="rounded-[var(--card-radius)] border border-[var(--border)] p-3">
          <h3 className="mb-2 text-sm font-semibold text-[var(--text-muted)]">
            {section}
          </h3>
          <dl className="divide-y divide-[var(--border)]">
            {fields.map((definition) => {
              const value = values?.[definition.key];
              const formatted = formatFieldValue(
                definition as unknown as FieldDefinition,
                value ?? null,
              );
              return (
                <div key={definition.id} className="flex items-start justify-between gap-2 py-1.5">
                  <dt className="w-32 shrink-0 text-sm text-[var(--text-muted)]">
                    {definition.label}
                  </dt>
                  <dd className="min-w-0 flex-1 text-right text-sm">
                    {definition.type === "MULTI_SELECT" && Array.isArray(value) ? (
                      <span className="flex flex-wrap justify-end gap-1">
                        {(value as string[]).map((entry) => (
                          <Badge key={entry} variant="secondary">
                            {definition.options?.find((option) => option.value === entry)?.label ??
                              entry}
                          </Badge>
                        ))}
                      </span>
                    ) : (
                      <span className={formatted === "—" ? "text-[var(--text-muted)]" : undefined}>
                        {formatted}
                      </span>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      ))}
    </>
  );
}
