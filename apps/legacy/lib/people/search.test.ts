/**
 * The People arm, against a real Postgres.
 *
 * Mocking Prisma here would assert the shape of the mock. What is worth proving
 * is that a name typed into the app bar actually reaches an employee row: the
 * bug this arm fixes was a search box that found nothing on a payroll tenant,
 * and a test that never touches the database cannot tell you it is fixed.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { EmployeePosition } from "@corelithzw/db";

import { prisma } from "@corelithzw/db/client";

import { searchPeople } from "./search";

let companyId: string;
let otherCompanyId: string;
let adaId: string;

async function makeEmployee(
  company: string,
  input: {
    name: string;
    employeeId: string;
    position?: EmployeePosition;
    isActive?: boolean;
  },
) {
  const employee = await prisma.employee.create({
    data: {
      companyId: company,
      employeeId: input.employeeId,
      name: input.name,
      phone: "0770000000",
      nextOfKinName: "Kin",
      nextOfKinPhone: "0770000001",
      passportPhotoUrl: "https://example.invalid/p.jpg",
      villageOfOrigin: "Village",
      position: input.position ?? "OPERATOR",
      isActive: input.isActive ?? true,
    },
    select: { id: true },
  });
  return employee.id;
}

beforeAll(async () => {
  const stamp = Date.now();
  const company = await prisma.company.create({
    data: { name: `People search ${stamp}`, slug: `people-search-${stamp}` },
    select: { id: true },
  });
  companyId = company.id;

  const other = await prisma.company.create({
    data: { name: `Other tenant ${stamp}`, slug: `other-tenant-${stamp}` },
    select: { id: true },
  });
  otherCompanyId = other.id;

  adaId = await makeEmployee(companyId, {
    name: "Ada Moyo",
    employeeId: "EMP-001",
    position: "CLERK",
  });
  await makeEmployee(companyId, { name: "Tendai Zulu", employeeId: "EMP-002" });
  await makeEmployee(companyId, {
    name: "Chipo Nyoni",
    employeeId: "EMP-003",
    isActive: false,
  });
  // Same name, different tenant. The one thing a search box must never do.
  await makeEmployee(otherCompanyId, { name: "Ada Moyo", employeeId: "EMP-001" });

  await prisma.shiftGroup.create({
    data: {
      companyId,
      siteId: null,
      name: "Payroll desk",
      code: "PD-1",
      leaderEmployeeId: adaId,
      members: { create: [{ employeeId: adaId }] },
    },
  });
});

afterAll(async () => {
  await prisma.shiftGroupMember.deleteMany({
    where: { shiftGroup: { companyId: { in: [companyId, otherCompanyId] } } },
  });
  await prisma.shiftGroup.deleteMany({
    where: { companyId: { in: [companyId, otherCompanyId] } },
  });
  await prisma.employee.deleteMany({
    where: { companyId: { in: [companyId, otherCompanyId] } },
  });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
});

describe("searchPeople", () => {
  it("finds an employee by surname alone", async () => {
    const results = await searchPeople(prisma, {
      companyId,
      query: "moyo",
      types: ["EMPLOYEE"],
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      type: "EMPLOYEE",
      id: adaId,
      reference: "EMP-001",
      title: "Ada Moyo",
    });
  });

  it("matches on the words in any order", async () => {
    const forwards = await searchPeople(prisma, {
      companyId,
      query: "ada moyo",
      types: ["EMPLOYEE"],
    });
    const backwards = await searchPeople(prisma, {
      companyId,
      query: "moyo ada",
      types: ["EMPLOYEE"],
    });

    expect(forwards.map((row) => row.id)).toEqual([adaId]);
    expect(backwards.map((row) => row.id)).toEqual([adaId]);
  });

  it("finds an employee by staff number", async () => {
    const results = await searchPeople(prisma, {
      companyId,
      query: "EMP-002",
      types: ["EMPLOYEE"],
    });

    expect(results.map((row) => row.title)).toEqual(["Tendai Zulu"]);
  });

  it("finds everyone holding a job title, from the label", async () => {
    // `position` is an enum, so this cannot be a `contains`. Typing the label
    // maps back onto the enum value — which is the whole reason
    // `positionMatches` exists.
    const clerks = await searchPeople(prisma, {
      companyId,
      query: "clerk",
      types: ["EMPLOYEE"],
    });

    expect(clerks.map((row) => row.title)).toEqual(["Ada Moyo"]);
    expect(clerks[0].facts).toEqual(
      expect.arrayContaining([{ label: "Position", value: "Clerk" }]),
    );
  });

  it("never crosses tenants", async () => {
    const results = await searchPeople(prisma, {
      companyId,
      query: "moyo",
      types: ["EMPLOYEE"],
    });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(adaId);
  });

  it("returns a leaver, and says so", async () => {
    // A leaver still answers to their name, and paying one is a different
    // decision from paying a colleague — so they are findable and labelled,
    // not hidden.
    const results = await searchPeople(prisma, {
      companyId,
      query: "chipo",
      types: ["EMPLOYEE"],
    });

    expect(results).toHaveLength(1);
    expect(results[0].facts).toEqual(
      expect.arrayContaining([{ label: "Status", value: "Left" }]),
    );
  });

  it("runs only the arms it was given", async () => {
    // The route resolves entitlement per arm; an arm left out must not be
    // searched at all, or an unentitled type leaks through a result count.
    const employeesOnly = await searchPeople(prisma, {
      companyId,
      query: "moyo",
      types: ["EMPLOYEE"],
    });
    const crewsOnly = await searchPeople(prisma, {
      companyId,
      query: "payroll",
      types: ["SHIFT_GROUP"],
    });

    expect(employeesOnly.every((row) => row.type === "EMPLOYEE")).toBe(true);
    expect(crewsOnly.every((row) => row.type === "SHIFT_GROUP")).toBe(true);
    expect(crewsOnly.map((row) => row.title)).toEqual(["Payroll desk"]);
  });

  it("describes a crew with no site as company-wide", async () => {
    const results = await searchPeople(prisma, {
      companyId,
      query: "PD-1",
      types: ["SHIFT_GROUP"],
    });

    expect(results).toHaveLength(1);
    expect(results[0].subtitle).toBe("Whole company");
    expect(results[0].facts).toEqual(
      expect.arrayContaining([{ label: "Members", value: "1 person" }]),
    );
  });

  it("says nothing for a one-character query", async () => {
    // The app-bar input fires on every keystroke. Answering "a" with every
    // employee in the company is a query nobody asked for.
    const results = await searchPeople(prisma, {
      companyId,
      query: "a",
      types: ["EMPLOYEE", "SHIFT_GROUP"],
    });

    expect(results).toEqual([]);
  });
});
