"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@corelithzw/react";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { FilterSelect } from "@/components/schools/common/filter-select";
import { useOpenTransition } from "@/components/schools/common/use-open-transition";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { fetchSchoolsStudents, fetchSchoolsTerms } from "@/lib/schools/admin-v2";

import {
  ALLOCATION_STATUSES,
  GENDER_POLICIES,
  personLabel,
  type AllocationStatus,
  type BoardingAllocation,
  type BoardingHostel,
  type LeaveRequest,
} from "./boarding-data";

/**
 * The three forms the boarding board opens.
 *
 * All three are `RecordDialog` rather than a drawer: none of them is more of
 * the thing behind them, they are short questions that want the whole of your
 * attention and then get out of the way.
 *
 * Nothing here takes an id as text. A bed is chosen from the board, a term from
 * the calendar and a child from the roll, because a warden who has to paste a
 * UUID is a warden who will paste the wrong one.
 */

/** `datetime-local` gives no zone; the API wants an instant. */
function toInstant(local: string): string {
  return new Date(local).toISOString();
}

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function DialogFooter({
  onCancel,
  saving,
  saveLabel,
}: {
  onCancel: () => void;
  saving: boolean;
  saveLabel: string;
}) {
  return (
    <>
      <Button type="button" variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" variant="primary" loading={saving} disabled={saving}>
        {saveLabel}
      </Button>
    </>
  );
}

/* ── hostels ─────────────────────────────────────────────────────────── */

type HostelDraft = {
  code: string;
  name: string;
  genderPolicy: string;
  capacity: string;
  isActive: string;
};

