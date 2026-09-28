"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, toast } from "@corelithzw/react";
import { Badge } from "@/components/schools/common/status-badge";

import { PageChrome } from "@/components/layout/page-chrome";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { FilterSelect } from "@/components/schools/common/filter-select";
import { PersonCell } from "@/components/schools/common/identity-cell";
import { useOpenTransition } from "@/components/schools/common/use-open-transition";
import { CreateButton, RecordActions, type RecordVerb } from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingLeftToDo,
  NothingMatched,
  SaveError,
  TableRowsSkeleton,
} from "@/components/records/states";
import { TableControls, TableSearch } from "@/components/records/table-controls";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumericCell } from "@/components/ui/numeric-cell";
import { Textarea } from "@/components/ui/textarea";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { fetchSchoolsStudents } from "@/lib/schools/admin-v2";

import { personLabel, shortDate } from "@/components/schools/boarding/boarding-data";
import { BoardingViews } from "@/components/schools/boarding/boarding-views";

/**
 * Who is ill, since when, and whose bed is being held.
 *
 * ## An admission is not a re-allocation
 *
 * A boarder in the sick bay **keeps their own bed**. It is held, not freed —
 * which is why `SchoolSickBayAdmission` is a second, lighter record rather
 * than a move into another house. Modelling the sick bay as a hostel would end
 * the child's allocation and free their bed, and the placer would hand it to
 * somebody else while its owner is two doors away with a temperature.
 *
 * Nothing on this screen writes to an allocation, and the held bed is on every
 * row precisely because the matron's next question after "who is in here" is
 * "and where does this one go back to".
 *
 * ## Why discharge is an update
 *
 * "Who was in the sick bay on the night of the twelfth" is a question schools
 * get asked, and a school that answers it with a shrug because the row was
 * tidied away has a real problem. So a discharge stamps the row rather than
 * removing it, and the screen can show the nights behind tonight.
 *
 * Going back to the bed needs no write at all — it was theirs the whole time.
 */

type SickBayAdmission = {
  id: string;
  studentId: string;
  admittedAt: string;
  dischargedAt: string | null;
  dischargedTo: string | null;
  reason: string;
  notes: string | null;
  student: {
    id: string;
    studentNo: string;
    firstName: string;
    lastName: string;
    gender: string | null;
  };
  term: { id: string; code: string; name: string };
  bed: { id: string; code: string; bay: number | null; tier: string | null } | null;
  admittedBy: { id: string; name: string | null; email: string };
  /** The bed still theirs back in their house. Read-only, and the whole point. */
  heldBed: { hostelName: string; bedCode: string | null } | null;
};

const VIEWS = [
  { value: "in", label: "In the sick bay" },
  { value: "all", label: "This term, including discharges" },
];

