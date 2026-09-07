import { describe, it, expect } from "vitest";
import { buildSignOffJob, canAskForSignOff, signOffSubmissionSchema } from "./sign-off";

const base = {
  workOrderNo: "JOB-0007",
  title: "Reroof the store",
  description: null,
  completedAt: "2026-08-01T14:00:00.000Z",
  addressLine: "12 Sam Nujoma",
  signOffAt: null,
  signOffName: null,
  client: { name: "Hurudza Labs" },
  site: null,
  items: [{ description: "Strip old sheeting" }, { description: "  " }, { description: "Fit IBR" }],
};

describe("client sign-off", () => {
  it("will not accept an anonymous signature", () => {
    expect(signOffSubmissionSchema.safeParse({ name: " " }).success).toBe(false);
    expect(signOffSubmissionSchema.safeParse({ name: "A" }).success).toBe(false);
    expect(signOffSubmissionSchema.safeParse({ name: "Rudo M" }).success).toBe(true);
  });

  it("accepts a sign-off with no rating — done is not the same as praised", () => {
    const parsed = signOffSubmissionSchema.safeParse({ name: "Rudo M", notes: "All good" });
    expect(parsed.success).toBe(true);
  });

  it("refuses a rating outside 1–5", () => {
    expect(signOffSubmissionSchema.safeParse({ name: "Rudo M", rating: 0 }).success).toBe(false);
    expect(signOffSubmissionSchema.safeParse({ name: "Rudo M", rating: 6 }).success).toBe(false);
  });

  it("only asks for sign-off on a job that has actually started", () => {
    expect(canAskForSignOff("DRAFT")).toBe(false);
    expect(canAskForSignOff("SCHEDULED")).toBe(false);
    expect(canAskForSignOff("IN_PROGRESS")).toBe(true);
    expect(canAskForSignOff("COMPLETED")).toBe(true);
  });

  it("lists what was done, skipping blanks", () => {
    expect(buildSignOffJob(base).items).toEqual(["Strip old sheeting", "Fit IBR"]);
  });

  it("carries no money — the client is confirming the work, not the price", () => {
    const job = buildSignOffJob(base);
    expect(JSON.stringify(job)).not.toMatch(/value|price|amount|invoice|margin/i);
  });

  it("reports an answered sign-off so the page shows a receipt, not the form again", () => {
    const job = buildSignOffJob({
      ...base,
      signOffAt: "2026-08-02T08:00:00.000Z",
      signOffName: "Rudo M",
    });
    expect(job.signedOffAt).toBe("2026-08-02T08:00:00.000Z");
    expect(job.signedOffName).toBe("Rudo M");
  });
});
