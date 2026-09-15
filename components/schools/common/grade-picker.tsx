"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import {
  CardsSkeleton,
  LoadError,
  NothingMatched,
  NothingYet,
} from "@/components/schools/common/states";
import { TableSearch } from "@/components/schools/common/table-controls";
import { ChevronRight } from "@/lib/icons";
import { fetchSchoolsClasses, type SchoolsClassRecord } from "@/lib/schools/admin-v2";

/**
 * Which year group, before which record.
 *
 * A school with 800 students has no use for a page listing 800 students, and
 * the same is true of a register, a mark sheet or a fee run. The year group is
 * how a school is organised and how every one of those is scoped, so it belongs
 * in the navigation rather than in a dropdown above a list that has already
 * loaded everything.
 *
 * Shared rather than copied per surface: students, attendance and anything else
 * that starts "which class?" should pick the same way, and a second
 * implementation is where the two drift apart.
 *
 * ## Why cards and not a list
 *
 * A school has a dozen year groups, not four hundred, and each is a
 * destination with its own streams hanging off it — so this is a menu rather
 * than a register. The list shape would put those streams on a second line
 * that is either truncated or twice the height of the row, and there is no
 * column here anybody scans down. Below `sm` the same records are rows,
 * because two columns of cards at 390px is one card and a half.
 */
export function GradePicker({
  basePath,
  summarise,
  emptyHint,
}: {
  /** Where a year group leads — `/schools/attendance` gives `…/class/<id>`. */
  basePath: string;
  /** The line under each year group's name. Defaults to the student count. */
  summarise?: (schoolClass: SchoolsClassRecord) => string;
  /** Shown when the school has no classes at all. */
  emptyHint?: string;
}) {
  const [search, setSearch] = useState("");

  const classesQuery = useQuery({
    queryKey: ["schools", "grades"],
    queryFn: () => fetchSchoolsClasses({ page: 1, limit: 200 }),
  });

  const classes = useMemo<SchoolsClassRecord[]>(
    () => classesQuery.data?.data ?? [],
    [classesQuery.data],
  );

  const matching = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return classes;
    return classes.filter(
      (schoolClass) =>
        schoolClass.name.toLowerCase().includes(term) ||
        schoolClass.code.toLowerCase().includes(term),
    );
  }, [classes, search]);

  const describe =
    summarise ??
    ((schoolClass: SchoolsClassRecord) =>
      `${schoolClass._count.students} student${schoolClass._count.students === 1 ? "" : "s"}`);

  if (classesQuery.isError) {
    return (
      <LoadError
        what="the year groups"
        error={classesQuery.error}
        onRetry={() => void classesQuery.refetch()}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* The search box only earns its place once there are enough year groups
          to hunt through; under that it is a control above a list you can
          already read in one look. */}
      {classes.length > 8 ? (
        <TableSearch
          value={search}
          onChange={setSearch}
          placeholder="Find a year group"
        />
      ) : null}

      {classesQuery.isPending ? (
        <CardsSkeleton count={6} columns={3} lines={1} label="Loading the year groups" />
      ) : classes.length === 0 ? (
        <NothingYet
          title="No year groups yet"
          body={
            emptyHint ??
            "Everything here is organised by year group. Set the class ladder up under Years and terms first."
          }
        />
      ) : matching.length === 0 ? (
        <NothingMatched what="year groups" search={search} onClear={() => setSearch("")} />
      ) : (
        <>
          <div className="hidden gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-3">
            {matching.map((schoolClass) => (
              <div
                key={schoolClass.id}
                className="rounded-[var(--card-radius)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4"
              >
                {/* A standing underline, not one that arrives with the
                    pointer: a cue nobody sees until they are already on the
                    link is not a cue, and it is invisible on a phone. */}
                <Link
                  href={`${basePath}/class/${schoolClass.id}`}
                  className="text-base font-semibold text-[color:var(--text-strong)] underline decoration-[color:var(--border)] underline-offset-2 hover:decoration-[color:var(--text-muted)]"
                >
                  {schoolClass.name}
                </Link>
                <p className="text-sm text-[color:var(--text-muted)]">{describe(schoolClass)}</p>
                {/* Streams are links of their own: "Form 2 Blue" is the unit a
                    class teacher works in, and making them open Form 2 and
                    filter again would put the thing they came for one level
                    too deep. */}
                {schoolClass.streams && schoolClass.streams.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {schoolClass.streams.map((stream) => (
                      <Link
                        key={stream.id}
                        href={`${basePath}/class/${schoolClass.id}?streamId=${stream.id}`}
                        className="rounded-[var(--radius-md)] border border-[color:var(--border)] px-2 py-1 text-sm text-[color:var(--text-muted)] hover:bg-[color:var(--surface-muted)]"
                      >
                        {stream.name}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          {/* Rows on a phone. Separated by space rather than rules, and 44px
              tall, which is the floor a thumb needs — `py-2` alone comes to
              about 40, which is a near-miss rather than a miss. */}
          <ul className="space-y-1 sm:hidden">
            {matching.map((schoolClass) => (
              <li key={schoolClass.id}>
                <Link
                  href={`${basePath}/class/${schoolClass.id}`}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface)] px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-[color:var(--text-strong)] underline decoration-[color:var(--border)] underline-offset-2">
                      {schoolClass.name}
                    </span>
                    <span className="acct-caption block truncate font-mono">
                      {describe(schoolClass)}
                    </span>
                  </span>
                  {/* Nothing else in the row says there is anywhere to go. */}
                  <ChevronRight
                    className="size-4 shrink-0 text-[color:var(--text-disabled)]"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