/** How long they have been in, in the words somebody says out loud. */
function nightsIn(admittedAt: string, dischargedAt: string | null): string {
  const from = new Date(admittedAt);
  const to = dischargedAt ? new Date(dischargedAt) : new Date();
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return "—";
  const days = Math.floor((to.getTime() - from.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "1 night";
  return `${days} nights`;
}

function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`;
}

export function SickBayContent() {
  const queryClient = useQueryClient();

  const [view, setView] = useState("in");
  const [search, setSearch] = useState("");
  const [admitting, setAdmitting] = useState(false);
  const [discharging, setDischarging] = useState<SickBayAdmission | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const admissionsQuery = useQuery({
    queryKey: ["schools", "boarding", "sick-bay", view],
    queryFn: () =>
      fetchJson<SickBayAdmission[]>(
        `/api/v2/schools/boarding/sick-bay?includeDischarged=${view === "all"}`,
      ),
  });

  const admissions = admissionsQuery.data ?? [];
  const inNow = admissions.filter((admission) => !admission.dischargedAt);

  /*
   * Filtered plainly rather than memoised. The list is already cached by the
   * query client and a sick bay is a handful of rows, so this runs on a render
   * that was going to happen anyway — and a memo keyed on an array rebuilt by
   * the `?? []` above would be a memo that never hits.
   */
  const needle = search.trim().toLowerCase();
  const rows = needle
    ? admissions.filter((admission) =>
        `${fullName(admission.student)} ${admission.student.studentNo} ${admission.reason}`
          .toLowerCase()
          .includes(needle),
      )
    : admissions;

  const discharge = useMutation({
    mutationFn: (input: { id: string; dischargedTo: string; notes?: string | null }) =>
      fetchJson<SickBayAdmission>(`/api/v2/schools/boarding/sick-bay/${input.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          dischargedTo: input.dischargedTo,
          ...(input.notes ? { notes: input.notes } : {}),
        }),
      }),
    onSettled: () => setPendingId(null),
    onSuccess: (discharged) => {
      void queryClient.invalidateQueries({ queryKey: ["schools", "boarding"] });
      setDischarging(null);
      toast(
        discharged.dischargedTo === "Gone home"
          ? `${discharged.student.firstName} has gone home to recover.`
          : `${discharged.student.firstName} is back in the house.`,
        {
          tone: "success",
          description: discharged.heldBed
            ? `${discharged.heldBed.hostelName}${discharged.heldBed.bedCode ? `, bed ${discharged.heldBed.bedCode}` : ""} was held for them the whole time.`
            : undefined,
        },
      );
    },
  });

  const columns = useMemo<ColumnDef<SickBayAdmission>[]>(
    () => [
      {
        id: "student",
        header: "Pupil",
        cell: ({ row }) => (
          <PersonCell
            kind="student"
            href={`/schools/students/${row.original.student.id}`}
            firstName={row.original.student.firstName}
            lastName={row.original.student.lastName}
            reference={row.original.student.studentNo}
          />
        ),
      },
      {
        id: "reason",
        header: "What is wrong",
        cell: ({ row }) => (
          <span className="block max-w-[28ch] truncate text-[color:var(--text-body)]">
            {row.original.reason}
          </span>
        ),
      },
      {
        id: "since",
        header: "Since",
        cell: ({ row }) => (
          <NumericCell align="left">{shortDate(row.original.admittedAt)}</NumericCell>
        ),
      },
      {
        id: "nights",
        header: "How long",
        cell: ({ row }) => (
          <NumericCell align="left">
            {nightsIn(row.original.admittedAt, row.original.dischargedAt)}
          </NumericCell>
        ),
      },
      {
        id: "held",
        header: "Their own bed",
        // The load-bearing column. It says the bed is still theirs, which is
        // the fact the whole model exists to keep true — and it is read-only
        // here, because an admission has never touched an allocation.
        cell: ({ row }) => {
          const held = row.original.heldBed;
          if (!held) {
            return <span className="text-[color:var(--text-subtle)]">—</span>;
          }
          return (
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="text-[color:var(--text-body)]">
                {held.hostelName}
                {held.bedCode ? ` · ${held.bedCode}` : ""}
              </span>
              {row.original.dischargedAt ? null : <Badge tone="info">Held</Badge>}
            </span>
          );
        },
      },
      {
        id: "ward",
        header: "Sick bay bed",
        cell: ({ row }) => (
          <NumericCell align="left">{row.original.bed?.code ?? "—"}</NumericCell>
        ),
      },
      {
        id: "state",
        header: "State",
        cell: ({ row }) =>
          row.original.dischargedAt ? (
            <Badge tone="neutral">
              {row.original.dischargedTo ?? "Discharged"} ·{" "}
              {shortDate(row.original.dischargedAt)}
            </Badge>
          ) : (
            <Badge tone="danger">In the sick bay</Badge>
          ),
      },
      {
        id: "verbs",
        header: () => <span className="sr-only">Row actions</span>,
        cell: ({ row }) => {
          const admission = row.original;
          if (admission.dischargedAt) {
            return (
              <div className="flex justify-end">
                <span className="text-xs text-[color:var(--text-subtle)]">Closed</span>
              </div>
            );
          }
          const verbs: RecordVerb[] = [
            {
              label: "Discharge",
              action: "edit",
              loading: pendingId === admission.id,
              onSelect: () => setDischarging(admission),
            },
            {
              label: "Send home",
              action: "edit",
              tone: "warning",
              loading: pendingId === admission.id,
              confirm: {
                title: "Send them home to recover",
                description: `${fullName(admission.student)} leaves the sick bay and goes home. ${
                  admission.heldBed
                    ? `${admission.heldBed.hostelName}${admission.heldBed.bedCode ? `, bed ${admission.heldBed.bedCode}` : ""} stays theirs — going home does not free it.`
                    : "Their bed stays theirs."
                }`,
                confirmLabel: "Send them home",
              },
              onSelect: () => {
                setPendingId(admission.id);
                discharge.mutate({ id: admission.id, dischargedTo: "Gone home" });
              },
            },
          ];
          return (
            <div className="flex justify-end">
              <RecordActions
                layout="menu"
                resource="schools.boarding"
                label={`Actions for ${fullName(admission.student)}`}
                verbs={verbs}
              />
            </div>
          );
        },
      },
    ],
    [discharge, pendingId],
  );

  return (
    <>
      <PageChrome title="Sick bay">
        <CreateButton
          resource="schools.boarding"
          label="Admit a pupil"
          onSelect={() => setAdmitting(true)}
        />
      </PageChrome>

      {admissionsQuery.error ? (
        <LoadError
          what="the sick bay"
          error={admissionsQuery.error}
          onRetry={() => void admissionsQuery.refetch()}
        />
      ) : null}
      {discharge.error ? <SaveError what="That discharge" error={discharge.error} /> : null}

      <TableControls
        tabs={<BoardingViews sickBay={inNow.length} />}
        search={
          <TableSearch
            value={search}
            onChange={setSearch}
            placeholder="Search name or complaint"
          />
        }
        filters={
          <FilterSelect
            label="Showing"
            allLabel="In the sick bay"
            value={view === "in" ? "" : view}
            options={VIEWS.filter((option) => option.value !== "in")}
            onChange={(value) => setView(value || "in")}
          />
        }
        count={admissionsQuery.isPending ? null : `${rows.length} of ${admissions.length}`}
      />

      {admissionsQuery.isPending ? (
        <TableRowsSkeleton
          headers={[
            "Pupil",
            "What is wrong",
            "Since",
            "How long",
            "Their own bed",
            "Sick bay bed",
            "State",
            "",
          ]}
          columns={[
            { avatar: true, twoLine: true },
            {},
            { width: 70 },
            { width: 80 },
            { width: 150 },
            { width: 90 },
            { width: 120, badge: true },
            { width: 40 },
          ]}
          rows={5}
          label="Reading the sick bay"
        />
      ) : (
        <>
          <DataTable
            data={rows}
            columns={columns}
            pagination={{ enabled: true }}
            emptyState={
              search.trim() ? (
                <NothingMatched
                  what="admissions"
                  search={search}
                  onClear={() => setSearch("")}
                />
              ) : view === "all" ? (
                <NothingLeftToDo
                  title="Nobody has been in the sick bay this term"
                  body="Admissions stay on the record once they happen, so this fills itself in."
                />
              ) : (
                <NothingLeftToDo
                  title="Nobody is in the sick bay"
                  body="Every boarder is in their own bed tonight."
                  action={
                    <Button asChild variant="secondary">
                      <Link href="/schools/boarding/roll-call">Take the roll call</Link>
                    </Button>
                  }
                />
              )
            }
          />

          {/* The rule the whole page is built on, said once where somebody
              working the list will read it. */}
          <p className="pt-3 text-xs text-[color:var(--text-subtle)]">
            A boarder in the sick bay keeps their own bed. It is held, not freed — which is
            why an admission is not a re-allocation, and why discharging somebody needs no
            bed to be found.
          </p>
        </>
      )}

      <AdmitDialog
        open={admitting}
        alreadyIn={new Set(inNow.map((admission) => admission.studentId))}
        onClose={() => setAdmitting(false)}
      />

      <DischargeDialog
        admission={discharging}
        saving={discharge.isPending}
        error={discharge.error}
        onClose={() => setDischarging(null)}
        onDischarge={(input) => {
          if (!discharging) return;
          setPendingId(discharging.id);
          discharge.mutate({ id: discharging.id, ...input });
        }}
      />
    </>
  );
}

