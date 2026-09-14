/**
 * Who may work on one class's subject.
 *
 * The audit found a teacher reading another class's term marks and its
 * assessment list, both 200, because the routes checked the persona grant and
 * stopped there. The grant is held by every teacher in the school, so on its
 * own it answers "is this a teacher" and nothing else. The two decisions below
 * are the ones that were missing, and they are pure so they can be pinned
 * without a database.
 */

import { describe, it, expect } from "vitest";
import { classSubjectDenial, teachesEverySubject } from "./class-subject-access";

const mine = { teacherProfileId: "teacher-1" };
const theirs = { teacherProfileId: "teacher-2" };

const asTeacher = { teacherProfileId: "teacher-1", moderates: false };
const asModerator = { teacherProfileId: null, moderates: true };

describe("one class subject", () => {
  it("lets a teacher have their own", () => {
    expect(classSubjectDenial(mine, asTeacher)).toBeNull();
  });

  it("keeps a teacher out of a colleague's", () => {
    expect(classSubjectDenial(theirs, asTeacher)).toMatch(/not one of yours/i);
  });

  it("refuses a class that does not exist in the same words as one that does", () => {
    // Otherwise walking ids tells a caller which classes are real.
    expect(classSubjectDenial(null, asTeacher)).toBe(
      classSubjectDenial(theirs, asTeacher),
    );
  });

  it("lets a moderator across classes, which is what moderation is", () => {
    expect(classSubjectDenial(theirs, asModerator)).toBeNull();
  });

  it("refuses a caller with the role but no teacher profile", () => {
    expect(
      classSubjectDenial(mine, { teacherProfileId: null, moderates: false }),
    ).toMatch(/teacher profile/i);
  });
});

describe("a whole class", () => {
  it("refuses a roll-up over a class the caller only has one subject in", () => {
    // The roll-up clears the sheet and rewrites it from every subject, so one
    // subject in the class is not standing to run it over the other two.
    expect(teachesEverySubject([mine, theirs, theirs], "teacher-1")).toBe(false);
  });

  it("allows the class teacher who takes the lot", () => {
    expect(teachesEverySubject([mine, mine, mine], "teacher-1")).toBe(true);
  });

  it("does not let an empty class pass for ownership", () => {
    expect(teachesEverySubject([], "teacher-1")).toBe(false);
  });
});