export function HostelDialog({
  open,
  hostel,
  onClose,
}: {
  open: boolean;
  /** Null when adding a house rather than correcting one. */
  hostel: BoardingHostel | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<HostelDraft>({
    code: "",
    name: "",
    genderPolicy: "MIXED",
    capacity: "",
    isActive: "true",
  });
  const [error, setError] = useState<string | null>(null);

  useOpenTransition(open, () => {
    setError(null);
    setDraft({
      code: hostel?.code ?? "",
      name: hostel?.name ?? "",
      genderPolicy: hostel?.genderPolicy ?? "MIXED",
      capacity: hostel?.capacity != null ? String(hostel.capacity) : "",
      isActive: hostel ? String(hostel.isActive) : "true",
    });
  });

  const save = useMutation({
    mutationFn: () => {
      const capacity = draft.capacity.trim() ? Number(draft.capacity.trim()) : null;
      const body = {
        name: draft.name.trim(),
        genderPolicy: draft.genderPolicy,
        capacity,
        isActive: draft.isActive === "true",
      };
      return hostel
        ? fetchJson(`/api/v2/schools/boarding/hostels/${hostel.id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          })
        : fetchJson("/api/v2/schools/boarding/hostels", {
            method: "POST",
            body: JSON.stringify({ ...body, code: draft.code.trim() }),
          });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schools", "boarding"] });
      onClose();
    },
    onError: (cause) => setError(getApiErrorMessage(cause)),
  });

  return (
    <RecordDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={hostel ? hostel.name : "Add a hostel"}
      description="A house, who it takes, and how many it is meant to hold."
      size="md"
      errors={error ? [error] : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (!save.isPending) save.mutate();
      }}
      footer={
        <DialogFooter
          onCancel={onClose}
          saving={save.isPending}
          saveLabel={hostel ? "Save the hostel" : "Add the hostel"}
        />
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="hostel-code">Code</Label>
          <Input
            id="hostel-code"
            required
            value={draft.code}
            // The code is what the beds, the rooms and every allocation are
            // filed under. Changing it after the fact is a rename of history.
            disabled={Boolean(hostel)}
            placeholder="CHH"
            onChange={(event) =>
              setDraft((current) => ({ ...current, code: event.target.value }))
            }
          />
          {hostel ? (
            <p className="text-sm text-muted-foreground">
              A house keeps the code it was opened under.
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="hostel-name">Name</Label>
          <Input
            id="hostel-name"
            required
            value={draft.name}
            placeholder="Chishawasha House"
            onChange={(event) =>
              setDraft((current) => ({ ...current, name: event.target.value }))
            }
          />
        </div>
        <FilterSelect
          label="Takes"
          allLabel="Mixed"
          className="space-y-2"
          value={draft.genderPolicy === "MIXED" ? "" : draft.genderPolicy}
          options={GENDER_POLICIES.filter((row) => row.value !== "MIXED")}
          onChange={(value) =>
            setDraft((current) => ({ ...current, genderPolicy: value || "MIXED" }))
          }
        />
        <div className="space-y-2">
          <Label htmlFor="hostel-capacity">Intended capacity</Label>
          <Input
            id="hostel-capacity"
            type="number"
            min={0}
            value={draft.capacity}
            onChange={(event) =>
              setDraft((current) => ({ ...current, capacity: event.target.value }))
            }
          />
          <p className="text-sm text-muted-foreground">
            What the house is meant to hold. Beds are what it actually holds.
          </p>
        </div>
        <FilterSelect
          label="In use"
          allLabel="In use"
          className="space-y-2"
          value={draft.isActive === "true" ? "" : "false"}
          options={[{ value: "false", label: "Closed" }]}
          onChange={(value) =>
            setDraft((current) => ({ ...current, isActive: value ? "false" : "true" }))
          }
        />
      </div>
    </RecordDialog>
  );
}

/* ── allocations ─────────────────────────────────────────────────────── */

type OccupancyBoard = {
  beds: {
    id: string;
    code: string;
    room: { id: string; code: string; floor: string | null };
    student: { id: string } | null;
  }[];
};

/**
 * Giving a bed out.
 *
 * The hostel is chosen first because it decides which beds exist; the gender
 * and capacity rules stay on the server, which refuses with the hostel and the
 * rule named — the sentence a warden needs to read anyway.
 */
export function AllocateBedDialog({
  open,
  hostels,
  defaultHostelId,
  onClose,
}: {
  open: boolean;
  hostels: BoardingHostel[];
  defaultHostelId?: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [hostelId, setHostelId] = useState("");
  const [bedId, setBedId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [termId, setTermId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  useOpenTransition(open, () => {
    setError(null);
    setHostelId(defaultHostelId ?? "");
    setBedId("");
    setStudentId("");
    setStartDate("");
  });

  const termsQuery = useQuery({
    queryKey: ["schools", "terms", "active"],
    queryFn: () => fetchSchoolsTerms({ page: 1, limit: 20, isActive: true }),
    enabled: open,
  });

  /*
   * The running term is the default, derived rather than written into state
   * once the query lands. Seeding state from a query needs an effect that fires
   * after the first paint, so the select rendered blank for a frame and a warden
   * who was quick could submit an allocation with no term on it.
   */
  const effectiveTermId = termId || termsQuery.data?.data?.[0]?.id || "";

  const studentsQuery = useQuery({
    queryKey: ["schools", "boarding", "candidates"],
    queryFn: () => fetchSchoolsStudents({ page: 1, limit: 300, status: "ACTIVE" }),
    enabled: open,
  });

  const boardQuery = useQuery({
    queryKey: ["schools", "boarding", "board", hostelId],
    queryFn: () =>
      fetchJson<OccupancyBoard>(`/api/v2/schools/boarding/hostels/${hostelId}/occupancy`),
    enabled: open && Boolean(hostelId),
  });

  const freeBeds = useMemo(
    () =>
      (boardQuery.data?.beds ?? [])
        .filter((bed) => !bed.student)
        .map((bed) => ({
          value: bed.id,
          label: `Room ${bed.room.code} · bed ${bed.code}`,
        })),
    [boardQuery.data],
  );

  const save = useMutation({
    mutationFn: () =>
      fetchJson("/api/v2/schools/boarding/allocations", {
        method: "POST",
        body: JSON.stringify({
          studentId,
          hostelId,
          bedId: bedId || null,
          roomId:
            (boardQuery.data?.beds ?? []).find((bed) => bed.id === bedId)?.room.id ?? null,
          termId: effectiveTermId,
          ...(startDate ? { startDate: new Date(startDate).toISOString() } : {}),
        }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schools", "boarding"] });
      onClose();
    },
    onError: (cause) => setError(getApiErrorMessage(cause)),
  });

  return (
    <RecordDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Allocate a bed"
      description="Which child, which house, which bed, and from when."
      size="md"
      errors={error ? [error] : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (!save.isPending) save.mutate();
      }}
      footer={
        <DialogFooter
          onCancel={onClose}
          saving={save.isPending}
          saveLabel="Give them the bed"
        />
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <FilterSelect
            label="Child"
            allLabel="Choose a child"
            className="space-y-2"
            value={studentId}
            options={(studentsQuery.data?.data ?? []).map((student) => ({
              value: student.id,
              label: personLabel(student),
            }))}
            onChange={setStudentId}
          />
          <p className="text-sm text-muted-foreground">
            Surname first, then the admission number — Mutasa, Tanaka · CHS-1219.
          </p>
        </div>
        <FilterSelect
          label="Hostel"
          allLabel="Choose a house"
          className="space-y-2"
          value={hostelId}
          options={hostels
            .filter((hostel) => hostel.isActive)
            .map((hostel) => ({ value: hostel.id, label: hostel.name }))}
          onChange={(value) => {
            setHostelId(value);
            setBedId("");
          }}
        />
        <FilterSelect
          label="Bed"
          allLabel={
            !hostelId
              ? "Choose a house first"
              : boardQuery.isLoading
                ? "Reading the board…"
                : freeBeds.length === 0
                  ? "No bed is free in this house"
                  : "Choose a free bed"
          }
          className="space-y-2"
          value={bedId}
          options={freeBeds}
          onChange={setBedId}
        />
        <FilterSelect
          label="Term"
          allLabel="Choose a term"
          className="space-y-2"
          value={effectiveTermId}
          options={(termsQuery.data?.data ?? []).map((term) => ({
            value: term.id,
            label: term.name,
          }))}
          onChange={setTermId}
        />
        <div className="space-y-2">
          <Label htmlFor="allocation-start">From</Label>
          <Input
            id="allocation-start"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            Left blank, they move in today.
          </p>
        </div>
      </div>
    </RecordDialog>
  );
}

/**
 * Correcting an allocation that already exists.
 *
 * Which bed a child is in is not editable here — moving them has to survive the
 * gender and capacity checks, so it goes back through "Allocate a bed". What is
 * editable is the story: when it started, when it ended, and why.
 */
export function AllocationDialog({
  open,
  allocation,
  onClose,
}: {
  open: boolean;
  allocation: BoardingAllocation | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AllocationStatus>("ACTIVE");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useOpenTransition(open, () => {
    if (!allocation) return;
    setError(null);
    setStatus(allocation.status);
    setStartDate(toDateInput(allocation.startDate));
    setEndDate(toDateInput(allocation.endDate));
    setReason(allocation.reason ?? "");
  });

  const save = useMutation({
    mutationFn: () => {
      if (!allocation) throw new Error("Nothing being edited");
      return fetchJson(`/api/v2/schools/boarding/allocations/${allocation.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          ...(startDate ? { startDate: new Date(startDate).toISOString() } : {}),
          endDate: endDate ? new Date(endDate).toISOString() : null,
          reason: reason.trim() || null,
        }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schools", "boarding"] });
      onClose();
    },
    onError: (cause) => setError(getApiErrorMessage(cause)),
  });

  return (
    <RecordDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={
        allocation
          ? `${allocation.student.lastName}, ${allocation.student.firstName}`
          : "Allocation"
      }
      description={
        allocation
          ? `${allocation.hostel.name} · room ${allocation.room?.code ?? "—"} · bed ${allocation.bed?.code ?? "—"}`
          : undefined
      }
      size="md"
      errors={error ? [error] : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (!save.isPending) save.mutate();
      }}
      footer={
        <DialogFooter onCancel={onClose} saving={save.isPending} saveLabel="Save" />
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FilterSelect
          label="Status"
          allLabel="Active"
          className="space-y-2"
          value={status === "ACTIVE" ? "" : status}
          options={ALLOCATION_STATUSES.filter((row) => row.value !== "ACTIVE")}
          onChange={(value) => setStatus((value || "ACTIVE") as AllocationStatus)}
        />
        <div className="space-y-2">
          <Label htmlFor="allocation-edit-start">Moved in</Label>
          <Input
            id="allocation-edit-start"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="allocation-edit-end">Moved out</Label>
          <Input
            id="allocation-edit-end"
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            Setting the status to Ended frees the bed and stamps today if this is blank.
          </p>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="allocation-edit-reason">Why</Label>
          <Textarea
            id="allocation-edit-reason"
            rows={2}
            value={reason}
            placeholder="Moved to Nyanga House after the partition went up"
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
      </div>
    </RecordDialog>
  );
}

/* ── leave and outings ───────────────────────────────────────────────── */

type LeaveDraft = {
  studentId: string;
  requestType: "LEAVE" | "OUTING";
  startDateTime: string;
  endDateTime: string;
  destination: string;
  guardianContact: string;
  reason: string;
};

const EMPTY_LEAVE: LeaveDraft = {
  studentId: "",
  requestType: "LEAVE",
  startDateTime: "",
  endDateTime: "",
  destination: "",
  guardianContact: "",
  reason: "",
};

export function LeaveRequestDialog({
  open,
  leaveRequest,
  onClose,
}: {
  open: boolean;
  leaveRequest: LeaveRequest | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<LeaveDraft>(EMPTY_LEAVE);
  const [error, setError] = useState<string | null>(null);

  useOpenTransition(open, () => {
    setError(null);
    setDraft(
      leaveRequest
        ? {
            studentId: leaveRequest.student.id,
            requestType: leaveRequest.requestType,
            startDateTime: toLocalInput(leaveRequest.startDateTime),
            endDateTime: toLocalInput(leaveRequest.endDateTime),
            destination: leaveRequest.destination,
            guardianContact: leaveRequest.guardianContact,
            reason: leaveRequest.reason ?? "",
          }
        : EMPTY_LEAVE,
    );
  });

  // Only boarders may go on leave — the API says so, and offering the whole
  // roll would be offering a refusal.
  const boardersQuery = useQuery({
    queryKey: ["schools", "boarding", "boarders"],
    queryFn: () =>
      fetchSchoolsStudents({ page: 1, limit: 300, status: "ACTIVE", isBoarding: true }),
    enabled: open && !leaveRequest,
  });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        requestType: draft.requestType,
        startDateTime: toInstant(draft.startDateTime),
        endDateTime: toInstant(draft.endDateTime),
        destination: draft.destination.trim(),
        guardianContact: draft.guardianContact.trim(),
        reason: draft.reason.trim() || null,
      };
      return leaveRequest
        ? fetchJson(`/api/v2/schools/boarding/leave-requests/${leaveRequest.id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          })
        : fetchJson("/api/v2/schools/boarding/leave-requests", {
            method: "POST",
            body: JSON.stringify({ ...body, studentId: draft.studentId }),
          });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schools", "boarding"] });
      onClose();
    },
    onError: (cause) => setError(getApiErrorMessage(cause)),
  });

  return (
    <RecordDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={
        leaveRequest
          ? `${leaveRequest.student.lastName}, ${leaveRequest.student.firstName}`
          : "Record a leave request"
      }
      description="Where the child is going, when they are back, and who to ring."
      size="md"
      errors={error ? [error] : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (!save.isPending) save.mutate();
      }}
      footer={
        <DialogFooter
          onCancel={onClose}
          saving={save.isPending}
          saveLabel={leaveRequest ? "Save" : "Record it"}
        />
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {leaveRequest ? null : (
          <FilterSelect
            label="Child"
            allLabel="Choose a boarder"
            className="space-y-2 sm:col-span-2"
            value={draft.studentId}
            options={(boardersQuery.data?.data ?? []).map((student) => ({
              value: student.id,
              label: personLabel(student),
            }))}
            onChange={(value) =>
              setDraft((current) => ({ ...current, studentId: value }))
            }
          />
        )}
        <FilterSelect
          label="Kind"
          allLabel="Leave"
          className="space-y-2"
          value={draft.requestType === "LEAVE" ? "" : "OUTING"}
          options={[{ value: "OUTING", label: "Outing" }]}
          onChange={(value) =>
            setDraft((current) => ({
              ...current,
              requestType: value === "OUTING" ? "OUTING" : "LEAVE",
            }))
          }
        />
        <div className="space-y-2">
          <Label htmlFor="leave-destination">Going to</Label>
          <Input
            id="leave-destination"
            required
            value={draft.destination}
            placeholder="Home — 14 Fife Avenue, Harare"
            onChange={(event) =>
              setDraft((current) => ({ ...current, destination: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="leave-from">Leaves</Label>
          <Input
            id="leave-from"
            type="datetime-local"
            required
            value={draft.startDateTime}
            onChange={(event) =>
              setDraft((current) => ({ ...current, startDateTime: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="leave-to">Back</Label>
          <Input
            id="leave-to"
            type="datetime-local"
            required
            value={draft.endDateTime}
            onChange={(event) =>
              setDraft((current) => ({ ...current, endDateTime: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="leave-contact">Who to ring</Label>
          <Input
            id="leave-contact"
            required
            value={draft.guardianContact}
            placeholder="R. Chirwa (mother) — 0772 000 000"
            onChange={(event) =>
              setDraft((current) => ({ ...current, guardianContact: event.target.value }))
            }
          />
          <p className="text-sm text-muted-foreground">
            A number somebody will answer at nine on a Sunday night.
          </p>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="leave-reason">Why</Label>
          <Textarea
            id="leave-reason"
            rows={2}
            value={draft.reason}
            onChange={(event) =>
              setDraft((current) => ({ ...current, reason: event.target.value }))
            }
          />
        </div>
      </div>
    </RecordDialog>
  );
}
