"use client";

import { FormField } from "@/components/management/ui";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import styles from "./branding.module.css";

export type ColorFieldProps = {
  label: string;
  value: string;
  onChange: (next: string) => void;
  /** `aria-label` for the swatch — "Pick the primary colour". */
  swatchLabel: string;
  /** The value the swatch falls back to while the typed hex is incomplete. */
  fallback: string;
};

/** `#RRGGBB`, upper case, or null. The swatch cannot render anything else. */
export function normalizeHexColor(input: string): string | null {
  const value = input.trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(value) ? value : null;
}

/**
 * A 36px swatch and the hex beside it.
 *
 * The board draws `react-colorful`'s panel open under the swatch — a
 * saturation field, a hue rail and a hex box. It is **not a dependency of this
 * repo**, and adding one is not a call this pass makes, so the swatch is a
 * native `<input type="color">`: a real picker, keyboard-operable, at exactly
 * the geometry the board gives the closed row. Swapping the panel in later is
 * a change to this file and nothing else. Reported to the orchestrator.
 */
export function ColorField({
  label,
  value,
  onChange,
  swatchLabel,
  fallback,
}: ColorFieldProps) {
  const swatch = normalizeHexColor(value) ?? normalizeHexColor(fallback) ?? "#000000";

  return (
    <FormField label={label}>
      {(id) => (
        <span className={styles.colorRow}>
          <input
            type="color"
            aria-label={swatchLabel}
            className={styles.swatch}
            value={swatch}
            onChange={(event) => onChange(event.target.value.toUpperCase())}
          />
          <Input
            id={id}
            className={cn("w-full", styles.hex)}
            value={value}
            spellCheck={false}
            onChange={(event) => onChange(event.target.value)}
            onBlur={(event) => {
              const next = normalizeHexColor(event.target.value);
              if (next && next !== value) onChange(next);
            }}
          />
        </span>
      )}
    </FormField>
  );
}
