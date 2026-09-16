/**
 * What a school calls its classes, which is not "year group".
 *
 * ## The word
 *
 * A Zimbabwean secondary school says **Form 1–6**. A primary says **Grade 1–7**,
 * with **ECD A** and **ECD B** below them. Neither says "year group" — that is
 * a British import, and it was the label on 400-odd strings across this module.
 *
 * The right word is not a global setting, because a combined school runs both
 * ladders at once and a Grade 4 is not a Form. It has to come from the class
 * itself, and it already can: `SchoolClass.level` is the rung, and the rung says
 * which ladder it is on.
 *
 * ## The ladder
 *
 * One continuous ordering across the whole school, so `orderBy: { level: "asc" }`
 * — which the classes list, report cards and fee runs all use — puts ECD above
 * Grade 1 above Form 1:
 *
 * | Level  | Stage | Named        |
 * |--------|-------|--------------|
 * | 0      | ECD   | ECD A, ECD B |
 * | 1–7    | Grade | Grade 1–7    |
 * | 8–13   | Form  | Form 1–6     |
 *
 * `provisionSchool` has laid this down since the module shipped, and it is the
 * ladder every existing tenant is on. It is expressed here once and imported
 * there, because it was previously a private constant in `provision.ts` — and
 * the New class dialog, the *other* thing that writes a level, shipped a set of
 * quick presets putting Form 1 at level 1. A school that was provisioned and
 * then added Lower Sixth by hand got Form 1 sorting above Grade 1, and no
 * screen it appeared on could have told anyone why.
 *
 * ## Why levels, not a new column
 *
 * A `stage` enum on `SchoolClass` would be a second source of the same fact,
 * and the two would drift the first time somebody edited one of them. The rung
 * number already determines the stage; a school that moves a class up the
 * ladder moves it to the ladder that rung is on, which is the behaviour you
 * want when a primary adds a secondary wing.
 */

/** Which of the two ladders — plus the infant years below both. */
export type ClassStage = "ECD" | "GRADE" | "FORM";

/** ECD A and ECD B share this rung; they are a pair, not an ordering. */
export const ECD_LEVEL = 0;
/** Grade 1 through Grade 7. */
export const GRADE_MIN = 1;
export const GRADE_MAX = 7;
/** Form 1 through Form 6, continuing the same ordering. */
export const FORM_MIN = GRADE_MAX + 1;
export const FORM_MAX = 13;

/**
 * The stage a rung is on, or null when the class has no rung.
 *
 * `level` is nullable and always has been, so a class created before this
 * existed — or through the API without one — genuinely has no stage. Callers
 * get null and fall back to the neutral word rather than guessing "Form".
 *
 * Anything above the Form ladder is still a Form: a school running a seventh
 * secondary year is on the secondary ladder, and refusing to name it would be
 * worse than naming it late.
 */
export function classStage(level: number | null | undefined): ClassStage | null {
  if (level == null || !Number.isFinite(level)) return null;
  if (level <= ECD_LEVEL) return "ECD";
  if (level <= GRADE_MAX) return "GRADE";
  return "FORM";
}

/** The rung's ordinal within its own ladder — level 9 is Form 2. */
export function stageOrdinal(level: number): number {
  const stage = classStage(level);
  if (stage === "FORM") return level - GRADE_MAX;
  return level;
}

/** The level a named rung sits at — Form 2 is level 9. */
export function levelFor(stage: ClassStage, ordinal: number): number {
  if (stage === "ECD") return ECD_LEVEL;
  if (stage === "FORM") return GRADE_MAX + ordinal;
  return ordinal;
}

/**
 * What the rung is called: "Form 2", "Grade 4", "the ECD years".
 *
 * Used where a level number would otherwise be shown raw. The classes screen
 * used to label its level filter with the names of the classes at that level,
 * which worked only because every tenant had named them conventionally.
 */
