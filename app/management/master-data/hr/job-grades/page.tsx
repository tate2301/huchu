"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ManagementShell } from "@/components/settings/management-shell";
import { RecordActivityTrail } from "@/components/activity/record-activity-trail";
import {
  HeaderAction,
  ListColumn,
  ListRow,
  RecordHeader,
  RecordList,
  RegisterLayout,
  SectionAction,
  SectionHeading,
  StatusBadge,
  type ListColumnState,
} from "@/components/management/ui";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { dsConfirm } from "@/components/ui/ds-confirm";
import { useToast } from "@/components/ui/use-toast";
import { useReservedId } from "@/hooks/use-reserved-id";
import {
  createJobGrade,
  deleteJobGrade,
  fetchEmployees,
  fetchJobGrades,
  type JobGradeRecord,
  updateJobGrade,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  Archive,
  ArrowLeft,
  IdentificationCard as GradeMark,
  ListBullets,
  RefreshCcw,
  SlidersHorizontal,
  Users,
} from "@/lib/icons";

import {
  CommitInput,
  CreateField,
  CreateSheet,
  DETAIL_CONTROL_CLASS,
  DetailGrid,
  DetailRow,
  NoRecord,
  StatusSelect,
} from "@/app/management/master-data/operations/_components/register-fields";

/** The register's query key. Unchanged — invalidation elsewhere depends on it. */
const QUERY_KEY = ["management", "master-data", "job-grades"] as const;

const FULL_LOG_HREF = "/preferences/organization/activity";

/**
 * Job grades — `JobGrades.dc.html`: the list beside the record.
 *
 * The board also draws a Department and a Pay band field. `JobGradeRecord` is
 * `{code, name, rank, isActive, _count.employees}`, so Details renders the
 * three fields the model has.
 *
 * `People on this grade` is the board's roster, read through the existing
 * `fetchEmployees({ gradeId })` — nothing about the register's own key or its
 * mutations changes, the section just has a key of its own under the same
 * family. Its second column is Department, not the board's Site:
 * `EmployeeSummary` carries `department` and no site, and a column header that
 * names a field the rows cannot fill is worse than naming the one they can.
 *
 * `Move people` sits on that section's heading rather than in the header —
 * rule 2, the verb belongs to the list it acts on, and the header keeps the
 * one verb that acts on the record itself (Retire, or Restore once retired).
 *
 * The Details grid, the committing controls and the create sheet come from the
 * registers' shared call-site module rather than being restated here — the
 * same four helpers were duplicated in this file and in the departments
 * register, which is two places for one set of numbers to drift.
 */
