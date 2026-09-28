/**
 * A safeguarding note's body is disclosed by opening it, and never by listing it.
 *
 * `openNote` writes `schools.pastoral.note.read` every time a body is handed
 * over, on the principle its own comment states: "a model nobody can audit is a
 * claim rather than a control."
 *
 * The listing defeated that completely. It selected `body`, the screen printed
 * it in the table row, and so every note a reader was cleared for was disclosed
 * on page load with no audit row anywhere — leaving the per-note read that IS
 * audited as the one disclosure that had already happened.
 *
 * This is a shape assertion because that is the only kind of gate that can see
 * it: the client types are hand-written, so the endpoint could put a body back
 * in the listing and typecheck, lint and every behavioural test would stay
 * green while the screen quietly started printing it again.
 *
 * Prerequisites: a real Postgres DATABASE_URL_TEST with the migrations applied.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { listNotesForViewer, readNote } from "./pastoral-access";

let companyId: string;
let studentId: string;
let noteId: string;
const READER = "pastoral-reader-user";

const SECRET = "The body of a safeguarding note, which a list must not carry.";

beforeAll(async () => {
  await prisma.$connect();
  const stamp = Date.now();
  const company = await prisma.company.create({
    data: { name: `Pastoral Listing ${stamp}`, slug: `pastoral-listing-${stamp}` },
  });
  companyId = company.id;

  const student = await prisma.schoolStudent.create({
    data: {
      companyId,
      studentNo: `PL-${stamp}`,
      firstName: "Anesu",
      lastName: "Chirwa",
      status: "ACTIVE",
    },
  });
  studentId = student.id;

  const note = await prisma.schoolPastoralNote.create({
    data: {
      companyId,
      studentId,
      authorUserId: READER,
      body: SECRET,
      band: "PASTORAL_TEAM_ONLY",
    },
  });
  noteId = note.id;

  // Readability is a clearance, not authorship. The Pastoral screen's whole
  // argument is that seniority does not grant access, so the test grants it
  // the way the product does.
  await prisma.schoolPastoralClearance.create({
    data: {
      companyId,
      userId: READER,
      bands: ["PASTORAL_TEAM_ONLY"],
      scope: "SCHOOL",
      grantedByUserId: READER,
    },
  });
});

afterAll(async () => {
  await prisma.company.delete({ where: { id: companyId } });
  await prisma.$disconnect();
});

describe("the pastoral listing", () => {
  it("never carries a note's body", async () => {
    const listing = await listNotesForViewer({ companyId, userId: READER });
    const readable = listing.notes.filter((note) => note.readable);
    expect(readable.length).toBeGreaterThan(0);

    for (const note of readable) {
      expect(note).not.toHaveProperty("body");
      // And nothing else on the row smuggles it either.
      expect(JSON.stringify(note)).not.toContain(SECRET);
    }
  });

  it("gives the body up when the note is actually opened", async () => {
    // The other half. A list that hides the body is only correct if the audited
    // path still works — otherwise this is not a control, it is a broken screen.
    const opened = await readNote({ companyId, userId: READER }, noteId);
    expect(opened?.body).toBe(SECRET);
  });
});
