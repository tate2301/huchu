import { beforeEach, describe, expect, it, vi } from "vitest";

const { summarizeSource, createJob } = vi.hoisted(() => ({
  summarizeSource: vi.fn(),
  createJob: vi.fn(),
}));

vi.mock("@/lib/documents/source-registry", () => ({
  summarizeSource,
  resolveSourcePayload: vi.fn(),
}));
vi.mock("@/lib/documents/template-resolver", () => ({
  resolveTemplate: vi.fn().mockResolvedValue({ templateId: null, templateVersionId: null, templateSchema: {} }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { documentRenderJob: { findFirst: vi.fn().mockResolvedValue(null), create: createJob } },
}));

const { enqueueDocumentRenderJob, ExportTooLargeError } = await import("./service");

function summary(rowCount: number) {
  return {
    targetType: "LIST",
    documentType: "REPORT_TABLE",
    sourceKey: "crm.register.person",
    rowCount,
    noun: { one: "person", many: "people" },
  };
}

const request = (format: "xlsx" | "csv" | "pdf") => ({
  target: "LIST" as const,
  sourceKey: "crm.register.person",
  format,
});

beforeEach(() => {
  summarizeSource.mockReset();
  createJob.mockReset().mockResolvedValue({ id: "job-1", status: "QUEUED" });
});

describe("deciding how an export is made", () => {
  it("makes a spreadsheet of five thousand rows straight away", async () => {
    summarizeSource.mockResolvedValue(summary(5_000));
    await expect(enqueueDocumentRenderJob("c1", "u1", request("xlsx"))).resolves.toEqual({
      mode: "SYNC",
      rowCount: 5_000,
    });
  });

  it("sends a bigger one to a job, as the person who asked", async () => {
    summarizeSource.mockResolvedValue(summary(5_001));
    const decision = await enqueueDocumentRenderJob("c1", "u1", request("csv"));
    expect(decision).toMatchObject({ mode: "ASYNC", jobId: "job-1", rowCount: 5_001 });
    expect(createJob.mock.calls[0][0].data).toMatchObject({ requestedById: "u1", sourceKey: "crm.register.person" });
    expect(summarizeSource).toHaveBeenCalledWith("c1", request("csv"), { actorId: "u1" });
  });

  it("sends a PDF to a job much sooner", async () => {
    summarizeSource.mockResolvedValue(summary(401));
    await expect(enqueueDocumentRenderJob("c1", "u1", request("pdf"))).resolves.toMatchObject({ mode: "ASYNC" });
  });

  it("refuses an export past its format's limit, in a sentence", async () => {
    summarizeSource.mockResolvedValue(summary(83_412));
    const attempt = enqueueDocumentRenderJob("c1", "u1", request("xlsx"));
    await expect(attempt).rejects.toBeInstanceOf(ExportTooLargeError);
    await expect(enqueueDocumentRenderJob("c1", "u1", request("xlsx"))).rejects.toThrow(
      "That is 83,412 people. Exports stop at 50,000 — narrow the list and export again.",
    );
    summarizeSource.mockResolvedValue(summary(2_001));
    await expect(enqueueDocumentRenderJob("c1", "u1", request("pdf"))).rejects.toThrow(
      "That is 2,001 people. A PDF stops at 2,000 — narrow the list and export again.",
    );
    expect(createJob).not.toHaveBeenCalled();
  });
});

describe("normalizeFileName", async () => {
  const { normalizeFileName } = await import("./service");

  it("keeps letters in any script, digits and plain punctuation", () => {
    expect(normalizeFileName("Café clients (Harare) 2026-09-28", "csv")).toBe("Café clients (Harare) 2026-09-28.csv");
  });

  it("turns what a browser would refuse into a hyphen", () => {
    expect(normalizeFileName("People · Everyone 2026-09-28", "xlsx")).toBe("People - Everyone 2026-09-28.xlsx");
    expect(normalizeFileName('a/b\\c:"d"', "pdf")).toBe("a - b - c - d.pdf");
  });

  it("replaces an extension rather than doubling it", () => {
    expect(normalizeFileName("report.pdf", "xlsx")).toBe("report.xlsx");
    expect(normalizeFileName("   ", "csv")).toBe("document.csv");
  });
});
