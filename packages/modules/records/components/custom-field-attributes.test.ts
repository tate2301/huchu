/**
 * The editable-type sets name real field types.
 *
 * `TEXT_EDITABLE` and `NUMBER_EDITABLE` are sets of strings compared against a
 * `CrmFieldType`. A name that is not a member of that enum does not fail to
 * compile and does not throw — the lookup simply returns false and the field
 * quietly becomes read-only. That is exactly what had happened: the set said
 * "TEXT" and "TEXTAREA" where the enum says SHORT_TEXT and LONG_TEXT, so the
 * two commonest custom-field types were the two nobody could edit inline.
 *
 * Asserting the sets against the enum is the only thing that catches this
 * class of typo, because nothing else can.
 */
import { describe, expect, it } from "vitest";

import { CRM_FIELD_TYPES } from "../custom-fields";

import { NUMBER_EDITABLE, TEXT_EDITABLE } from "./custom-field-attributes";

describe("inline-editable custom field types", () => {
  it("only names types the enum actually has", () => {
    const known = new Set<string>(CRM_FIELD_TYPES);
    const unknown = [...TEXT_EDITABLE, ...NUMBER_EDITABLE].filter(
      (type) => !known.has(type),
    );
    expect(unknown).toEqual([]);
  });

  it("covers both text types, which is the bug that was here", () => {
    expect(TEXT_EDITABLE.has("SHORT_TEXT")).toBe(true);
    expect(TEXT_EDITABLE.has("LONG_TEXT")).toBe(true);
  });

  it("leaves types a text box would mangle read-only", () => {
    // A box that accepts "next tuesday" into a date column is worse than no
    // editor, so these stay on the formatted read-only branch until they have
    // a real widget.
    for (const type of ["DATE", "DATETIME", "CHECKBOX", "SINGLE_SELECT", "MULTI_SELECT"]) {
      expect(TEXT_EDITABLE.has(type), `${type} should not be a text box`).toBe(false);
      expect(NUMBER_EDITABLE.has(type), `${type} should not be a number box`).toBe(false);
    }
  });
});
