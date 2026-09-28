"use client";

import { useCallback, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MobileList, MobileListEmpty } from "@corelithzw/react";
import { Badge } from "@/components/schools/common/status-badge";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { PageChrome } from "@/components/layout/page-chrome";
import { FilterSelect } from "@/components/schools/common/filter-select";
import { RecordCell } from "@/components/records/record-table";
import { RecordMark } from "@/components/records/record-mark";
import { PersonCell } from "@/components/schools/common/identity-cell";
import {
  CreateButton,
  RecordActions,
  type RecordVerb,
} from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/records/states";
import { TableControls, TableSearch } from "@/components/records/table-controls";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
  fetchSchoolsClasses,
  fetchTeacherProfiles,
  fetchTeacherSubjects,
  type TeacherProfileRecord,
} from "@/lib/schools/admin-v2";
import {
  BulkAllocationSheet,
  type BulkAllocationResult,
  type BulkAllocationValues,
} from "@/components/schools/teachers/bulk-allocation-sheet";
import { DEPARTMENT_SUGGESTIONS } from "@/components/schools/teachers/departments";
import {
  EMPTY_TEACHER,
  TeacherFormDialog,
  type TeacherFormValues,
} from "@/components/schools/teachers/teacher-form-dialog";

/**
 * The teaching staff. One register, of teachers.
 *
 * It used to carry three: teacher profiles, the subject catalogue and the
 * allocation grid, stacked behind a vertical rail. Three subjects wearing one
 * page's name, and it showed — the band over them counted staff while the
 * table under them listed subjects, the filters governed a third of the
 * screen, and "Teaching staff" was true of the first view only. The other two
 * already had pages of their own: the catalogue is the one under Master Data
 * and the grid is `/schools/teachers/assignments`, which answers the question
 * this screen never could — which lesson has nobody against it. The tab strip
 * above the filters is one click to it.
 *
 * Every row carries edit and archive, gated the way the endpoint behind it is
 * gated. Archiving turns the profile off rather than destroying it: their
 * timetable, marks and registers are the school's record of terms already
 * taught.
 */

/** Teaching staff and the allocation grid, as two segments of one register. */
const VIEWS = [
  { href: "/schools/teachers", label: "Teaching staff" },
  { href: "/schools/teachers/assignments", label: "Assignments" },
] as const;

/**
 * "Still here" versus "has left" for staff, and "still taught" for subjects.
 * Both were previously baked into the sort — `isActive desc` — which made the
 * list neither alphabetical nor filterable. It is a filter now, and the order
 * is plain alphabetical.
 */
type ActiveFilter = "" | "active" | "inactive";

/**
 * The staff list is the active staff unless somebody asks otherwise: the
 * endpoint defaults `isActive` to true, so there is no "everyone" to offer and
 * the unfiltered choice is named for what it actually returns. Archived is how
 * a teacher who has left is found again, and brought back.
 */
const STAFF_OPTIONS = [{ value: "inactive", label: "Archived" }];

function activeParam(filter: ActiveFilter) {
  return filter === "" ? undefined : filter === "active";
}

/**
 * The two segments, as links rather than view state: a head of department who
 * wants to send somebody the gaps in the grid needs the grid to have an
 * address. The rail still lights up "Teachers" for both.
 */
export function TeachersViews({ pathname }: { pathname: string }) {
  return (
    <div
      role="tablist"
      aria-label="Teacher views"
      className="flex min-w-0 shrink-0 items-center gap-0.5 self-end rounded-[7px] bg-[var(--surface-sunken)] p-0.5"
    >
      {VIEWS.map((segment) => {
        const active = pathname === segment.href;
        return (
          <Link
            key={segment.href}
            href={segment.href}
            role="tab"
            aria-selected={active}
            className={cn(
              "flex h-[26px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[5px] px-2.5 text-sm transition-colors",
              active
                ? "bg-[var(--surface)] font-bold text-[var(--text-strong)] shadow-[0_1px_2px_rgba(22,24,29,.10)]"
                : "font-medium text-[var(--text-muted)] hover:text-[var(--text-strong)]",
            )}
          >
            {segment.label}
          </Link>
        );
      })}
    </div>
  );
}

