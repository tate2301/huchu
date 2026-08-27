import { fetchJson } from "@/lib/api-client";

/**
 * Client-side calls for result sheets, moderation and publishing.
 *
 * The five workflow endpoints — submit, approve, send back, publish, unpublish
 * — were written, permission-gated and tested, and then never called from
 * anywhere. `HOD_APPROVED` was a state no human being could reach through the
 * interface, because nothing in the app posted to `/hod-approve`. These are the
 * calls the moderation queue and the publishing screen make.
 *
 * NOTE, as everywhere in the schools client layer: `successResponse` does not
 * wrap its payload, so these return the body directly and never read `.data`
 * off it — except the list routes, which return `{ data, pagination }` because
 * that is what `paginationResponse` builds.
 */

export type ResultSheetStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "HOD_APPROVED"
  | "HOD_REJECTED"
  | "PUBLISHED";

/**
 * The part of a sheet every results screen needs, and the only part the
 * dashboard endpoint and the sheets endpoint agree on — `/api/v2/schools/results`
 * returns the scope as nested records and no foreign-key scalars, while
 * `/api/v2/schools/results/sheets` returns both. Everything shared — the verbs,
 * the badges, the forms — is written against this, so a row from either list
 * behaves the same.
 */
export type ResultSheetLike = {
  id: string;
  title: string;
  status: ResultSheetStatus;
  term: { id: string; name: string };
  class: { id: string; name: string };
  stream: { id: string; name: string } | null;
  submittedAt: string | null;
  hodApprovedAt: string | null;
  publishedAt: string | null;
  updatedAt: string;
  _count: { lines: number };
  /** Only the dashboard endpoint works these out. */
  stats?: { averageScore: number | null; linesCount: number };
};

export type ResultSheetRecord = ResultSheetLike & {
  termId: string;
  classId: string;
  streamId: string | null;
  createdAt: string;
};

export type ResultSheetLine = {
  id: string;
  studentId: string;
  subjectCode: string;
  score: number;
  grade: string | null;
  remarks: string | null;
  student: {
    id: string;
    studentNo: string;
    firstName: string;
    lastName: string;
  };
};

export type ResultModerationAction = {
  id: string;
  actionType: "SUBMIT" | "REQUEST_CHANGES" | "HOD_APPROVE" | "PUBLISH" | "UNPUBLISH";
  fromStatus: ResultSheetStatus;
  toStatus: ResultSheetStatus;
  comment: string | null;
  actedAt: string;
  actor: { id: string; name: string | null };
};

export type ResultSheetDetail = ResultSheetRecord & {
  lines: ResultSheetLine[];
  moderationActions: ResultModerationAction[];
};

export type PublishWindowStatus = "SCHEDULED" | "OPEN" | "CLOSED";

export type PublishWindowRecord = {
  id: string;
  status: PublishWindowStatus;
  openAt: string;
  closeAt: string;
  notes: string | null;
  term: { id: string; name: string };
  class: { id: string; name: string } | null;
  stream: { id: string; name: string } | null;
};

type Paginated<T> = {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasMore: boolean;
  };
};

function query(params: Record<string, string | number | boolean | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

/* ── the sheets themselves ───────────────────────────────────────────── */

/**
 * Every sheet the signed-in person may see. The route narrows this to a
 * teacher's own class/subject assignments for anybody who is not privileged,
 * which is why the working list uses it and the school-wide overview uses
 * `/api/v2/schools/results` instead.
 */
export async function fetchResultSheets(
  params: {
    page?: number;
    limit?: number;
    search?: string;
    termId?: string;
    classId?: string;
    streamId?: string;
    status?: ResultSheetStatus;
  } = {},
) {
  return fetchJson<Paginated<ResultSheetRecord>>(
    `/api/v2/schools/results/sheets${query(params)}`,
  );
}

export async function fetchResultSheet(id: string) {
  return fetchJson<ResultSheetDetail>(`/api/v2/schools/results/sheets/${id}`);
}

export async function createResultSheet(input: {
  termId: string;
  classId: string;
  streamId?: string | null;
  title: string;
}) {
  return fetchJson<ResultSheetRecord>("/api/v2/schools/results/sheets", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateResultSheet(
  id: string,
  input: {
    title?: string;
    termId?: string;
    classId?: string;
    streamId?: string | null;
  },
) {
  return fetchJson<ResultSheetRecord>(`/api/v2/schools/results/sheets/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteResultSheet(id: string) {
  return fetchJson<{ id: string }>(`/api/v2/schools/results/sheets/${id}`, {
    method: "DELETE",
  });
}

/* ── the workflow ────────────────────────────────────────────────────── */

export async function submitResultSheet(id: string) {
  return fetchJson<ResultSheetRecord>(
    `/api/v2/schools/results/sheets/${id}/submit`,
    { method: "POST" },
  );
}

export async function approveResultSheet(id: string) {
  return fetchJson<ResultSheetRecord>(
    `/api/v2/schools/results/sheets/${id}/hod-approve`,
    { method: "POST" },
  );
}

/** Sending a sheet back captures why: the endpoint requires a `note`. */
export async function sendResultSheetBack(id: string, note: string) {
  return fetchJson<{ sheet: ResultSheetRecord; note: string }>(
    `/api/v2/schools/results/sheets/${id}/hod-request-changes`,
    { method: "POST", body: JSON.stringify({ note }) },
  );
}

export async function publishResultSheet(id: string) {
  return fetchJson<ResultSheetRecord>(
    `/api/v2/schools/results/sheets/${id}/publish`,
    { method: "POST" },
  );
}

/** Pulling a sheet back captures why: the endpoint requires a `reason`. */
export async function unpublishResultSheet(id: string, reason: string) {
  return fetchJson<ResultSheetRecord>(
    `/api/v2/schools/results/sheets/${id}/unpublish`,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
}

/* ── publish windows ─────────────────────────────────────────────────── */

export async function fetchPublishWindows(
  params: {
    page?: number;
    limit?: number;
    termId?: string;
    classId?: string;
    streamId?: string;
    status?: PublishWindowStatus;
  } = {},
) {
  return fetchJson<Paginated<PublishWindowRecord>>(
    `/api/v2/schools/results/publish/windows${query(params)}`,
  );
}

export async function createPublishWindow(input: {
  termId: string;
  classId?: string | null;
  streamId?: string | null;
  openAt: string;
  closeAt: string;
  status?: PublishWindowStatus;
  notes?: string | null;
}) {
  return fetchJson<PublishWindowRecord>("/api/v2/schools/results/publish/windows", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updatePublishWindow(
  id: string,
  input: {
    status?: PublishWindowStatus;
    openAt?: string;
    closeAt?: string;
    notes?: string | null;
    classId?: string | null;
    streamId?: string | null;
  },
) {
  return fetchJson<PublishWindowRecord>(
    `/api/v2/schools/results/publish/windows/${id}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export async function deletePublishWindow(id: string) {
  return fetchJson<{ id: string }>(
    `/api/v2/schools/results/publish/windows/${id}`,
    { method: "DELETE" },
  );
}
