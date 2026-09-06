import { describe, expect, it } from "vitest";

import { fileMark, formatFileSize, meetingPlace, timeToStart } from "./panels";

describe("timeToStart", () => {
  const now = new Date("2026-03-15T09:00:00Z");

  it("is exact where exactness matters and rounded where it does not", () => {
    // Nobody needs "in 2 hours 43 minutes"; everybody needs "in 5 minutes"
    // to be right.
    expect(timeToStart("2026-03-15T09:05:00Z", now).label).toBe("in 5 minutes");
    expect(timeToStart("2026-03-15T11:43:00Z", now).label).toBe("in 3 hours");
    expect(timeToStart("2026-03-18T09:00:00Z", now).label).toBe("in 3 days");
  });

  it("says a meeting is now rather than in zero minutes", () => {
    const soon = timeToStart("2026-03-15T09:00:30Z", now);
    expect(soon.label).toBe("Starting now");
    expect(soon.imminent).toBe(true);
  });

  it("flags the quarter hour before, so a panel can say so", () => {
    expect(timeToStart("2026-03-15T09:10:00Z", now).imminent).toBe(true);
    expect(timeToStart("2026-03-15T09:40:00Z", now).imminent).toBe(false);
  });

  it("reads a meeting that has already started as past, not imminent", () => {
    const late = timeToStart("2026-03-15T08:50:00Z", now);
    expect(late.label).toBe("10 minutes ago");
    expect(late.past).toBe(true);
    expect(late.imminent).toBe(false);
  });

  it("singularises so it does not say 1 minutes", () => {
    expect(timeToStart("2026-03-15T09:01:00Z", now).label).toBe("in 1 minute");
    expect(timeToStart("2026-03-16T09:00:00Z", now).label).toBe("in 1 day");
  });

  it("says the time is unknown rather than NaN", () => {
    expect(timeToStart("not a date", now).label).toBe("Time unknown");
  });
});

describe("meetingPlace", () => {
  it("offers a join for a video link", () => {
    expect(meetingPlace("https://meet.example.com/abc-defg")).toMatchObject({ kind: "join" });
  });

  it("offers a map for an address", () => {
    const place = meetingPlace("8 Enterprise Road, Harare");
    expect(place.kind).toBe("map");
    if (place.kind === "map") {
      expect(place.text).toBe("8 Enterprise Road, Harare");
      expect(place.url).toContain("Enterprise%20Road");
    }
  });

  it("offers nothing when there is nowhere to go", () => {
    // A button that opens a map of nowhere is worse than no button.
    expect(meetingPlace(null).kind).toBe("none");
    expect(meetingPlace("   ").kind).toBe("none");
  });

  it("does not treat a bare scheme as somewhere to join", () => {
    expect(meetingPlace("https://").kind).toBe("map");
  });

  it("does not open a javascript url", () => {
    expect(meetingPlace("javascript:alert(1)").kind).toBe("map");
  });
});

describe("fileMark", () => {
  it("colours by what a thing is, not by its extension", () => {
    // A .jpg and a .heic are both a photo; nobody cares which camera made it.
    expect(fileMark("site.jpg")).toEqual(fileMark("site.heic"));
    expect(fileMark("quote.pdf").label).toBe("PDF");
    expect(fileMark("prices.csv").label).toBe("XLS");
  });

  it("ignores case and path", () => {
    expect(fileMark("SCAN.PDF").label).toBe("PDF");
  });

  it("uses the last extension, not the first", () => {
    expect(fileMark("archive.tar.gz").label).toBe("ZIP");
  });

  it("does not read a hidden file's name as an extension", () => {
    expect(fileMark(".gitignore").label).toBe("FILE");
  });

  it("falls back rather than throwing on nothing", () => {
    expect(fileMark(null).label).toBe("FILE");
    expect(fileMark("README").label).toBe("FILE");
  });
});

describe("formatFileSize", () => {
  it("uses the units the operating system on the desk reports", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1024)).toBe("1.0 KB");
    expect(formatFileSize(1024 * 1024 * 2.5)).toBe("2.5 MB");
  });

  it("stops showing decimals once they are noise", () => {
    // "941.3 MB" is three digits of nothing.
    expect(formatFileSize(1024 * 1024 * 941.3)).toBe("941 MB");
  });

  it("says nothing when the size is not known", () => {
    expect(formatFileSize(null)).toBe("");
    expect(formatFileSize(undefined)).toBe("");
    expect(formatFileSize(-1)).toBe("");
  });
});
