import { describe, expect, it } from "vitest";

import { projectTimeline } from "@/lib/crm/project-timeline";

type Job = { id: string; scheduledStart: string | null };

function job(id: string, scheduledStart: string | null): Job {
  return { id, scheduledStart };
}

function shape(entries: ReturnType<typeof projectTimeline<Job>>["entries"]): string[] {
  return entries.map((entry) =>
    entry.kind === "marker"
      ? `${entry.marker}:${entry.day}`
      : `${entry.job.id}:${entry.day}${entry.outside ? `:${entry.outside}` : ""}`,
  );
}

describe("a project's jobs against its dates", () => {
  it("puts the start, today and the target end among the jobs, by date", () => {
    const timeline = projectTimeline({
      startDate: "2026-10-01T00:00:00.000Z",
      targetEndDate: "2026-10-31T00:00:00.000Z",
      today: "2026-10-10",
      jobs: [job("screed", "2026-10-14T08:00:00.000Z"), job("prep", "2026-10-02T08:00:00.000Z")],
    });

    expect(shape(timeline.entries)).toEqual([
      "start:2026-10-01",
      "prep:2026-10-02",
      "today:2026-10-10",
      "screed:2026-10-14",
      "end:2026-10-31",
    ]);
  });

  it("calls a job on the target end day on time, whatever hour it starts", () => {
    const timeline = projectTimeline({
      startDate: null,
      targetEndDate: "2026-10-31T00:00:00.000Z",
      today: "2026-10-10",
      jobs: [job("snag", "2026-10-31T15:00:00.000Z")],
    });

    expect(shape(timeline.entries)).toEqual(["today:2026-10-10", "snag:2026-10-31", "end:2026-10-31"]);
  });

  it("says when a job is booked outside the window", () => {
    const timeline = projectTimeline({
      startDate: "2026-10-01T00:00:00.000Z",
      targetEndDate: "2026-10-31T00:00:00.000Z",
      today: "2026-10-10",
      jobs: [job("early", "2026-09-28T08:00:00.000Z"), job("late", "2026-11-03T08:00:00.000Z")],
    });

    expect(shape(timeline.entries)).toEqual([
      "early:2026-09-28:before",
      "start:2026-10-01",
      "today:2026-10-10",
      "end:2026-10-31",
      "late:2026-11-03:after",
    ]);
  });

  it("keeps unbooked jobs out of the line and lists them apart", () => {
    const timeline = projectTimeline({
      startDate: null,
      targetEndDate: null,
      today: "2026-10-10",
      jobs: [job("unbooked", null), job("booked", "2026-10-12T08:00:00.000Z")],
    });

    expect(shape(timeline.entries)).toEqual(["today:2026-10-10", "booked:2026-10-12"]);
    expect(timeline.unscheduled.map((entry) => entry.id)).toEqual(["unbooked"]);
  });

  it("keeps two jobs on one day in the order they were given", () => {
    const timeline = projectTimeline({
      startDate: null,
      targetEndDate: null,
      today: "2026-10-01",
      jobs: [job("morning", "2026-10-12T07:00:00.000Z"), job("afternoon", "2026-10-12T13:00:00.000Z")],
    });

    expect(shape(timeline.entries)).toEqual([
      "today:2026-10-01",
      "morning:2026-10-12",
      "afternoon:2026-10-12",
    ]);
  });
});
