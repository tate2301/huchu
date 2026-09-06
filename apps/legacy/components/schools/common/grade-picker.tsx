"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { MobileList, MobileListEmpty } from "@corelithzw/react";

import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { getApiErrorMessage } from "@corelithzw/platform/api-client";
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

  if (classesQuery.error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Unable to load year groups</AlertTitle>
        <AlertDescription>{getApiErrorMessage(classesQuery.error)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="min-w-0 sm:max-w-[320px]">
        <Label htmlFor="grade-search" className="text-sm text-muted-foreground">
          Find a year group
        </Label>
        <Input
          id="grade-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Form 2, Grade 5…"
        />
      </div>

      {classes.length === 0 && !classesQuery.isLoading ? (
        <Alert>
          <AlertTitle>No classes yet</AlertTitle>
          <AlertDescription>
            {emptyHint ??
              "Everything here is organised by year group. Set the class ladder up under Academics first."}
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Cards where there is room, a list on a phone. Streams are links of
          their own: "Form 2 Blue" is the unit a class teacher works in, and
          making them open Form 2 and filter again would put the thing they came
          for one level too deep. */}
      <div className="hidden gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-3">
        {matching.map((schoolClass) => (
          <div
            key={schoolClass.id}
            className="rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface)] p-4"
          >
            <Link
              href={`${basePath}/class/${schoolClass.id}`}
              className="text-base font-medium hover:underline"
            >
              {schoolClass.name}
            </Link>
            <p className="text-sm text-muted-foreground">{describe(schoolClass)}</p>
            {schoolClass.streams && schoolClass.streams.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {schoolClass.streams.map((stream) => (
                  <Link
                    key={stream.id}
                    href={`${basePath}/class/${schoolClass.id}?streamId=${stream.id}`}
                    className="rounded-md border border-[var(--edge-subtle)] px-2 py-1 text-sm text-muted-foreground hover:bg-[var(--surface-muted)]"
                  >
                    {stream.name}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="sm:hidden">
        <MobileList>
          {matching.length === 0 ? (
            <MobileListEmpty>
              {classesQuery.isLoading ? "Loading year groups…" : "No year groups found."}
            </MobileListEmpty>
          ) : (
            matching.map((schoolClass) => (
              <MobileList.Row
                key={schoolClass.id}
                title={schoolClass.name}
                subtitle={describe(schoolClass)}
                onClick={() => {
                  window.location.href = `${basePath}/class/${schoolClass.id}`;
                }}
              />
            ))
          )}
        </MobileList>
      </div>
    </div>
  );
}
