import { fetchJson } from "@/lib/api-client";

/**
 * The roll, from the browser's side.
 *
 * `lib/schools/admin-v2.ts` already fetches students, but its record type was
 * cut for a picker: no guardians, no portal account, no fee or attendance
 * standing, and no way to write anything back. The roll screens need all four,
 * and a pupil has to be creatable, editable and archivable from the UI. Rather
 * than widen a type six other modules read, the students area gets its own
 * door — the same shape `lib/schools/admissions-v2.ts` takes for admissions.
 *
 * As everywhere in this module, `successResponse` does not wrap: these read the
 * body directly rather than reaching for `.data.data`.
 */

/** What the Fees column says. Mirrors the union the list route returns. */
export type FeeStanding = "PAID" | "PARTIAL" | "OVERDUE" | "WAIVER" | "DUE" | "NOT_BILLED";

export type StudentStanding = {
  fees: FeeStanding;
  attendanceRate: number | null;
  attendanceMarked: number;
  attendanceAbsent: number;
};

export type StudentGuardianLink = {
  id: string;
  relationship: string;
  isPrimary: boolean;
  guardian: {
    id: string;
    guardianNo: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string | null;
  };
};

export type StudentRollRecord = {
  id: string;
  studentNo: string;
  admissionNo: string | null;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  gender: string | null;
  status: string;
  isBoarding: boolean;
  admissionDate: string | null;
  /** Set once the child has claimed a portal invitation. */
  userId: string | null;
  customFields: Record<string, unknown> | null;
  currentClass: { id: string; code: string; name: string } | null;
  currentStream: { id: string; code: string; name: string; classId: string } | null;
  guardianLinks: StudentGuardianLink[];
  _count: {
    guardianLinks: number;
    enrollments: number;
    boardingAllocations: number;
    resultLines: number;
  };
};

export type StudentRollPage = {
  data: StudentRollRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasMore: boolean;
  };
  /** Present only when `withSummary` was asked for. Keyed by student id. */
  summary?: Record<string, StudentStanding>;
};

export type StudentGuardianLinkInput = {
  guardianId: string;
  relationship: string;
  isPrimary?: boolean;
};

/**
 * Everything the create form can send.
 *
 * Field-for-field the zod schema in `app/api/v2/schools/students/route.ts`, so
 * a field the server will refuse cannot be typed into the form in the first
 * place. `studentNo` is optional because the server reserves one when it is
 * left blank, which is what stops two desks writing CHS-1180 at the same time.
 */
export type StudentCreateInput = {
  firstName: string;
  lastName: string;
  studentNo?: string;
  admissionNo?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  status?: string;
  currentClassId?: string | null;
  currentStreamId?: string | null;
  isBoarding?: boolean;
  admissionDate?: string | null;
  guardianLinks?: StudentGuardianLinkInput[];
  customFields?: Record<string, unknown>;
};

/**
 * The PATCH shape. Every key optional: only what changed is sent.
 *
 * `Partial<>` rather than intersecting the create shape with optional names —
 * an intersection cannot relax a required property, so `Omit<…> & { firstName?:
 * string }` still demanded a first name and made `updateStudent(id, { status:
 * "WITHDRAWN" })` a type error while reading as though it were allowed.
 */
export type StudentUpdateInput = Partial<Omit<StudentCreateInput, "guardianLinks">> & {
  /** Custom fields to remove outright, as opposed to setting them empty. */
  clearCustomFields?: string[];
};

function query(params: Record<string, string | number | boolean | undefined | null>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

export function fetchStudentRoll(
  params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    classId?: string;
    streamId?: string;
    isBoarding?: boolean;
    hasPortalAccount?: boolean;
    withSummary?: boolean;
  } = {},
) {
  return fetchJson<StudentRollPage>(`/api/v2/schools/students${query(params)}`);
}

export function createStudent(input: StudentCreateInput) {
  return fetchJson<StudentRollRecord>("/api/v2/schools/students", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateStudent(id: string, input: StudentUpdateInput) {
  return fetchJson<StudentRollRecord>(`/api/v2/schools/students/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/**
 * Taking a pupil off the roll.
 *
 * DELETE refuses while anything hangs off the child — an invoice, a register
 * line, a mark — which is nearly always, and rightly: a school does not erase
 * a pupil who was here. So the verb people reach for is WITHDRAWN, and the
 * hard delete is only for a record created by mistake this morning.
 */
export function withdrawStudent(id: string) {
  return updateStudent(id, { status: "WITHDRAWN" });
}

export function deleteStudent(id: string) {
  return fetchJson<{ id: string; deleted: boolean }>(`/api/v2/schools/students/${id}`, {
    method: "DELETE",
  });
}

/* ── the portal ──────────────────────────────────────────────────────── */

export type PortalInviteRecord = {
  id: string;
  subject: "STUDENT" | "GUARDIAN";
  sentTo: string;
  expiresAt: string;
  claimedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  student: { id: string; studentNo: string; firstName: string; lastName: string } | null;
  guardian: { id: string; guardianNo: string; firstName: string; lastName: string } | null;
};

export function fetchPortalInvites(
  params: { subject?: "STUDENT" | "GUARDIAN"; status?: "outstanding" | "claimed" | "revoked" } = {},
) {
  return fetchJson<{ data: PortalInviteRecord[] }>(
    `/api/v2/schools/portal-invites${query({ ...params, limit: 200 })}`,
  );
}

/**
 * One invitation. The endpoint takes a batch because a school opening the
 * portal invites hundreds at once; from a record page the batch is of one.
 */
export function issuePortalInvite(input: {
  subject: "STUDENT" | "GUARDIAN";
  subjectId: string;
  sentTo: string;
}) {
  return fetchJson<{ issued: unknown[]; failed: unknown[] }>(
    "/api/v2/schools/portal-invites",
    { method: "POST", body: JSON.stringify({ invites: [input] }) },
  );
}

export function revokePortalInvite(id: string) {
  return fetchJson<{ id: string; revokedAt: string }>(
    `/api/v2/schools/portal-invites/${id}/revoke`,
    { method: "POST" },
  );
}
