/**
 * What a guardian is to a pupil.
 *
 * `SchoolStudentGuardian.relationship` is free text and always has been —
 * the importer writes whatever a spreadsheet column said — so this is a
 * vocabulary rather than an enum: it is what the forms offer and what the
 * filter searches for, and a row that arrived saying something else still
 * reads back exactly as it was written.
 *
 * Held uppercase because that is what every other writer in the codebase
 * stores (`MOTHER`, `FATHER`, `OTHER` throughout the notices and portal
 * tests) and rendered in sentence case, which is how a person says it.
 */
export const RELATIONSHIP_OPTIONS = [
  { value: "MOTHER", label: "Mother" },
  { value: "FATHER", label: "Father" },
  { value: "GUARDIAN", label: "Guardian" },
  { value: "GRANDPARENT", label: "Grandparent" },
  { value: "AUNT", label: "Aunt" },
  { value: "UNCLE", label: "Uncle" },
  { value: "SIBLING", label: "Sibling" },
  { value: "SPONSOR", label: "Sponsor" },
  { value: "OTHER", label: "Other" },
] as const;

/**
 * "MOTHER" reads as shouting in a table row. Anything outside the vocabulary
 * is left exactly as it was stored — a school that writes "Legal guardian
 * (court order)" means it.
 */
export function relationshipLabel(value: string | null | undefined) {
  if (!value) return "—";
  const known = RELATIONSHIP_OPTIONS.find(
    (option) => option.value === value.trim().toUpperCase(),
  );
  return known ? known.label : value;
}
