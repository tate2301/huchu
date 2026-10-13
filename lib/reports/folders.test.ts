/**
 * Report folders through the store: one company's, named once, changed by
 * whoever made them or a manager, and a report only ever moves into a folder
 * of its own company.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { starterDocument } from "./custom/document";
import { createCustomReport, FolderRefused, listCustomReports, updateCustomReport, type Reader } from "./custom/store";
import { createReportFolder, deleteReportFolder, folderInCompany, listReportFolders, renameReportFolder } from "./folders";

let companyId = "";
let otherId = "";
let clerk: Reader;
let colleague: Reader;
let manager: Reader;
let outsider: Reader;

beforeAll(async () => {
  const stamp = Date.now();
  const [company, other] = await Promise.all([
    prisma.company.create({ data: { name: `Report folders ${stamp}`, slug: `report-folders-${stamp}` } }),
    prisma.company.create({ data: { name: `Report folders other ${stamp}`, slug: `report-folders-other-${stamp}` } }),
  ]);
  companyId = company.id;
  otherId = other.id;
  clerk = { companyId, userId: `clerk-${stamp}`, role: "CLERK" };
  colleague = { companyId, userId: `colleague-${stamp}`, role: "CLERK" };
  manager = { companyId, userId: `manager-${stamp}`, role: "MANAGER" };
  outsider = { companyId: otherId, userId: `outsider-${stamp}`, role: "MANAGER" };
});

afterAll(async () => {
  await prisma.company.deleteMany({ where: { id: { in: [companyId, otherId] } } });
});

const report = (folderId: string | null = null) => ({
  title: "Accepted quotes by subfloor",
  description: null,
  audience: "JUST_ME" as const,
  folderId,
  document: starterDocument({ key: "crm-deals" }),
});

describe("report folders", () => {
  it("makes a folder once per company, and lists it to everyone in it", async () => {
    const made = await createReportFolder(clerk, "Fitters");
    expect("ok" in made && made.ok.name).toBe("Fitters");
    expect(await createReportFolder(colleague, "Fitters")).toEqual({ error: "taken" });
    // Another company may use the same name.
    expect("ok" in (await createReportFolder(outsider, "Fitters"))).toBe(true);
    const seen = await listReportFolders(colleague);
    expect(seen.map((folder) => [folder.name, folder.canChange])).toEqual([["Fitters", false]]);
  });

  it("lets its maker and a manager rename it, and nobody from another company", async () => {
    const made = await createReportFolder(clerk, "Money");
    if (!("ok" in made)) throw new Error("not made");
    expect(await renameReportFolder(colleague, made.ok.id, "Cash")).toEqual({ error: "forbidden" });
    expect(await renameReportFolder(outsider, made.ok.id, "Cash")).toEqual({ error: "missing" });
    expect(await renameReportFolder(clerk, made.ok.id, "Fitters")).toEqual({ error: "taken" });
    expect(await renameReportFolder(manager, made.ok.id, "Cash")).toEqual({ ok: { id: made.ok.id, name: "Cash" } });
  });

  it("files a report only in a folder of its own company", async () => {
    const mine = await createReportFolder(clerk, "Monday meeting");
    const theirs = await createReportFolder(outsider, "Theirs");
    if (!("ok" in mine) || !("ok" in theirs)) throw new Error("not made");
    expect(await folderInCompany(companyId, mine.ok.id)).toBe(true);
    expect(await folderInCompany(companyId, theirs.ok.id)).toBe(false);

    await expect(createCustomReport(clerk, report(theirs.ok.id))).rejects.toBeInstanceOf(FolderRefused);
    const created = await createCustomReport(clerk, report(mine.ok.id));
    expect(created.folderId).toBe(mine.ok.id);

    expect(await updateCustomReport(clerk, created.id, { folderId: theirs.ok.id })).toEqual({ error: "folder" });
    const moved = await updateCustomReport(clerk, created.id, { folderId: null });
    expect("report" in moved && moved.report.folderId).toBeNull();
    const back = await updateCustomReport(clerk, created.id, { folderId: mine.ok.id });
    expect("report" in back && back.report.folderId).toBe(mine.ok.id);
    const listed = (await listCustomReports(clerk)).find((entry) => entry.id === created.id);
    expect(listed?.folder).toEqual({ id: mine.ok.id, name: "Monday meeting" });
  });

  it("puts a deleted folder's reports back in no folder, deleting none of them", async () => {
    const made = await createReportFolder(clerk, "Old");
    if (!("ok" in made)) throw new Error("not made");
    const filed = await createCustomReport(clerk, report(made.ok.id));
    expect(await deleteReportFolder(colleague, made.ok.id)).toEqual({ error: "forbidden" });
    expect(await deleteReportFolder(clerk, made.ok.id)).toEqual({ ok: { id: made.ok.id } });
    const after = (await listCustomReports(clerk)).find((entry) => entry.id === filed.id);
    expect(after?.folder).toBeNull();
  });
});
