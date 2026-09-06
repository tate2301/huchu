"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { CrmFieldDefinitionRecord } from "@/lib/crm/crm-v2";

/**
 * The school's own fields, on a create form.
 *
 * `components/records/custom-field-attributes.tsx` does this for a record
 * page's property list, where each row commits on its own. A create form is
 * the other half: everything is held until the pupil is written, so the values
 * live in the caller's state and arrive back as one `customFields` object.
 *
 * The types a form can honestly collect are collected. Anything that needs a
 * picker this form does not have — a person, a company, a site — is named and
 * left for the record page rather than drawn as a text box that would store a
 * string where the server wants an id.
 */

const RELATIONAL = new Set(["USER", "PERSON", "COMPANY", "SITE"]);

export function CustomFieldInputs({
  definitions,
  values,
  onChange,
  idPrefix,
}: {
  definitions: CrmFieldDefinitionRecord[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  /** Keeps input ids unique when two of these are on one screen. */
  idPrefix: string;
}) {
  const live = definitions
    .filter((definition) => !definition.archivedAt)
    .sort((a, b) => a.position - b.position);

  if (live.length === 0) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {live.map((definition) => {
        const id = `${idPrefix}-${definition.key}`;
        const raw = values[definition.key];
        const label = (
          <Label htmlFor={id}>
            {definition.label}
            {definition.isRequired ? " *" : ""}
          </Label>
        );

        if (RELATIONAL.has(definition.type)) {
          return (
            <div key={definition.key} className="space-y-2">
              {label}
              <p className="text-sm text-muted-foreground">
                Set on the pupil&rsquo;s record once they are saved — this one needs a
                picker the desk form does not carry.
              </p>
            </div>
          );
        }

        if (definition.type === "LONG_TEXT" || definition.type === "ADDRESS") {
          return (
            <div key={definition.key} className="space-y-2 sm:col-span-2">
              {label}
              <Textarea
                id={id}
                rows={3}
                value={typeof raw === "string" ? raw : ""}
                onChange={(event) => onChange(definition.key, event.target.value)}
              />
            </div>
          );
        }

        if (definition.type === "CHECKBOX") {
          return (
            <div key={definition.key} className="space-y-2">
              <Label className="flex items-start gap-2">
                <Checkbox
                  checked={raw === true}
                  onCheckedChange={(checked) => onChange(definition.key, checked === true)}
                />
                <span>{definition.label}</span>
              </Label>
            </div>
          );
        }

        if (definition.type === "SINGLE_SELECT") {
          const options = definition.options ?? [];
          return (
            <div key={definition.key} className="space-y-2">
              {label}
              <Select
                value={typeof raw === "string" && raw ? raw : "__none__"}
                onValueChange={(next) =>
                  onChange(definition.key, next === "__none__" ? null : next)
                }
              >
                <SelectTrigger id={id}>
                  <SelectValue placeholder="Not set" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Not set</SelectItem>
                  {options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }

        if (definition.type === "MULTI_SELECT") {
          const chosen = Array.isArray(raw) ? (raw as string[]) : [];
          return (
            <div key={definition.key} className="space-y-2 sm:col-span-2">
              {label}
              <div className="flex flex-wrap gap-3">
                {(definition.options ?? []).map((option) => (
                  <Label key={option.value} className="flex items-center gap-2">
                    <Checkbox
                      checked={chosen.includes(option.value)}
                      onCheckedChange={(checked) =>
                        onChange(
                          definition.key,
                          checked === true
                            ? [...chosen, option.value]
                            : chosen.filter((entry) => entry !== option.value),
                        )
                      }
                    />
                    <span>{option.label}</span>
                  </Label>
                ))}
              </div>
            </div>
          );
        }

        const type =
          definition.type === "DATE"
            ? "date"
            : definition.type === "DATETIME"
              ? "datetime-local"
              : definition.type === "NUMBER" ||
                  definition.type === "CURRENCY" ||
                  definition.type === "PERCENT"
                ? "number"
                : definition.type === "EMAIL"
                  ? "email"
                  : "text";

        return (
          <div key={definition.key} className="space-y-2">
            {label}
            {definition.description ? (
              <p className="text-sm text-muted-foreground">{definition.description}</p>
            ) : null}
            <Input
              id={id}
              type={type}
              value={raw == null ? "" : String(raw)}
              onChange={(event) => {
                const next = event.target.value;
                if (type === "number") {
                  onChange(definition.key, next === "" ? null : Number(next));
                  return;
                }
                onChange(definition.key, next === "" ? null : next);
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
