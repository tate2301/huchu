/**
 * A stable colour per subject.
 *
 * The prototype hard-codes a hue for each of its seven subjects — maths blue,
 * ChiShona red, history orange — and leans on it everywhere: the timetable
 * blocks, the bar under a mark, the tag down the side of a homework card. A real
 * school's subject list is not that list, so the hue is derived from the subject
 * name instead of stored: same name, same colour, on every screen and between
 * sessions, with no column to migrate.
 *
 * The returned class only sets custom properties (`--sp-a`, `--sp-a-bg`,
 * `--sp-a-fg`) which `student-portal.css` reads. That keeps the accent in the
 * token layer rather than as inline colour, so dark mode still flips.
 */
const ACCENT_COUNT = 10;

export function subjectAccentClass(key: string | null | undefined) {
  if (!key) return "sp-c-0";
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) % 100000;
  }
  return `sp-c-${hash % ACCENT_COUNT}`;
}
