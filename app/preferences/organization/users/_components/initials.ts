/**
 * Two letters for a person's mark, from a name or, failing that, an email.
 *
 * The list rows and the record header draw the same mark, so they derive it
 * the same way: a managed user carries no avatar in the list payload, and
 * inventing one per surface is how two marks for one person happen.
 */
export function initialsOf(value: string | null | undefined): string {
  if (!value) return "·";
  const parts = value
    .replace(/@.*$/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (parts.length === 0) return "·";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}
