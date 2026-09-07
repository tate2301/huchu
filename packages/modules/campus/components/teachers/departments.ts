/**
 * The departments a secondary school is organised into.
 *
 * `SchoolTeacherProfile.department` is free text and stays that way — a school
 * that runs "Business and Enterprise" means it. This is a *suggestion* list,
 * offered on the teacher form as a datalist, for one reason: the Department
 * filter on the staff list is built from the distinct values actually stored,
 * so "Maths", "Mathematics" and "maths" typed on three different mornings
 * become three separate filter options for one department. Offering the
 * spelling first is cheaper than reconciling it later.
 *
 * The vocabulary is the canvas's, and it is generic rather than any one
 * school's: these are the faculty names a Zimbabwean secondary timetable is
 * grouped under. "General" is the badge the staff list already shows for a
 * teacher who holds no form and heads nothing.
 */
export const DEPARTMENT_SUGGESTIONS = [
  "Mathematics",
  "Languages",
  "Sciences",
  "Humanities",
  "Commercials",
  "Practical Subjects",
  "Sport",
  "General",
] as const;
