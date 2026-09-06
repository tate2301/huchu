/**
 * Messages between a family and the school.
 *
 * The risk here is not "does a row get written" — it is who can read a
 * conversation and whether the unread badge tells the truth. A parent who can
 * open another family's thread is a safeguarding incident, and a badge that
 * lights up over an empty inbox is one people learn to ignore, which is worse
 * than no badge at all. Both are pinned below.
 *
 * Prerequisites: a real Postgres DATABASE_URL with the migrations applied.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@corelithzw/db/client";
import {
  allThreads,
  closeThread,
  countUnread,
  MessageError,
  openThread,
  replyToThread,
  startThread,
  threadsForGuardian,
  threadsForStaff,
} from "./messages";

let companyId: string;
let motherId: string;
let motherUserId: string;
let strangerId: string;
let strangerUserId: string;
let teacherProfileId: string;
let teacherUserId: string;
let otherTeacherProfileId: string;
let pupilId: string;
let strangersPupilId: string;
let stamp: number;

beforeAll(async () => {
  await prisma.$connect();
  stamp = Date.now();

  companyId = (
    await prisma.company.create({
      data: { name: `Msg ${stamp}`, slug: `msg-${stamp}` },
      select: { id: true },
    })
  ).id;

  const makeUser = (tag: string, role: "PARENT" | "TEACHER") =>
    prisma.user.create({
      data: { companyId, email: `${tag}-${stamp}@msg.test`, name: tag, role },
      select: { id: true },
    });

  motherUserId = (await makeUser("mother", "PARENT")).id;
  strangerUserId = (await makeUser("stranger", "PARENT")).id;
  teacherUserId = (await makeUser("teacher", "TEACHER")).id;
  const otherTeacherUserId = (await makeUser("other-teacher", "TEACHER")).id;

  motherId = (
    await prisma.schoolGuardian.create({
      data: {
        companyId,
        guardianNo: `G1-${stamp}`,
        firstName: "Rudo",
        lastName: "Moyo",
        phone: "0770000001",
        userId: motherUserId,
      },
      select: { id: true },
    })
  ).id;
  strangerId = (
    await prisma.schoolGuardian.create({
      data: {
        companyId,
        guardianNo: `G2-${stamp}`,
        firstName: "Grace",
        lastName: "Banda",
        phone: "0770000002",
        userId: strangerUserId,
      },
      select: { id: true },
    })
  ).id;

  teacherProfileId = (
    await prisma.schoolTeacherProfile.create({
      data: { companyId, userId: teacherUserId, employeeCode: `T1-${stamp}` },
      select: { id: true },
    })
  ).id;
  otherTeacherProfileId = (
    await prisma.schoolTeacherProfile.create({
      data: { companyId, userId: otherTeacherUserId, employeeCode: `T2-${stamp}` },
      select: { id: true },
    })
  ).id;

  pupilId = (
    await prisma.schoolStudent.create({
      data: {
        companyId,
        studentNo: `S1-${stamp}`,
        firstName: "Anesu",
        lastName: "Moyo",
        status: "ACTIVE",
      },
      select: { id: true },
    })
  ).id;
  strangersPupilId = (
    await prisma.schoolStudent.create({
      data: {
        companyId,
        studentNo: `S2-${stamp}`,
        firstName: "Tendai",
        lastName: "Banda",
        status: "ACTIVE",
      },
      select: { id: true },
    })
  ).id;

  await prisma.schoolStudentGuardian.createMany({
    data: [
      { companyId, studentId: pupilId, guardianId: motherId, relationship: "MOTHER", isPrimary: true },
      { companyId, studentId: strangersPupilId, guardianId: strangerId, relationship: "MOTHER", isPrimary: true },
    ],
  });
});

afterAll(async () => {
  await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.schoolMessageThread.deleteMany({ where: { companyId } });
});

async function threadFromMother() {
  return startThread({
    companyId,
    guardianId: motherId,
    senderUserId: motherUserId,
    senderSide: "GUARDIAN",
    subject: "Anesu's absence on Tuesday",
    body: "He had a fever. I have a doctor's note.",
    studentId: pupilId,
    teacherProfileId,
  });
}

describe("who can read a conversation", () => {
  it("shows a guardian only their own threads", async () => {
    await threadFromMother();
    await startThread({
      companyId,
      guardianId: strangerId,
      senderUserId: strangerUserId,
      senderSide: "GUARDIAN",
      subject: "Somebody else's business",
      body: "Private.",
      studentId: strangersPupilId,
      teacherProfileId,
    });

    const mine = await threadsForGuardian({ companyId, guardianId: motherId });
    expect(mine).toHaveLength(1);
    expect(mine[0].subject).toBe("Anesu's absence on Tuesday");
  });

  it("refuses to open another family's thread, in the same words as a missing one", async () => {
    const theirs = await startThread({
      companyId,
      guardianId: strangerId,
      senderUserId: strangerUserId,
      senderSide: "GUARDIAN",
      subject: "Private",
      body: "Private.",
      studentId: strangersPupilId,
      teacherProfileId,
    });

    const notMine = await openThread({
      companyId,
      threadId: theirs.id,
      side: "GUARDIAN",
      guardianId: motherId,
    }).catch((error: Error) => error);
    const missing = await openThread({
      companyId,
      threadId: "11111111-1111-4111-8111-111111111111",
      side: "GUARDIAN",
      guardianId: motherId,
    }).catch((error: Error) => error);

    expect(notMine).toBeInstanceOf(MessageError);
    expect(missing).toBeInstanceOf(MessageError);
    // Identical, so walking ids teaches a parent nothing about who exists.
    expect((notMine as Error).message).toBe((missing as Error).message);
  });

  it("keeps a teacher out of a colleague's conversation", async () => {
    const thread = await threadFromMother();
    await expect(
      openThread({
        companyId,
        threadId: thread.id,
        side: "STAFF",
        teacherProfileId: otherTeacherProfileId,
      }),
    ).rejects.toThrow(MessageError);
  });

  it("puts a thread addressed to the office in front of whoever is in it", async () => {
    await startThread({
      companyId,
      guardianId: motherId,
      senderUserId: motherUserId,
      senderSide: "GUARDIAN",
      subject: "Change of address",
      body: "We have moved.",
      teacherProfileId: null,
    });

    // A message to the school with no teacher on it must not sit in nobody's
    // inbox — that is a parent writing into silence.
    const officeInbox = await threadsForStaff({ companyId, teacherProfileId: null });
    expect(officeInbox).toHaveLength(1);

    const teacherInbox = await threadsForStaff({
      companyId,
      teacherProfileId,
      includeOffice: true,
    });
    expect(teacherInbox.map((row) => row.subject)).toContain("Change of address");
  });

  it("lets a head see every thread without being in any of them", async () => {
    await threadFromMother();
    await startThread({
      companyId,
      guardianId: strangerId,
      senderUserId: strangerUserId,
      senderSide: "GUARDIAN",
      subject: "Another family",
      body: "Hello.",
      studentId: strangersPupilId,
      teacherProfileId: otherTeacherProfileId,
    });

    const everything = await allThreads({ companyId });
    expect(everything).toHaveLength(2);

    // Oversight reads without marking anything read on the participants' behalf.
    const thread = everything[0];
    const before = await prisma.schoolMessageThread.findUniqueOrThrow({
      where: { id: thread.id },
      select: { staffReadAt: true },
    });
    await openThread({ companyId, threadId: thread.id, side: "STAFF", readOnly: true });
    const after = await prisma.schoolMessageThread.findUniqueOrThrow({
      where: { id: thread.id },
      select: { staffReadAt: true },
    });
    expect(after.staffReadAt).toEqual(before.staffReadAt);
  });

  it("refuses a thread about a child who is not theirs", async () => {
    await expect(
      startThread({
        companyId,
        guardianId: motherId,
        senderUserId: motherUserId,
        senderSide: "GUARDIAN",
        subject: "About your child",
        body: "…",
        studentId: strangersPupilId,
      }),
    ).rejects.toThrow(/not linked/i);
  });
});

describe("the unread badge", () => {
  it("is lit for the side that did not send, and not for the one that did", async () => {
    await threadFromMother();

    const forMother = await threadsForGuardian({ companyId, guardianId: motherId });
    const forTeacher = await threadsForStaff({ companyId, teacherProfileId });

    expect(forMother[0].unread).toBe(false);
    expect(forTeacher[0].unread).toBe(true);
    expect(countUnread(forTeacher)).toBe(1);
  });

  it("clears when the thread is opened, and stays clear", async () => {
    const thread = await threadFromMother();
    await openThread({ companyId, threadId: thread.id, side: "STAFF", teacherProfileId });

    const after = await threadsForStaff({ companyId, teacherProfileId });
    expect(after[0].unread).toBe(false);
    expect(countUnread(after)).toBe(0);
  });

  it("lights again when the other side replies", async () => {
    const thread = await threadFromMother();
    await openThread({ companyId, threadId: thread.id, side: "STAFF", teacherProfileId });

    await replyToThread({
      companyId,
      threadId: thread.id,
      senderUserId: teacherUserId,
      senderSide: "STAFF",
      body: "Thank you — I have marked him excused.",
      teacherProfileId,
    });

    const mother = await threadsForGuardian({ companyId, guardianId: motherId });
    const teacher = await threadsForStaff({ companyId, teacherProfileId });
    // The reply is news to the mother and not to its author.
    expect(mother[0].unread).toBe(true);
    expect(teacher[0].unread).toBe(false);
  });
});

describe("the record", () => {
  it("keeps messages in the order they were said", async () => {
    const thread = await threadFromMother();
    await replyToThread({
      companyId,
      threadId: thread.id,
      senderUserId: teacherUserId,
      senderSide: "STAFF",
      body: "Thank you.",
      teacherProfileId,
    });

    const detail = await openThread({
      companyId,
      threadId: thread.id,
      side: "GUARDIAN",
      guardianId: motherId,
    });
    expect(detail.messages.map((message) => message.senderSide)).toEqual([
      "GUARDIAN",
      "STAFF",
    ]);
    expect(detail.messageCount).toBe(2);
  });

  it("will not take a reply to a closed conversation", async () => {
    const thread = await threadFromMother();
    await closeThread({ companyId, threadId: thread.id });

    await expect(
      replyToThread({
        companyId,
        threadId: thread.id,
        senderUserId: motherUserId,
        senderSide: "GUARDIAN",
        body: "One more thing",
        guardianId: motherId,
      }),
    ).rejects.toThrow(/closed/i);
  });

  it("sorts an inbox by what happened last, not by what started first", async () => {
    const first = await threadFromMother();
    const second = await startThread({
      companyId,
      guardianId: motherId,
      senderUserId: motherUserId,
      senderSide: "GUARDIAN",
      subject: "Second thread",
      body: "Later.",
      studentId: pupilId,
      teacherProfileId,
    });

    await replyToThread({
      companyId,
      threadId: first.id,
      senderUserId: teacherUserId,
      senderSide: "STAFF",
      body: "Reviving the older one.",
      teacherProfileId,
    });

    const inbox = await threadsForGuardian({ companyId, guardianId: motherId });
    expect(inbox[0].id).toBe(first.id);
    expect(inbox[1].id).toBe(second.id);
  });
});
