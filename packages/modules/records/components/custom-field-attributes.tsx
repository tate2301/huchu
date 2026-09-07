"use client";

import {
  Building2,
  Calendar,
  Globe,
  ListBullets,
  Mail,
  MapPin,
  Payments,
  Percent,
  Phone,
  ToggleLeft,
  UserRound,
  type LucideIcon,
} from "@corelithzw/ui/lib/icons";
import { formatFieldValue, type FieldDefinition } from "../custom-fields";
import type { FieldDefinitionRecord as CrmFieldDefinitionRecord } from "../custom-fields";

import type { RecordAttribute, RecordAttributeTone } from "./record-attributes";

/**
 * An administrator's custom fields, as editable properties.
 *
 * They were drawn in a boxed panel below the tabs, read-only, on four of the
 * five record types — leads had none at all. So a field somebody added to
 * capture "roof type" could be filled in on the create form and never
 * corrected afterwards, and on a lead not captured at all.
 *
 * They are properties like any other now: they join the record's attribute
 * list, in the order and sections the administrator arranged, and write
 * through the same PATCH. Anything with a fixed set of answers or a shape a
 * text box would mangle keeps its formatted read-only rendering until it has
 * a real editor — a date picker in a property row is its own piece of work,
 * and a text box that accepts "next tuesday" into a date column is worse than
 * no editor.
 */

/**
 * Types a text box can safely round-trip.
 *
 * These are `CrmFieldType` values — checked against `CRM_FIELD_TYPES` by the
 * test beside this file, because they were not. This set previously named
 * "TEXT" and "TEXTAREA", which the enum has never had: the values are
 * SHORT_TEXT and LONG_TEXT. Both therefore fell through to the read-only
 * branch, so the two commonest custom-field types were the two nobody could
 * edit from a property row, while URL, EMAIL and PHONE worked. Nothing failed —
 * a Set lookup on a string that is not in it is just `false`.
 */
export const TEXT_EDITABLE = new Set(["SHORT_TEXT", "LONG_TEXT", "URL", "EMAIL", "PHONE"]);
export const NUMBER_EDITABLE = new Set(["NUMBER", "CURRENCY", "PERCENT"]);

/**
 * A mark per field type, so an administrator's fields sit in the same column
 * as the built-in properties instead of under a run of identical fallbacks.
 * A type nobody has a glyph for takes the property list's own default.
 */
const FIELD_ICON: Record<string, LucideIcon> = {
  CURRENCY: Payments,
  PERCENT: Percent,
  DATE: Calendar,
  DATETIME: Calendar,
  CHECKBOX: ToggleLeft,
  SINGLE_SELECT: ListBullets,
  MULTI_SELECT: ListBullets,
  PHONE: Phone,
  EMAIL: Mail,
  URL: Globe,
  ADDRESS: MapPin,
  SITE: MapPin,
  USER: UserRound,
  PERSON: UserRound,
  COMPANY: Building2,
};

/**
 * And a tone, on the same reasoning the built-in properties use: money is the
 * figure you act on, a phone number or a reference is read digit by digit and
 * wants a monospace column, and everything else is prose.
 */
const FIELD_TONE: Record<string, RecordAttributeTone> = {
  CURRENCY: "money",
  NUMBER: "code",
  PERCENT: "code",
  PHONE: "code",
};

export function customFieldAttributes({
  definitions,
  values,
  onCommit,
}: {
  definitions: CrmFieldDefinitionRecord[];
  values: Record<string, unknown> | null;
  /** Writes one custom field. The caller owns the PATCH and its cache. */
  onCommit: (key: string, value: unknown) => void;
}): RecordAttribute[] {
  return [...definitions]
    .filter((definition) => !definition.archivedAt)
    .sort((a, b) => a.position - b.position)
    .map((definition) => {
      const raw = values?.[definition.key] ?? null;
      const label = definition.section
        ? `${definition.section} · ${definition.label}`
        : definition.label;

      const icon = FIELD_ICON[definition.type];
      const tone = FIELD_TONE[definition.type];

      if (TEXT_EDITABLE.has(definition.type)) {
        return {
          id: `cf-${definition.key}`,
          label,
          icon,
          tone,
          placeholder: "Empty",
          value: raw == null ? null : String(raw),
          onCommit: (next: string) => onCommit(definition.key, next.trim() || null),
        };
      }

      if (NUMBER_EDITABLE.has(definition.type)) {
        return {
          id: `cf-${definition.key}`,
          label,
          icon,
          tone,
          placeholder: "Empty",
          value: raw == null ? null : String(raw),
          onCommit: (next: string) => {
            const trimmed = next.trim();
            if (trimmed === "") return onCommit(definition.key, null);
            const parsed = Number(trimmed);
            if (Number.isFinite(parsed)) onCommit(definition.key, parsed);
          },
        };
      }

      // Selects, dates, booleans: shown as the administrator defined them,
      // formatted, until each has an editor that cannot corrupt the value.
      return {
        id: `cf-${definition.key}`,
        label,
        icon,
        tone,
        value: formatFieldValue(definition as unknown as FieldDefinition, raw),
        placeholder: "Empty",
      };
    });
}