export function SchoolsTeachersContent() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();

  const [profileActive, setProfileActive] = useState<ActiveFilter>("");
  const [department, setDepartment] = useState("");
  const [search, setSearch] = useState("");

  const [teacherDialog, setTeacherDialog] = useState<TeacherFormValues | null>(null);

  const [allocateOpen, setAllocateOpen] = useState(false);
  const [allocateError, setAllocateError] = useState<string | null>(null);
  const [allocateResult, setAllocateResult] = useState<BulkAllocationResult | null>(null);

  /* ── the data ──────────────────────────────────────────────────────── */

  const profilesQuery = useQuery({
    queryKey: ["schools", "teachers", "profiles", "list", profileActive],
    queryFn: () =>
      fetchTeacherProfiles({ page: 1, limit: 200, isActive: activeParam(profileActive) }),
  });

  /**
   * The staff as a whole, for the band's two numbers and the department list.
   * The filtered query cannot supply either: a page narrowed to the archived
   * would report seven staff and offer one department.
   */
  const staffTallyQuery = useQuery({
    queryKey: ["schools", "teachers", "profiles", "tally"],
    queryFn: () => fetchTeacherProfiles({ page: 1, limit: 200 }),
  });

  /** Only for the bulk allocation sheet — the catalogue itself lives under Master Data. */
  const subjectsQuery = useQuery({
    queryKey: ["schools", "teachers", "subjects", "all"],
    queryFn: () => fetchTeacherSubjects({ page: 1, limit: 200 }),
  });

  const classesQuery = useQuery({
    queryKey: ["schools", "teachers", "classes"],
    queryFn: () => fetchSchoolsClasses({ page: 1, limit: 200 }),
  });

  const allProfiles = useMemo(
    () => staffTallyQuery.data?.data ?? [],
    [staffTallyQuery.data],
  );
  const subjects = useMemo(() => subjectsQuery.data?.data ?? [], [subjectsQuery.data]);
  const classes = useMemo(() => classesQuery.data?.data ?? [], [classesQuery.data]);

  /**
   * Department and the name search are both applied here rather than in the
   * query: the profiles route takes no `department` param, only a free-text
   * `search` that also matches names and emails — so "Sciences" would have
   * returned Mrs Sciencewala too.
   */
  const profiles = useMemo(() => {
    const rows = profilesQuery.data?.data ?? [];
    const needle = search.trim().toLowerCase();
    return rows.filter((profile) => {
      if (department && (profile.department ?? "") !== department) return false;
      if (!needle) return true;
      return `${profile.user.name} ${profile.user.email} ${profile.employeeCode}`
        .toLowerCase()
        .includes(needle);
    });
  }, [profilesQuery.data, department, search]);

  const departmentOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const profile of allProfiles) {
      if (profile.department) seen.add(profile.department);
    }
    /*
     * Faculty order, not alphabetical order.
     *
     * A staff list is read the way a timetable is grouped — Mathematics,
     * Languages, Sciences, Humanities — and an alphabetical dropdown that
     * opens on "Commercials" makes somebody hunt for the department they were
     * already thinking of. Anything the school named for itself and this list
     * has never heard of keeps its alphabetical place after the known ones,
     * because inventing a position for it would be a guess.
     */
    const rank = (value: string) => {
      const index = DEPARTMENT_SUGGESTIONS.indexOf(
        value as (typeof DEPARTMENT_SUGGESTIONS)[number],
      );
      return index === -1 ? DEPARTMENT_SUGGESTIONS.length : index;
    };
    return [...seen]
      .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
      .map((value) => ({ value, label: value }));
  }, [allProfiles]);

  const tally = useMemo(
    () =>
      staffTallyQuery.data
        ? {
            total: allProfiles.length,
            withoutHr: allProfiles.filter((profile) => !profile.employee).length,
          }
        : null,
    [allProfiles, staffTallyQuery.data],
  );

  /* ── the verbs ─────────────────────────────────────────────────────── */

  /**
   * Taking somebody off the staff list turns the profile off rather than
   * destroying it: their timetable, their marks and their registers are the
   * school's record of terms already taught, and a teacher who has left is not
   * a teacher who was never there. `DELETE` is the route's name for it.
   */
  const archiveTeacher = useMutation({
    mutationFn: (profile: TeacherProfileRecord) =>
      fetchJson(`/api/v2/schools/teachers/profiles/${profile.id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schools", "teachers"] });
    },
  });

  const reinstateTeacher = useMutation({
    mutationFn: (profile: TeacherProfileRecord) =>
      fetchJson(`/api/v2/schools/teachers/profiles/${profile.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: true }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schools", "teachers"] });
    },
  });

  const allocate = useMutation({
    mutationFn: async (values: BulkAllocationValues) =>
      fetchJson<BulkAllocationResult>("/api/v2/schools/teachers/assignments/bulk", {
        method: "POST",
        body: JSON.stringify({
          subjectId: values.subjectId,
          teacherProfileId: values.teacherProfileId,
          targets: values.classIds.map((classId) => ({ classId })),
        }),
      }),
    onSuccess: (result) => {
      // Kept open: "3 lessons now clash" is the part that needs acting on.
      void queryClient.invalidateQueries({ queryKey: ["schools", "teachers"] });
      void queryClient.invalidateQueries({ queryKey: ["schools", "timetable"] });
      setAllocateResult(result);
      setAllocateError(null);
    },
    onError: (error) => {
      setAllocateResult(null);
      setAllocateError(getApiErrorMessage(error));
    },
  });

  const editTeacher = useCallback((profile: TeacherProfileRecord) => {
    setTeacherDialog({
      id: profile.id,
      userId: profile.user.id,
      employeeCode: profile.employeeCode,
      department: profile.department ?? "",
      isClassTeacher: profile.isClassTeacher,
      isHod: profile.isHod,
      isActive: profile.isActive,
      userLabel: `${profile.user.name} · ${profile.user.email}`,
    });
  }, []);

  /* ── the columns ───────────────────────────────────────────────────── */

  const profileColumns = useMemo<ColumnDef<TeacherProfileRecord>[]>(
    () => [
      {
        id: "teacher",
        header: "Teacher",
        // Staff get a face for the same reason pupils do: a directory is
        // scanned, not read. The employee code is the supporting line because
        // it is the half that is unique; the email moved to a column of its
        // own, because an address is somewhere you can write TO and a code is
        // something you compare — setting the two in one mono grey run said
        // they were the same kind of fact.
        cell: ({ row }) => (
          <PersonCell
            kind="teacher"
            href={`/schools/teachers/${row.original.id}`}
            name={row.original.user.name}
            reference={row.original.employeeCode}
            context={row.original.department || undefined}
          />
        ),
      },
      {
        id: "email",
        header: "Email",
        cell: ({ row }) => <RecordCell kind="email" value={row.original.user.email} />,
      },
      {
        id: "department",
        header: "Department",
        cell: ({ row }) => row.original.department || "—",
      },
      {
        // Off by default: two flags out of a possible two, on a table that
        // already carries a department, a count and an HR state. Whoever wants
        // them turns the column on from Columns.
        id: "roles",
        header: "Profile flags",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1.5">
            {row.original.isClassTeacher ? <Badge tone="brand">Class teacher</Badge> : null}
            {row.original.isHod ? <Badge tone="info">HOD</Badge> : null}
            {!row.original.isClassTeacher && !row.original.isHod ? (
              <Badge tone="neutral">General</Badge>
            ) : null}
          </div>
        ),
      },
      {
        id: "assignments",
        header: "Assignments",
        cell: ({ row }) => <NumericCell>{row.original._count.assignments}</NumericCell>,
      },
      {
        // In the list rather than on a detail page: the useful question is
        // "which of my staff are not joined up", and that is only answerable
        // from here. The badge is the whole cell and it is the link — the
        // button beside it repeated "Find the employee" down every row, and
        // the joining itself wants the room the record page has.
        id: "hr",
        header: "HR record",
        cell: ({ row }) => (
          <Link href={`/schools/teachers/${row.original.id}`}>
            <Badge tone={row.original.employee ? "success" : "warn"}>
              {row.original.employee?.employeeId ?? "No HR record"}
            </Badge>
          </Link>
        ),
      },
      {
        id: "active",
        header: "Status",
        // One word for one state across the screen: the filter offers Archived,
        // so the row cannot answer "Inactive".
        cell: ({ row }) => (
          <Badge tone={row.original.isActive ? "success" : "neutral"}>
            {row.original.isActive ? "Active" : "Archived"}
          </Badge>
        ),
      },
      {
        id: "actions",
        // An affordance, not a field — but the head still needs the cell, or
        // every column below it shifts by one.
        header: () => <span className="sr-only">Row actions</span>,
        cell: ({ row }) => {
          const profile = row.original;
          const verbs: RecordVerb[] = [
            { label: "Edit", action: "edit", onSelect: () => editTeacher(profile) },
          ];
          if (!profile.employee) {
            verbs.push({
              label: "Find the employee",
              action: "edit",
              onSelect: () => router.push(`/schools/teachers/${profile.id}`),
            });
          }
          verbs.push(
            profile.isActive
              ? {
                  label: "Archive",
                  action: "archive",
                  tone: "warning",
                  loading:
                    archiveTeacher.isPending &&
                    archiveTeacher.variables?.id === profile.id,
                  confirm: {
                    title: `Archive ${profile.user.name}?`,
                    description:
                      "They come off the staff list and out of every picker, and their staff account and HR record are untouched. Everything they have already taught, marked and registered stays where it is, and Archived in the status filter brings them back.",
                    confirmLabel: "Archive the profile",
                  },
                  onSelect: () => archiveTeacher.mutate(profile),
                }
              : {
                  // Reinstating is a PATCH of one field, and the route checks
                  // `edit` for it — so the button asks the same question.
                  label: "Bring them back",
                  action: "edit",
                  loading:
                    reinstateTeacher.isPending &&
                    reinstateTeacher.variables?.id === profile.id,
                  onSelect: () => reinstateTeacher.mutate(profile),
                },
          );
          return (
            <div className="flex justify-end">
              <RecordActions
                layout="menu"
                resource="schools.teachers"
                label={`Actions for ${profile.user.name}`}
                verbs={verbs}
              />
            </div>
          );
        },
      },
    ],
    [editTeacher, archiveTeacher, reinstateTeacher, router],
  );

  /* ── the page ──────────────────────────────────────────────────────── */

  const profileFilters = [
    profileActive === "inactive" ? "Archived" : null,
    department || null,
  ].filter((value): value is string => Boolean(value));

  const loadError =
    profilesQuery.error ??
    // The tally is not a table, but it is the whole department dropdown and
    // the denominator on the row count. A page that silently reports "0 on the
    // staff list" because a count failed is worse than one that says so.
    staffTallyQuery.error ??
    null;

  return (
    <div className="space-y-4">
      <PageChrome title="Teaching staff">
        <CreateButton
          resource="schools.teachers"
          label="Add a teacher"
          onSelect={() => setTeacherDialog(EMPTY_TEACHER)}
        />
      </PageChrome>

      {loadError ? (
        <LoadError
          what="the teaching staff"
          error={loadError}
          onRetry={() => {
            void profilesQuery.refetch();
            void staffTallyQuery.refetch();
          }}
        />
      ) : null}

      {archiveTeacher.error ? (
        <SaveError what="That teacher's profile" error={archiveTeacher.error} />
      ) : null}
      {reinstateTeacher.error ? (
        <SaveError what="That teacher's profile" error={reinstateTeacher.error} />
      ) : null}

      {/* Tabs on their own row — which register — then the filter row that
          narrows the one the tab chose, then the table flush beneath it. */}
      <TableControls
        tabs={<TeachersViews pathname={pathname} />}
        search={
          <TableSearch
            value={search}
            onChange={setSearch}
            placeholder="Search name, email or staff number"
          />
        }
        filters={
          <>
            <FilterSelect
              label="Status"
              allLabel="On the staff"
              value={profileActive}
              options={STAFF_OPTIONS}
              onChange={(value) => setProfileActive(value as ActiveFilter)}
            />
            <FilterSelect
              label="Department"
              allLabel="Every department"
              value={department}
              options={departmentOptions}
              onChange={setDepartment}
            />
          </>
        }
        count={
          // Against the whole staff list rather than the filtered response, so
          // the denominator still means something once a department is chosen.
          profilesQuery.isPending || !tally
            ? null
            : `${profiles.length} of ${tally.total}`
        }
        actions={
          <RecordActions
            resource="schools.teachers"
            verbs={[
              {
                label: "Allocate a teacher",
                action: "create",
                unavailable:
                  subjects.length === 0 || allProfiles.length === 0
                    ? "There has to be a subject and a teacher to put together."
                    : undefined,
                onSelect: () => {
                  setAllocateError(null);
                  setAllocateResult(null);
                  setAllocateOpen(true);
                },
              },
            ]}
          />
        }
      />

      {/* No card. The register is the page, and the control row's hairline is
          the seam the column header runs off. */}
      <DataTable
        data={profiles}
        columns={profileColumns}
        initialColumnVisibility={{ roles: false }}
        pagination={{ enabled: true }}
        features={{ globalFilter: false }}
        mobileListRenderer={({ rows }) => (
          <MobileList>
            {rows.length === 0 ? (
              <MobileListEmpty>
                {profilesQuery.isPending ? "Loading profiles…" : "No profiles found."}
              </MobileListEmpty>
            ) : (
              rows.map(({ row }) => (
                <MobileList.Row
                  key={row.id}
                  // The table's first column gives every teacher a face and
                  // the phone gave them none, so one register was scannable
                  // and the other was a column of surnames. Same mark,
                  // hashed from the same name, at either width.
                  leading={
                    <RecordMark
                      kind="teacher"
                      name={row.user.name ?? row.employeeCode}
                      size="sm"
                    />
                  }
                  title={row.user.name ?? row.employeeCode}
                  subtitle={[
                    row.employeeCode,
                    row.department,
                    row.employee ? `HR ${row.employee.employeeId}` : "No HR record",
                    row.isHod ? "HOD" : null,
                    row.isClassTeacher ? "Class teacher" : null,
                    row.isActive ? null : "Archived",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  trailing={
                    <span className="font-mono text-xs tabular-nums">
                      {row._count.assignments}
                    </span>
                  }
                  onClick={() => {
                    window.location.href = `/schools/teachers/${row.id}`;
                  }}
                />
              ))
            )}
          </MobileList>
        )}
        emptyState={
          profilesQuery.isPending ? (
            <TableRowsSkeleton
              headers={[
                "Teacher",
                "Email",
                "Department",
                "Assignments",
                "HR record",
                "Status",
              ]}
              columns={[
                { avatar: true, twoLine: true },
                { width: 185 },
                { width: 140 },
                { width: 95, align: "right" },
                { width: 140, badge: true },
                { width: 85, badge: true },
              ]}
            />
          ) : profileFilters.length > 0 || search.trim() ? (
            <NothingMatched
              what="teachers"
              filters={profileFilters}
              search={search}
              onClear={() => {
                setProfileActive("");
                setDepartment("");
                setSearch("");
              }}
            />
          ) : (
            <NothingYet
              title="No teacher profiles yet"
              body="A staff account becomes a teacher here. Until it does, nobody can be put in front of a class, mark a register or enter a result."
              action={
                <CreateButton
                  resource="schools.teachers"
                  label="Add a teacher"
                  onSelect={() => setTeacherDialog(EMPTY_TEACHER)}
                />
              }
            />
          )
        }
      />

      <TeacherFormDialog
        open={teacherDialog !== null}
        onOpenChange={(open) => {
          if (!open) setTeacherDialog(null);
        }}
        initial={teacherDialog ?? EMPTY_TEACHER}
      />

      <BulkAllocationSheet
        open={allocateOpen}
        onOpenChange={(open) => {
          setAllocateOpen(open);
          if (!open) {
            setAllocateError(null);
            setAllocateResult(null);
          }
        }}
        subjects={subjects}
        teachers={allProfiles}
        classes={classes}
        isSubmitting={allocate.isPending}
        error={allocateError}
        result={allocateResult}
        onSubmit={(values) => allocate.mutate(values)}
      />
    </div>
  );
}