/* ── admitting ───────────────────────────────────────────────────────── */

/**
 * Admitting a boarder.
 *
 * Deliberately short: who, what is wrong, and anything the warden should know.
 * There is no bed to choose and no house to move them out of — their bed does
 * not change hands, so there is nothing to decide about it.
 *
 * Only boarders are offered. A day pupil sent to the sanatorium is a health
 * event, not a sick-bay admission, and there is no bed of theirs to hold.
 */
function AdmitDialog({
  open,
  alreadyIn,
  onClose,
}: {
  open: boolean;
  alreadyIn: ReadonlySet<string>;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [studentId, setStudentId] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useOpenTransition(open, () => {
    setError(null);
    setStudentId("");
    setReason("");
    setNotes("");
  });

  const boardersQuery = useQuery({
    queryKey: ["schools", "boarding", "boarders"],
    queryFn: () =>
      fetchSchoolsStudents({ page: 1, limit: 400, status: "ACTIVE", isBoarding: true }),
    enabled: open,
  });

  const admit = useMutation({
    mutationFn: () =>
      fetchJson<SickBayAdmission>("/api/v2/schools/boarding/sick-bay", {
        method: "POST",
        body: JSON.stringify({
          studentId,
          reason: reason.trim(),
          notes: notes.trim() || null,
        }),
      }),
    onSuccess: (admission) => {
      void queryClient.invalidateQueries({ queryKey: ["schools", "boarding"] });
      onClose();
      toast(`${admission.student.firstName} is in the sick bay.`, {
        tone: "success",
        description: admission.heldBed
          ? `${admission.heldBed.hostelName}${admission.heldBed.bedCode ? `, bed ${admission.heldBed.bedCode}` : ""} is held for them.`
          : "Their bed is held for them.",
      });
    },
    onError: (cause) => setError(getApiErrorMessage(cause)),
  });

  const candidates = (boardersQuery.data?.data ?? []).filter(
    (student) => !alreadyIn.has(student.id),
  );

  return (
    <RecordDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Admit to the sick bay"
      description="Their own bed is held for them — this does not move them out of their house."
      size="md"
      errors={error ? [error] : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (!admit.isPending && studentId && reason.trim()) admit.mutate();
      }}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={admit.isPending}
            disabled={admit.isPending || !studentId || !reason.trim()}
          >
            Admit them
          </Button>
        </>
      }
    >
      <Alert tone="info" title="Their bed stays theirs">
        An admission holds the bed rather than freeing it, so nobody else is offered it
        while they are in here.
      </Alert>

      <FilterSelect
        label="Pupil"
        allLabel={
          boardersQuery.isPending
            ? "Reading the roll…"
            : candidates.length === 0
              ? "Every boarder is already in the sick bay"
              : "Choose a boarder"
        }
        className="space-y-2"
        value={studentId}
        options={candidates.map((student) => ({
          value: student.id,
          label: personLabel(student),
        }))}
        onChange={setStudentId}
      />

      <div className="space-y-2">
        <Label htmlFor="sick-reason">What is wrong</Label>
        <Input
          id="sick-reason"
          required
          value={reason}
          placeholder="Fever since this morning"
          onChange={(event) => setReason(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="sick-notes">Note for the warden</Label>
        <Textarea
          id="sick-notes"
          rows={2}
          value={notes}
          placeholder="Home rung at 14:20. Mother collecting if no better by Friday."
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
    </RecordDialog>
  );
}

/* ── discharging ─────────────────────────────────────────────────────── */

/**
 * Sending somebody back.
 *
 * Names the bed they are going back to, because that is the reassurance the
 * design is built to give: it was held, so there is nothing to find and
 * nothing to allocate.
 */
function DischargeDialog({
  admission,
  saving,
  error,
  onClose,
  onDischarge,
}: {
  admission: SickBayAdmission | null;
  saving: boolean;
  error: unknown;
  onClose: () => void;
  onDischarge: (input: { dischargedTo: string; notes?: string | null }) => void;
}) {
  const open = admission !== null;
  const [notes, setNotes] = useState("");

  useOpenTransition(open, () => setNotes(""));

  return (
    <RecordDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={admission ? `Discharge ${fullName(admission.student)}` : "Discharge"}
      description="Back to the house, into the bed that was held for them."
      size="sm"
      errors={error ? [getApiErrorMessage(error)] : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (!saving) onDischarge({ dischargedTo: "Back to the house", notes: notes.trim() || null });
      }}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={saving} disabled={saving}>
            Back to the house
          </Button>
        </>
      }
    >
      {admission?.heldBed ? (
        <Alert tone="success" title="Their bed is ready">
          {admission.heldBed.hostelName}
          {admission.heldBed.bedCode ? `, bed ${admission.heldBed.bedCode}` : ""} was held
          the whole time they were in here. Nothing needs allocating.
        </Alert>
      ) : (
        <Alert tone="warn" title="No bed is being held">
          They have no live allocation, so somebody will have to give them a bed on the
          allocations screen.
        </Alert>
      )}

      <p className="text-sm text-[color:var(--text-muted)]">
        In the sick bay {admission ? nightsIn(admission.admittedAt, null).toLowerCase() : ""}
        {admission ? ` — ${admission.reason}.` : "."}
      </p>

      <div className="space-y-2">
        <Label htmlFor="discharge-notes">Note</Label>
        <Textarea
          id="discharge-notes"
          rows={2}
          value={notes}
          placeholder="Temperature normal since last night. Back on games on Monday."
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
    </RecordDialog>
  );
}