export default function JobGradesManagementPage() {
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [search, setSearch] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [draftName, setDraftName] = React.useState("");
  const [draftRank, setDraftRank] = React.useState("0");

  const {
    reservedId,
    isReserving,
    error: reserveError,
  } = useReservedId({ entity: "JOB_GRADE", enabled: creating });

  const gradesQuery = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => fetchJobGrades({ limit: 500 }),
  });

  const all = React.useMemo(() => gradesQuery.data?.data ?? [], [gradesQuery.data]);
  const rows = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (row) =>
        row.code.toLowerCase().includes(needle) ||
        row.name.toLowerCase().includes(needle),
    );
  }, [all, search]);

  const wide = useWideViewport();
  React.useEffect(() => {
    if (!wide) return;
    if (selectedId && rows.some((row) => row.id === selectedId)) return;
    setSelectedId(rows[0]?.id ?? null);
  }, [rows, selectedId, wide]);

  const selected = React.useMemo(
    () => rows.find((row) => row.id === selectedId) ?? null,
    [rows, selectedId],
  );

  /**
   * The roster the board draws under the record. Its own key, nested under the
   * register's so the existing invalidations reach it, and it only runs once a
   * record is open — a list column with no selection has no roster to draw.
   */
  const peopleQuery = useQuery({
    queryKey: [...QUERY_KEY, "people", selected?.id ?? null],
    queryFn: () => fetchEmployees({ gradeId: selected!.id, limit: 200 }),
    enabled: Boolean(selected?.id),
  });

  const people = React.useMemo(
    () => peopleQuery.data?.data ?? [],
    [peopleQuery.data],
  );

  const invalidate = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }, [queryClient]);

  const createMutation = useMutation({
    mutationFn: createJobGrade,
    onSuccess: (record) => {
      toast({ title: "Job grade created", variant: "success" });
      closeCreate();
      setSelectedId(record?.id ?? null);
      invalidate();
    },
    onError: (err) => {
      toast({
        title: "Unable to create job grade",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; input: Parameters<typeof updateJobGrade>[1] }) =>
      updateJobGrade(payload.id, payload.input),
    onSuccess: () => {
      invalidate();
    },
    onError: (err) => {
      toast({
        title: "Unable to update job grade",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteJobGrade,
    onSuccess: () => {
      toast({ title: "Job grade deleted", variant: "success" });
      setSelectedId(null);
      invalidate();
    },
    onError: (err) => {
      toast({
        title: "Unable to delete job grade",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  function closeCreate() {
    setCreating(false);
    setDraftName("");
    setDraftRank("0");
  }

  function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const name = draftName.trim();
    if (!name) {
      toast({ title: "A name is required", variant: "destructive" });
      return;
    }
    if (!reservedId.trim()) {
      toast({
        title: "Job grade code unavailable",
        description: reserveError ?? "Code reservation is in progress.",
        variant: "destructive",
      });
      return;
    }
    const rank = Number(draftRank);
    if (!Number.isInteger(rank) || rank < 0) {
      toast({
        title: "Rank must be a whole number, zero or more",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate({
      code: reservedId.trim(),
      name,
      rank,
      isActive: true,
    });
  }

  function commitRank(record: JobGradeRecord, next: string) {
    const rank = Number(next);
    if (!Number.isInteger(rank) || rank < 0) {
      toast({
        title: "Rank must be a whole number, zero or more",
        variant: "destructive",
      });
      return;
    }
    if (rank === record.rank) return;
    updateMutation.mutate({ id: record.id, input: { rank } });
  }

  const state: ListColumnState = gradesQuery.isLoading
    ? "loading"
    : gradesQuery.isError
      ? "failed"
      : rows.length > 0
        ? "ready"
        : search.trim()
          ? "no-matches"
          : "empty";

  return (
    // No `title`: the register draws its own chrome, so the shell adds no
    // header above it — rule 4 puts the record's name in the record header and
    // nowhere else. The count the list already loaded goes to the rail badge.
    <ManagementShell railCounts={{ "job-grades": all.length }}>
      <RegisterLayout
        hasSelection={Boolean(selected)}
        list={
          <ListColumn
            title="Job grades"
            noun="job grade"
            count={all.length}
            state={state}
            columns={{ row: "Job grade", value: "People" }}
            search={{
              value: search,
              onChange: setSearch,
              placeholder: "Code or name",
            }}
            onNew={() => setCreating(true)}
            onRetry={() => void gradesQuery.refetch()}
          >
            {rows.map((row) => (
              <ListRow
                key={row.id}
                code={row.code}
                name={row.name}
                value={row._count?.employees ?? 0}
                selected={row.id === selectedId}
                onSelect={() => setSelectedId(row.id)}
                // The board draws a retired grade muted rather than chipped:
                // a status column on a list where almost every row says the
                // same word is a column of noise (rule 5).
                //
                // The mute is the *ink*, not opacity. `JG-12` on the board
                // drops its name from `#16181D` to `#5E6573` and keeps the
                // mono code where it was; 55% opacity instead washes the
                // whole row, and `#16181D` at .55 on white is 3.9:1 — under
                // the floor, on the one row a reader most needs to read.
                // Meta ink is 5.9:1 on white and 4.5:1 on the selected tint.
                className={
                  row.isActive === false ? "[&_*]:text-[#5E6573]" : undefined
                }
              />
            ))}
          </ListColumn>
        }
      >
        {selected ? (
          <>
            <BackToList label="Job grades" onBack={() => setSelectedId(null)} />

            <RecordHeader
              title={selected.name}
              icon={GradeMark}
              renameLabel="Rename the job grade"
              onRename={(next) =>
                updateMutation.mutate({
                  id: selected.id,
                  input: { name: next },
                })
              }
              badge={
                <StatusBadge
                  context="header"
                  tone={selected.isActive ? "success" : "neutral"}
                >
                  Retired
                </StatusBadge>
              }
              action={
                selected.isActive ? (
                  <HeaderAction
                    icon={Archive}
                    disabled={updateMutation.isPending}
                    onClick={() =>
                      updateMutation.mutate({
                        id: selected.id,
                        input: { isActive: false },
                      })
                    }
                  >
                    Retire
                  </HeaderAction>
                ) : (
                  <HeaderAction
                    icon={RefreshCcw}
                    disabled={updateMutation.isPending}
                    onClick={() =>
                      updateMutation.mutate({
                        id: selected.id,
                        input: { isActive: true },
                      })
                    }
                  >
                    Restore
                  </HeaderAction>
                )
              }
              overflow={
                <DropdownMenuItem
                  onSelect={() => {
                    void dsConfirm({
                      title: `Delete ${selected.name}?`,
                      description:
                        "Employees already on it keep it until they are moved.",
                      confirmLabel: "Delete the grade",
                      variant: "danger",
                    }).then((confirmed) => {
                      if (confirmed) deleteMutation.mutate(selected.id);
                    });
                  }}
                >
                  Delete job grade
                </DropdownMenuItem>
              }
            />

            <SectionHeading icon={SlidersHorizontal} tone="brand">
              Details
            </SectionHeading>
            <DetailGrid>
              <DetailRow label="Code">
                {(id) => (
                  <Input
                    id={id}
                    value={selected.code}
                    readOnly
                    className={`${DETAIL_CONTROL_CLASS} font-mono`}
                  />
                )}
              </DetailRow>
              <DetailRow label="Rank">
                {(id) => (
                  <CommitInput
                    id={id}
                    mono
                    inputMode="numeric"
                    value={String(selected.rank)}
                    onCommit={(next) => commitRank(selected, next)}
                  />
                )}
              </DetailRow>
              <DetailRow label="Status">
                {(id) => (
                  <StatusSelect
                    id={id}
                    active={selected.isActive}
                    archivedLabel="Retired"
                    disabled={updateMutation.isPending}
                    onChange={(isActive) =>
                      updateMutation.mutate({
                        id: selected.id,
                        input: { isActive },
                      })
                    }
                  />
                )}
              </DetailRow>
            </DetailGrid>

            <SectionHeading
              icon={ListBullets}
              // `_count.employees` first, because it is the same number the
              // list row for this grade is showing: the roster is read with a
              // `limit`, so `people.length` would quietly disagree with the
              // list on any grade with more people than one page holds.
              count={
                selected._count?.employees ??
                (peopleQuery.isSuccess ? people.length : undefined)
              }
              action={
                <SectionAction
                  icon={Users}
                  // The directory is where a grade is reassigned. It reads no
                  // filter out of the URL today, so the link carries none
                  // rather than a parameter that quietly does nothing.
                  onClick={() => router.push("/people")}
                >
                  Move people
                </SectionAction>
              }
            >
              People on this grade
            </SectionHeading>
            {/* A column header over nothing is the board with a hole in it:
                an empty grade (the board draws one — `Learner artisan`, 0) and
                a roster still in flight both get the line instead. */}
            {peopleQuery.isLoading ? (
              <RosterNote>Loading the roster</RosterNote>
            ) : people.length > 0 ? (
              <RecordList
                columns={{ row: "Person", value: "Department" }}
                valueWidth={96}
                rows={people.map((person) => ({
                  id: person.id,
                  name: person.name,
                  value: person.department?.name
                    ? { kind: "text" as const, value: person.department.name }
                    : undefined,
                }))}
              />
            ) : (
              <RosterNote>
                {peopleQuery.isError
                  ? "The roster could not be loaded."
                  : "Nobody is on this grade."}
              </RosterNote>
            )}

            <RecordActivityTrail
              entityType="JobGrade"
              entityId={selected.id}
              fullLogHref={FULL_LOG_HREF}
            />
          </>
        ) : (
          <NoRecord
            label={
              gradesQuery.isLoading
                ? "Loading job grades"
                : search.trim()
                  ? "No job grade matches that search."
                  : "No job grade to show yet."
            }
          />
        )}

        <CreateSheet
          open={creating}
          onOpenChange={(open) => (open ? setCreating(true) : closeCreate())}
          title="New job grade"
          submitLabel="Create job grade"
          busy={createMutation.isPending || isReserving || !reservedId}
          onSubmit={handleCreate}
        >
          <CreateField label="Code">
            {(id) => (
              <Input
                id={id}
                readOnly
                value={reserveError ? "" : reservedId}
                placeholder={reserveError ?? (isReserving ? "Reserving" : "")}
                className={`${DETAIL_CONTROL_CLASS} font-mono`}
              />
            )}
          </CreateField>
          <CreateField label="Name">
            {(id) => (
              <Input
                id={id}
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="Senior artisan"
                className={DETAIL_CONTROL_CLASS}
              />
            )}
          </CreateField>
          <CreateField label="Rank">
            {(id) => (
              <Input
                id={id}
                inputMode="numeric"
                value={draftRank}
                onChange={(event) => setDraftRank(event.target.value)}
                className={`${DETAIL_CONTROL_CLASS} font-mono`}
              />
            )}
          </CreateField>
        </CreateSheet>
      </RegisterLayout>
    </ManagementShell>
  );
}

/**
 * The muted line the roster shows in place of a `RecordList` it cannot fill.
 * The same rung as the record column's own empty line — `400 13/1.5 #5E6573` —
 * and bounded to the list's 470px so it starts on the same left edge.
 */
function RosterNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[13px] font-normal leading-[1.5] text-[#5E6573]"
      style={{ maxWidth: 470 }}
    >
      {children}
    </p>
  );
}

/**
 * The way back to the list below 900px, where `RegisterLayout` shows one column
 * at a time. Hidden on desktop, where both columns are on screen; without it a
 * phone reader who picks a row has no way back to the list.
 */
function BackToList({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="mb-3 hidden items-center gap-2 text-[13px] font-medium leading-[1.4] text-[#565C69] max-[899px]:inline-flex"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {label}
    </button>
  );
}

/**
 * Below 900px the register shows one column at a time, so auto-selecting the
 * first row would open a record the reader never asked for and hide the list
 * behind it. Above it, an empty record column beside a full list is the board
 * with a hole in it.
 */
function useWideViewport() {
  const [wide, setWide] = React.useState(false);

  React.useEffect(() => {
    const query = window.matchMedia("(min-width: 900px)");
    const sync = () => setWide(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return wide;
}