export function rungName(level: number | null | undefined): string | null {
  const stage = classStage(level);
  if (stage == null) return null;
  if (stage === "ECD") return "the ECD years";
  return `${stage === "FORM" ? "Form" : "Grade"} ${stageOrdinal(level as number)}`;
}

/**
 * The noun for a set of classes, in the four shapes copy actually needs.
 *
 * Title case is for a field label standing on its own; lower case is for
 * mid-sentence. Singular does the distributive duty too — "every form",
 * "choose a form" — because a combined school's plural is awkward in that slot
 * and its singular is not.
 */
export type ClassVocabulary = {
  /** Mid-sentence singular: "choose a form", "every grade". */
  one: string;
  /** Mid-sentence plural: "no forms yet". */
  many: string;
  /** Label case: "Form". */
  One: string;
  /** Label case plural: "Forms". */
  Many: string;
};

const FORM_WORDS: ClassVocabulary = { one: "form", many: "forms", One: "Form", Many: "Forms" };
const GRADE_WORDS: ClassVocabulary = { one: "grade", many: "grades", One: "Grade", Many: "Grades" };

/*
 * A combined school has to hear both, and there is no single Zimbabwean word
 * covering a Grade 4 and a Form 2. "Form or grade" is what a head actually says
 * when they mean either, and it survives the slots this word lands in: "every
 * form or grade", "choose a form or grade", "no forms or grades yet".
 */
const BOTH_WORDS: ClassVocabulary = {
  one: "form or grade",
  many: "forms or grades",
  One: "Form or grade",
  Many: "Forms and grades",
};

/*
 * The fallback, for a school whose classes carry no levels at all. "Class" is
 * what the model calls the row and is true of any school, which is the whole
 * requirement of a fallback — it must never be *wrong*, only unspecific.
 */
const NEUTRAL_WORDS: ClassVocabulary = {
  one: "class",
  many: "classes",
  One: "Class",
  Many: "Classes",
};

/**
 * The word this school uses, from the rungs its classes actually occupy.
 *
 * ECD counts as primary: a school running ECD and Grades says "grade" for the
 * lot, and nobody calls an ECD class a form.
 */
export function classVocabulary(
  levels: ReadonlyArray<number | null | undefined>,
): ClassVocabulary {
  let hasForm = false;
  let hasPrimary = false;
  for (const level of levels) {
    const stage = classStage(level);
    if (stage === "FORM") hasForm = true;
    else if (stage != null) hasPrimary = true;
    if (hasForm && hasPrimary) return BOTH_WORDS;
  }
  if (hasForm) return FORM_WORDS;
  if (hasPrimary) return GRADE_WORDS;
  return NEUTRAL_WORDS;
}

/** The neutral word, for server-side copy that has no class list to read. */
export const NEUTRAL_CLASS_WORDS = NEUTRAL_WORDS;

/**
 * The rungs a school can be offered when creating a class, in ladder order.
 *
 * `provisionSchool` lays these down for a new tenant and the New class dialog
 * offers the same set, so a school that provisions as PRIMARY and later adds a
 * secondary wing by hand lands on the rungs it would have had all along.
 */
export const CLASS_LADDER: ReadonlyArray<{
  code: string;
  name: string;
  level: number;
  stage: ClassStage;
}> = [
  { code: "ECD-A", name: "ECD A", level: ECD_LEVEL, stage: "ECD" },
  { code: "ECD-B", name: "ECD B", level: ECD_LEVEL, stage: "ECD" },
  ...Array.from({ length: GRADE_MAX }, (_, index) => ({
    code: `G${index + 1}`,
    name: `Grade ${index + 1}`,
    level: levelFor("GRADE", index + 1),
    stage: "GRADE" as const,
  })),
  ...Array.from({ length: FORM_MAX - GRADE_MAX }, (_, index) => ({
    code: `F${index + 1}`,
    name: `Form ${index + 1}`,
    level: levelFor("FORM", index + 1),
    stage: "FORM" as const,
  })),
];
