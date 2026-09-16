import { describe, it, expect } from "vitest";
import { canSchool } from "./access";
import {
  registerLockDenial,
  registerMarkDenial,
  registerSubmitDenial,
} from "./register";

/**
 * The register's state machine, and who may move it.
 *
 * These are the rules behind the defect the audit called the most visible one
 * in the product: nothing ever left DRAFT, so the office board showed every
 * class as unsubmitted and the parent app labelled every day "not yet
 * submitted". The transition itself lives in
 * `app/api/v2/schools/attendance/sessions/[id]/submit/route.ts` and needs a
 * database; what it is allowed to do does not, so it is tested here.
 */

describe("taking and sending in a register", () => {
  it("lets the portal send in the draft it has just saved", () => {
    // Saving leaves the session DRAFT on purpose — a register is taken in
    // pieces — so DRAFT is exactly the state Submit has to accept.
    expect(registerSubmitDenial("DRAFT")).toBeNull();
  });

  it("keeps a submitted register open to the teacher who took it", () => {
    // A mis-tap noticed after sending in must not become a phone call to the
    // office, so marking a SUBMITTED session is still allowed and the session
    // stays submitted: nothing in the mark path touches its status.
    expect(registerMarkDenial("SUBMITTED")).toBeNull();
  });

  it("refuses to send the same day in twice", () => {
    expect(registerSubmitDenial("SUBMITTED")).not.toBeNull();
  });

  it("refuses both marking and sending in once the office has locked the day", () => {
    expect(registerMarkDenial("LOCKED")).not.toBeNull();
    expect(registerSubmitDenial("LOCKED")).not.toBeNull();
  });

  it("leaves a draft open to marks, which is most of taking one", () => {
    expect(registerMarkDenial("DRAFT")).toBeNull();
  });
});

describe("locking a register", () => {
  it("waits for the teacher to send the day in", () => {
    expect(registerLockDenial("DRAFT")).not.toBeNull();
    expect(registerLockDenial("SUBMITTED")).toBeNull();
    expect(registerLockDenial("LOCKED")).not.toBeNull();
  });

  it("is the office's to do and not the teacher's", () => {
    // A teacher holds `submit`, which the lock route used to be guarded on, so
    // the person who took the register could also sign it off. Locking is
    // oversight or it is nothing.
    expect(canSchool("TEACHER", "schools.attendance", "lock")).toBe(false);
    expect(canSchool("TEACHER", "schools.attendance", "submit")).toBe(true);
    expect(canSchool("SCHOOL_ADMIN", "schools.attendance", "lock")).toBe(true);
    expect(canSchool("REGISTRAR", "schools.attendance", "lock")).toBe(true);
  });

  it("is not opened up to every role the office happens to trust", () => {
    // The old guard also let a bursar through, by way of a privileged-role
    // test that has nothing to do with attendance.
    expect(canSchool("BURSAR", "schools.attendance", "lock")).toBe(false);
    expect(canSchool("HOD", "schools.attendance", "lock")).toBe(false);
    expect(canSchool("WARDEN", "schools.attendance", "lock")).toBe(false);
  });
});
