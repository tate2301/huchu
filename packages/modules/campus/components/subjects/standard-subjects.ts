/**
 * The subjects a Zimbabwean secondary school actually offers.
 *
 * Not specimen data: this is the ZIMSEC O- and A-level catalogue as schools on
 * this pack run it, and it is the same list every one of them types in by hand
 * on their first afternoon — seven core rows and a long tail of electives,
 * each with the pass mark the ministry works to (50 for a core subject, 45 for
 * an elective).
 *
 * It exists because the catalogue screen's create dialog asked for a code, a
 * name and a pass mark twenty-two times over, and every school produced a
 * slightly different set of codes for the same subjects — which then failed to
 * match on import and on every report that groups by subject.
 */

export type StandardSubject = {
  code: string;
  name: string;
  isCore: boolean;
  passMark: number;
};

export const STANDARD_SUBJECTS: StandardSubject[] = [
  { code: "MAT", name: "Mathematics", isCore: true, passMark: 50 },
  { code: "ENG", name: "English Language", isCore: true, passMark: 50 },
  { code: "CSC", name: "Combined Science", isCore: true, passMark: 50 },
  { code: "SHO", name: "Shona", isCore: true, passMark: 50 },
  { code: "NDE", name: "Ndebele", isCore: true, passMark: 50 },
  { code: "HER", name: "Heritage Studies", isCore: true, passMark: 50 },
  { code: "GEO", name: "Geography", isCore: false, passMark: 45 },
  { code: "HIS", name: "History", isCore: false, passMark: 45 },
  { code: "BIO", name: "Biology", isCore: false, passMark: 45 },
  { code: "CHE", name: "Chemistry", isCore: false, passMark: 45 },
  { code: "PHY", name: "Physics", isCore: false, passMark: 45 },
  { code: "ACC", name: "Principles of Accounts", isCore: false, passMark: 45 },
  { code: "BST", name: "Business Studies", isCore: false, passMark: 45 },
  { code: "CSD", name: "Computer Science", isCore: false, passMark: 45 },
  { code: "AGR", name: "Agriculture", isCore: false, passMark: 45 },
  { code: "ART", name: "Art", isCore: false, passMark: 45 },
  { code: "MUS", name: "Music", isCore: false, passMark: 45 },
  { code: "PED", name: "Physical Education", isCore: false, passMark: 45 },
  { code: "REL", name: "Religious Studies", isCore: false, passMark: 45 },
  { code: "FRE", name: "French", isCore: false, passMark: 45 },
  { code: "LAT", name: "Latin", isCore: false, passMark: 45 },
  { code: "WOO", name: "Woodwork", isCore: false, passMark: 45 },
];

/** The ones every pupil in the school takes. */
export const CORE_SUBJECT_NAMES = STANDARD_SUBJECTS.filter(
  (subject) => subject.isCore,
).map((subject) => subject.name);
