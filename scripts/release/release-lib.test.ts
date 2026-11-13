import { describe, expect, it } from "vitest";

import {
  coreTagsAfter,
  describeCommit,
  latestCoreTag,
  latestForkTag,
  migrationsFromDiff,
  nextCoreVersion,
  nextForkVersion,
  releaseNotes,
} from "./release-lib.mjs";

describe("core versions", () => {
  it("starts the month at 1 and counts up within it", () => {
    const now = new Date(Date.UTC(2026, 11, 3));
    expect(nextCoreVersion([], now)).toBe("v2026.12.1");
    expect(nextCoreVersion(["v2026.11.4", "v2026.12.1", "v2026.12.2"], now)).toBe("v2026.12.3");
  });

  it("ignores fork tags when counting core releases", () => {
    const now = new Date(Date.UTC(2026, 11, 3));
    expect(nextCoreVersion(["v2026.12.1", "v2026.12.1-milling.4"], now)).toBe("v2026.12.2");
  });

  it("sorts numerically, not as text", () => {
    expect(latestCoreTag(["v2026.12.9", "v2026.12.10", "v2026.09.30", "v2026.12.10-milling.1"])).toBe("v2026.12.10");
    expect(coreTagsAfter(["v2026.12.2", "v2026.12.10", "v2026.12.9"], "v2026.12.2")).toEqual([
      "v2026.12.9",
      "v2026.12.10",
    ]);
    expect(coreTagsAfter(["v2026.12.1"], null)).toEqual(["v2026.12.1"]);
  });
});

describe("fork versions", () => {
  it("numbers fork releases per core base", () => {
    const tags = ["v2026.12.1-milling.1", "v2026.12.1-milling.2", "v2026.12.2-milling.1", "v2026.12.1-bakery.7"];
    expect(nextForkVersion(tags, "v2026.12.1", "milling")).toBe("v2026.12.1-milling.3");
    expect(nextForkVersion(tags, "v2026.12.3", "milling")).toBe("v2026.12.3-milling.1");
  });

  it("finds the newest fork release of its own flavour", () => {
    const tags = ["v2026.12.1-milling.5", "v2026.12.2-milling.1", "v2026.12.9-bakery.1"];
    expect(latestForkTag(tags, "milling")).toBe("v2026.12.2-milling.1");
    expect(latestForkTag(tags, "dairy")).toBeNull();
  });

  it("refuses a flavour or base that would make an ambiguous tag", () => {
    expect(() => nextForkVersion([], "v2026.12.1", "Milling")).toThrow();
    expect(() => nextForkVersion([], "main", "milling")).toThrow();
  });
});

describe("release notes", () => {
  it("uses the PR title for merge commits and groups by type", () => {
    const notes = releaseNotes("v2026.12.1", [
      { subject: "Merge pull request #301 from tate2301/feat/lots", body: "feat(stock): lots and balances by bin\n" },
      { subject: "fix: ageing buckets agree" },
      { subject: "chore(sync): core v2026.12.1" },
      { subject: "chore(release): v2026.11.3" },
      { subject: "refactor!: drop the old ageing API" },
      { subject: "tidy the readme" },
    ]);
    expect(notes).toContain("## Breaking\n\n- drop the old ageing API");
    expect(notes).toContain("## Core\n\n- core v2026.12.1");
    expect(notes).toContain("## Features\n\n- lots and balances by bin (#301)");
    expect(notes).toContain("## Fixes\n\n- ageing buckets agree");
    expect(notes).toContain("## Other\n\n- tidy the readme");
    expect(notes).not.toContain("v2026.11.3");
  });

  it("says so when there is nothing to release", () => {
    expect(releaseNotes("v2026.12.1", [])).toContain("No changes since the previous release.");
  });

  it("falls back to the subject when a merge has no body", () => {
    expect(describeCommit({ subject: "Merge pull request #7 from a/b" })).toEqual({
      text: "Merge pull request #7 from a/b",
      pr: 7,
    });
  });
});

describe("migrations in a diff", () => {
  it("lists new migration folders only", () => {
    expect(
      migrationsFromDiff([
        "prisma/migrations/20261201000000_lots/migration.sql",
        "prisma/migrations/20261130000000_milling_runs/migration.sql",
        "prisma/schema/core.prisma",
        "prisma/migrations/migration_lock.toml",
      ]),
    ).toEqual(["20261130000000_milling_runs", "20261201000000_lots"]);
  });
});
