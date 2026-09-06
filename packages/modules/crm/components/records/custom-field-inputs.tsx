"use client";

import { useMemo } from "react";

import { Checkbox } from "@corelithzw/ui/components/checkbox";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { Textarea } from "@corelithzw/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { Badge } from "@corelithzw/ui/components/badge";
import type { CrmFieldDefinitionRecord } from "../../crm-v2";

/**
 * Renders whatever custom fields an administrator has defined for a record
 * type, grouped into their sections. This is what makes "add a field in
 * settings and it shows up on the form" true rather than aspirational.
 */
export function CustomFieldInputs({
  definitions,
  values,
  onChange,
}: {
  definitions: CrmFieldDefinitionRecord[];
  values: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const sections = useMemo(() => {
    const map = new Map<string, CrmFieldDefinitionRecord[]>();
    for (const definition of [...definitions].sort((a, b) => a.position - b.position)) {
      const key = definition.section?.trim() || "Additional details";
      const bucket = map.get(key);
      if (bucket) bucket.push(definition);
      else map.set(key, [definition]);
    }
    return Array.from(map.entries());
  }, [definitions]);

  if (definitions.length === 0) return null;

  const set = (key: string, value: unknown) => onChange({ ...values, [key]: value });

  return (
    <>
      {sections.map(([section, fields]) => (
        <section key={section} className="space-y-3">
          <h3 className="text-base font-semibold text-[var(--text-strong)]">
            {section}
          </h3>
          {fields.map((definition) => (
            <CustomFieldInput
              key={definition.id}
              definition={definition}
              value={values[definition.key]}
              onChange={(value) => set(definition.key, value)}
            />
          ))}
        </section>
      ))}
    </>
  );
}

function CustomFieldInput({
  definition,
  value,
  onChange,
}: {
  definition: CrmFieldDefinitionRecord;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const id = `cf-${definition.key}`;
  const label = (
    <Label htmlFor={id}>
      {definition.label}
      {definition.isRequired ? " *" : ""}
    </Label>
  );
  const hint = definition.description ? (
    <p className="text-sm text-[var(--text-muted)]">{definition.description}</p>
  ) : null;

  switch (definition.type) {
    case "LONG_TEXT":
    case "ADDRESS":
      return (
        <div className="space-y-1.5">
          {label}
          <Textarea
            id={id}
            value={(value as string) ?? ""}
            onChange={(event) => onChange(event.target.value)}
            rows={3}
          />
          {hint}
        </div>
      );

    case "CHECKBOX":
      return (
        <label className="flex cursor-pointer items-start gap-2.5">
          <Checkbox
            id={id}
            checked={value === true}
            onCheckedChange={(checked) => onChange(checked === true)}
            className="mt-0.5"
          />
          <span className="text-sm">
            {definition.label}
            {definition.description ? (
              <span className="block text-[var(--text-muted)]">{definition.description}</span>
            ) : null}
          </span>
        </label>
      );

    case "SINGLE_SELECT":
      return (
        <div className="space-y-1.5">
          {label}
          <Select
            value={(value as string) || "__none"}
            onValueChange={(next) => onChange(next === "__none" ? null : next)}
          >
            <SelectTrigger id={id}>
              <SelectValue placeholder="Not set" />
            </SelectTrigger>
            <SelectContent>
              {!definition.isRequired ? <SelectItem value="__none">Not set</SelectItem> : null}
              {(definition.options ?? []).map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hint}
        </div>
      );

    case "MULTI_SELECT": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="space-y-1.5">
          {label}
          <div className="flex flex-wrap gap-1.5">
            {(definition.options ?? []).map((option) => {
              const isOn = selected.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    onChange(
                      isOn
                        ? selected.filter((entry) => entry !== option.value)
                        : [...selected, option.value],
                    )
                  }
                  aria-pressed={isOn}
                >
                  <Badge variant={isOn ? "default" : "outline"}>{option.label}</Badge>
                </button>
              );
            })}
          </div>
          {hint}
        </div>
      );
    }

    case "NUMBER":
    case "CURRENCY":
    case "PERCENT":
      return (
        <div className="space-y-1.5">
          {label}
          <Input
            id={id}
            inputMode="decimal"
            className="font-mono"
            value={(value as string | number) ?? ""}
            onChange={(event) => onChange(event.target.value)}
            placeholder={definition.type === "PERCENT" ? "0–100" : "0"}
          />
          {hint}
        </div>
      );

    case "DATE":
    case "DATETIME":
      return (
        <div className="space-y-1.5">
          {label}
          <Input
            id={id}
            type={definition.type === "DATE" ? "date" : "datetime-local"}
            value={((value as string) ?? "").slice(0, definition.type === "DATE" ? 10 : 16)}
            onChange={(event) => onChange(event.target.value || null)}
          />
          {hint}
        </div>
      );

    default:
      return (
        <div className="space-y-1.5">
          {label}
          <Input
            id={id}
            type={definition.type === "EMAIL" ? "email" : definition.type === "URL" ? "url" : "text"}
            value={(value as string) ?? ""}
            onChange={(event) => onChange(event.target.value)}
          />
          {hint}
        </div>
      );
  }
}
