/**
 * Nothing captures money as IGNORED (books-final §1.1 rule 2): every caller
 * of `captureAccountingEvent` in the app is read, and one that writes IGNORED
 * while carrying a source type or an amount fails here. Record-only events go
 * through `recordEvent`, which refuses both at run time; so does the capture.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { carriesMoney, captureAccountingEvent, IgnoredMoneyRefused } from "@/lib/accounting/integration";

import { recordEvent, RecordEventRefused } from "./record-event";

const ROOT = path.resolve(__dirname, "../../..");

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) sources(full, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/** Each `captureAccountingEvent(…)` call's argument text, by balancing brackets. */
function calls(text: string): string[] {
  const found: string[] = [];
  let at = text.indexOf("captureAccountingEvent(");
  while (at !== -1) {
    let depth = 0;
    let end = at + "captureAccountingEvent".length;
    for (; end < text.length; end += 1) {
      if (text[end] === "(") depth += 1;
      else if (text[end] === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    found.push(text.slice(at, end + 1));
    at = text.indexOf("captureAccountingEvent(", end);
  }
  return found;
}

describe("no money event is written IGNORED", () => {
  const files = [...sources(path.join(ROOT, "app")), ...sources(path.join(ROOT, "lib"))];

  it("finds the callers it walks", () => {
    const callers = files.filter((file) => readFileSync(file, "utf8").includes("captureAccountingEvent("));
    expect(callers.length).toBeGreaterThan(10);
  });

  it("has every IGNORED capture free of a source type and an amount", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const call of calls(text)) {
        if (!/status:\s*"IGNORED"/.test(call)) continue;
        if (/\bsourceType\b/.test(call) || /\b(amount|netAmount|taxAmount|grossAmount|deductionsAmount|allowancesAmount)\s*:/.test(call)) {
          offenders.push(path.relative(ROOT, file));
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("has no CRM money capture left outside the core", () => {
    const text = readFileSync(path.join(ROOT, "lib/crm/money-posting.ts"), "utf8");
    expect(text).not.toContain("captureAccountingEvent");
    expect(text).toContain("postMoney");
  });

  it("refuses an IGNORED event that carries money, at run time", async () => {
    expect(carriesMoney({ sourceType: "CRM_REQUISITION_DISBURSEMENT" })).toBe(true);
    expect(carriesMoney({ amount: 12.5 })).toBe(true);
    expect(carriesMoney({ amount: 0 })).toBe(false);
    expect(carriesMoney({})).toBe(false);
    await expect(
      captureAccountingEvent({ companyId: "c", sourceDomain: "crm", sourceAction: "disbursed", sourceType: "CRM_REQUISITION_DISBURSEMENT", amount: 400, status: "IGNORED" }),
    ).rejects.toBeInstanceOf(IgnoredMoneyRefused);
    await expect(captureAccountingEvent({ companyId: "c", sourceDomain: "x", sourceAction: "y", amount: 1, status: "IGNORED" })).rejects.toBeInstanceOf(IgnoredMoneyRefused);
  });

  it("lets recordEvent write only a record with no money", async () => {
    await expect(recordEvent(undefined as never, { companyId: "c", sourceDomain: "maintenance", sourceAction: "x", amount: 5 })).rejects.toBeInstanceOf(RecordEventRefused);
    await expect(
      recordEvent(undefined as never, { companyId: "c", sourceDomain: "maintenance", sourceAction: "x", sourceType: "MAINTENANCE_COMPLETION" }),
    ).rejects.toBeInstanceOf(RecordEventRefused);
  });
});
