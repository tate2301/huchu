import { fetchJson } from "@/lib/api-client";

/**
 * Conduct, from the browser's side.
 *
 * The five conduct screens read through here rather than reaching for `fetch`
 * in a component, which is the module's own convention — and it matters more
 * than usual for the pastoral half: the note shapes below are the only ones a
 * component ever sees, and the withheld one has three fields. A component that
 * assembled its own request could ask for a body; one that reads this cannot.
 *
 * As everywhere in this module, `successResponse` does not wrap: these read the
 * body directly rather than reaching for `.data.data`.
 */

function query(params: Record<string, string | number | boolean | undefined | null>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

export type ConductTone = "PLAIN" | "WARN" | "BAD";

export type ConductCategory = {
  id: string;
  code: string;
  name: string;
  tone: ConductTone;
  demeritPoints: number | null;
};

export type IncidentStudent = {
  id: string;
  studentNo: string;
  firstName: string;
  lastName: string;
  status: string;
  currentClass: { id: string; name: string; level: number | null } | null;
  currentStream: { id: string; name: string } | null;
};

export type IncidentRow = {
  id: string;
  reference: string;
  occurredAt: string;
  summary: string;
  location: string | null;
  period: number | null;
  sanction: string | null;
  sanctionTone: ConductTone;
  sanctionDecidedAt: string | null;
  homeToldAt: string | null;
  homeToldChannel: string | null;
  homeToldNeeded: boolean;
  reportedByUserId: string;
  reportedByName: string | null;
  reportedAt: string;
  seenAt: string | null;
  category: { id: string; code: string; name: string; tone: ConductTone };
  student: IncidentStudent;
};

export type ConductTallies = {
  thisTerm: number;
  noSanctionDecided: number;
  homeNotTold: number;
  threeOrMore: number;
};

export type ConductLogPage = {
  rows: IncidentRow[];
  tallies: ConductTallies;
  termId: string | null;
};

export type RepeatRow = {
  student: {
    id: string;
    studentNo: string;
    firstName: string;
    lastName: string;
    className: string | null;
    streamName: string | null;
  };
  count: number;
  whatTheyWere: string;
  last: string;
  tone: ConductTone;
};

export function fetchConductLog(
  params: {
    termId?: string;
    level?: number;
    categoryId?: string;
    sanction?: "decided" | "undecided";
    home?: "told" | "not-told" | "not-needed";
    studentId?: string;
    search?: string;
    limit?: number;
  } = {},
) {
  return fetchJson<ConductLogPage>(`/api/v2/schools/conduct/incidents${query(params)}`);
}

export function fetchConductRepeats(params: { termId?: string; minimum?: number } = {}) {
  return fetchJson<{ rows: RepeatRow[]; termId: string | null }>(
    `/api/v2/schools/conduct/repeats${query(params)}`,
  );
}

/**
 * Add a behaviour category the school will log against.
 *
 * Without at least one of these the module does not start: `logIncident`
 * requires a `categoryId`, the incident dialog's category picker is fed from
 * `fetchConductCategories`, and a school on its first morning has none. The
 * endpoint has always existed — `POST /api/v2/schools/conduct/categories`, on
 * the `configure` grant — and nothing in the product called it.
 */
export function createConductCategory(input: {
  code: string;
  name: string;
  tone?: ConductTone;
  demeritPoints?: number | null;
  sortOrder?: number;
}) {
  return fetchJson<{ id: string; code: string; name: string }>(
    "/api/v2/schools/conduct/categories",
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function fetchConductCategories() {
  return fetchJson<{ rows: ConductCategory[] }>("/api/v2/schools/conduct/categories");
}

export type LogIncidentInput = {
  studentId: string;
  categoryId: string;
  occurredAt: string;
  summary: string;
  location?: string | null;
  period?: number | null;
  sanction?: string | null;
  sanctionTone?: ConductTone;
  homeToldNeeded?: boolean;
  participants?: Array<{ studentId: string; sanction?: string | null }>;
};

export function logIncident(input: LogIncidentInput) {
  return fetchJson<{ id: string; reference: string }>("/api/v2/schools/conduct/incidents", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateIncident(id: string, input: Partial<LogIncidentInput>) {
  return fetchJson<{ id: string }>(`/api/v2/schools/conduct/incidents/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/** Records that a guardian was told. Not a message send. */
export function tellHome(incidentId: string, channel: string) {
  return fetchJson<{ id: string; homeToldAt: string; homeToldChannel: string }>(
    `/api/v2/schools/conduct/incidents/${incidentId}/home-told`,
    { method: "POST", body: JSON.stringify({ channel }) },
  );
}

export function markHomeNotNeeded(incidentId: string, reason?: string) {
  return fetchJson<{ id: string; homeToldNeeded: boolean }>(
    `/api/v2/schools/conduct/incidents/${incidentId}/home-told`,
    { method: "POST", body: JSON.stringify({ notNeeded: true, reason }) },
  );
}

export type IncidentDetail = {
  incident: {
    id: string;
    reference: string;
    occurredAt: string;
    summary: string;
    location: string | null;
    period: number | null;
    sanction: string | null;
    sanctionTone: ConductTone;
    sanctionDecidedAt: string | null;
    sanctionDecidedByUserId: string | null;
    homeToldAt: string | null;
    homeToldChannel: string | null;
    homeToldNeeded: boolean;
    homeToldByUserId: string | null;
    reportedAt: string;
    reportedByUserId: string;
    seenAt: string | null;
    seenByUserId: string | null;
    termId: string;
    category: { id: string; name: string; tone: ConductTone };
    student: {
      id: string;
      studentNo: string;
      firstName: string;
      lastName: string;
      currentClass: { id: string; name: string } | null;
      currentStream: { id: string; name: string } | null;
    };
    participants: Array<{
      id: string;
      sanction: string | null;
      student: { id: string; studentNo: string; firstName: string; lastName: string };
    }>;
    accounts: Array<{
      id: string;
      authorKind: "STAFF" | "STUDENT";
      authorUserId: string | null;
      takenAt: string;
      body: string;
      authorStudent: {
        id: string;
        firstName: string;
        lastName: string;
        currentClass: { name: string } | null;
        currentStream: { name: string } | null;
      } | null;
    }>;
  };
  homeTold:
    | { state: "told"; at: string; channel: string | null }
    | { state: "not-told" }
    | { state: "not-needed" };
  thisTerm: Array<{
    id: string;
    occurredAt: string;
    summary: string;
    sanction: string | null;
    sanctionTone: ConductTone;
    category: { name: string };
  }>;
  merits: number;
  detention: {
    owed: number;
    served: number;
    nextSession: {
      id: string;
      startsAt: string;
      roomName: string | null;
      supervisorName: string | null;
    } | null;
  };
  /** An integer. Nothing about the note, by design. */
  pastoralNoteCount: number;
  reportCard: { heading: string; body: string } | null;
  staffById: Record<string, { name: string; role: string | null }>;
};

export function fetchIncident(id: string) {
  return fetchJson<IncidentDetail>(`/api/v2/schools/conduct/incidents/${id}`);
}

export function addAccount(
  incidentId: string,
  input: {
    authorKind: "STAFF" | "STUDENT";
    authorStudentId?: string | null;
    body: string;
    markSeen?: boolean;
  },
) {
  return fetchJson<{ id: string }>(
    `/api/v2/schools/conduct/incidents/${incidentId}/accounts`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

/* ── merits ──────────────────────────────────────────────────────────── */

export type MeritKind = "MERIT" | "DEMERIT";

export type MeritReason = {
  id: string;
  code: string;
  name: string;
  kind: MeritKind;
  defaultPoints: number;
};

export type MeritPupilRow = {
  student: {
    id: string;
    studentNo: string;
    firstName: string;
    lastName: string;
    className: string | null;
    streamName: string | null;
  };
  merits: number;
  demerits: number;
  net: number;
  lastRecorded: { kind: MeritKind; reason: string; at: string; note: string | null } | null;
};

export type MeritTallies = {
  merits: number;
  demerits: number;
  net: number;
  pupilsWithNeither: number;
};

type ReasonTotals = {
  rows: Array<{ reason: string; times: number; points: number }>;
  shownTimes: number;
  totalTimes: number;
  shownPoints: number;
  totalPoints: number;
};

export type MeritSummary = {
  merit: ReasonTotals;
  demerit: ReasonTotals;
  byYearGroup: Array<{ level: number | null; label: string; net: number }>;
  /** Occasions, not points. */
  recordedThisTerm: number;
  termId: string | null;
};

export function fetchMeritLedger(
  params: {
    termId?: string;
    level?: number;
    classId?: string;
    streamId?: string;
    search?: string;
    sort?: "net-desc" | "net-asc" | "merits-desc" | "demerits-desc" | "name";
    limit?: number;
  } = {},
) {
  return fetchJson<{ rows: MeritPupilRow[]; tallies: MeritTallies; termId: string | null }>(
    `/api/v2/schools/conduct/merits${query(params)}`,
  );
}

export function fetchMeritSummary(params: { termId?: string } = {}) {
  return fetchJson<MeritSummary>(`/api/v2/schools/conduct/merits/summary${query(params)}`);
}

export function fetchMeritReasons(kind?: MeritKind) {
  return fetchJson<{ rows: MeritReason[] }>(
    `/api/v2/schools/conduct/merits/reasons${query({ kind })}`,
  );
}

/**
 * Add a reason a merit or a demerit can be given for.
 *
 * Same shape of gap as the categories: `awardMerit` requires a `reasonId`, the
 * award dialog is fed from `fetchMeritReasons`, and the POST that fills that
 * list had no caller anywhere.
 */
export function createMeritReason(input: {
  code: string;
  name: string;
  kind: MeritKind;
  defaultPoints?: number;
  sortOrder?: number;
}) {
  return fetchJson<{ id: string; name: string; kind: MeritKind }>(
    "/api/v2/schools/conduct/merits/reasons",
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function awardMerit(input: {
  studentId: string;
  reasonId: string;
  kind: MeritKind;
  points?: number;
  note?: string | null;
}) {
  return fetchJson<{ id: string }>("/api/v2/schools/conduct/merits", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** A stamp, not a delete — which is why the reason is required. */
export function reverseMerit(entryId: string, reason: string) {
  return fetchJson<{ id: string }>(`/api/v2/schools/conduct/merits/${entryId}`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

/* ── detention ───────────────────────────────────────────────────────── */

export type DetentionSession = {
  id: string;
  startsAt: string;
  endsAt: string;
  label: string | null;
  room: { id: string; code: string; name: string } | null;
  supervisor: { id: string; name: string | null; employeeCode: string } | null;
  named: number;
  movedAway: number;
  movedHere: number;
  needsSupervisor: boolean;
};

export type GetsHome =
  | { kind: "boarder"; label: "Boarder" }
  | { kind: "bus"; label: string; routeId: string; routeCode: string }
  | { kind: "day"; label: "Day" };

export type RegisterRow = {
  attendanceId: string;
  state: "NOT_MARKED" | "HERE" | "DID_NOT_TURN_UP" | "MOVED";
  markedAt: string | null;
  student: {
    id: string;
    studentNo: string;
    firstName: string;
    lastName: string;
    classId: string | null;
    className: string | null;
    streamId: string | null;
    streamName: string | null;
  };
  servingFor: string;
  session: { index: number; owed: number };
  getsHome: GetsHome;
  stillToServe: { sessions: number; nextAt: string | null };
  movedTo: { id: string; startsAt: string } | null;
};

export type SessionRegister = {
  session: DetentionSession;
  rows: RegisterRow[];
  chips: { dueHere: number; here: number; notMarked: number; movedAway: number };
  stillToServeAfterToday: { sessions: number; pupils: number };
  busConflict: {
    routeCode: string;
    students: Array<{ id: string; firstName: string; lastName: string }>;
  } | null;
  /** The reason the marking verbs are disabled, or null where they are not. */
  markDenial: string | null;
};

export function fetchDetentionSessions(
  params: { termId?: string; from?: string; to?: string; limit?: number } = {},
) {
  return fetchJson<{ rows: DetentionSession[]; termId: string | null }>(
    `/api/v2/schools/conduct/detention/sessions${query(params)}`,
  );
}

export function fetchDetentionRegister(sessionId: string) {
  return fetchJson<SessionRegister>(
    `/api/v2/schools/conduct/detention/sessions/${sessionId}/register`,
  );
}

export function markDetention(
  sessionId: string,
  input:
    | { attendanceId: string; state: "HERE" | "DID_NOT_TURN_UP" | "NOT_MARKED" }
    | { everyoneHere: true }
    | { attendanceId: string; moveToSessionId: string },
) {
  return fetchJson<unknown>(
    `/api/v2/schools/conduct/detention/sessions/${sessionId}/register`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function createDetentionSession(input: {
  startsAt: string;
  endsAt: string;
  roomId?: string | null;
  supervisorTeacherProfileId?: string | null;
  label?: string | null;
}) {
  return fetchJson<{ id: string }>("/api/v2/schools/conduct/detention/sessions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function awardDetention(input: {
  studentId: string;
  incidentId?: string | null;
  reason?: string | null;
  sessionsOwed: number;
  sessionIds: string[];
}) {
  return fetchJson<{ id: string }>("/api/v2/schools/conduct/detention/awards", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/* ── pastoral ────────────────────────────────────────────────────────── */

export type PastoralBand =
  | "PASTORAL_TEAM_ONLY"
  | "HEAD_AND_PASTORAL_TEAM"
  | "SAFEGUARDING_NAMED_INDIVIDUALS";

export const PASTORAL_BAND_LABELS: Record<PastoralBand, string> = {
  PASTORAL_TEAM_ONLY: "Pastoral team only",
  HEAD_AND_PASTORAL_TEAM: "Head and pastoral team",
  SAFEGUARDING_NAMED_INDIVIDUALS: "Safeguarding — named individuals",
};

export type ReadableNote = {
  readable: true;
  id: string;
  writtenAt: string;
  band: PastoralBand;
  body: string;
  reviewDueAt: string | null;
  referredTo: string | null;
  referredAt: string | null;
  closedAt: string | null;
  authorUserId: string;
  authorName: string | null;
  student: {
    id: string;
    studentNo: string;
    firstName: string;
    lastName: string;
    className: string | null;
    streamName: string | null;
  };
};

/**
 * Three fields. There is nothing behind the hatched bar to reveal, and this
 * type is the guarantee: a component cannot draw a pupil's name off a withheld
 * row because the row does not carry one.
 */
export type WithheldNote = {
  readable: false;
  id: string;
  writtenAt: string;
  band: PastoralBand;
};

export type ProjectedNote = ReadableNote | WithheldNote;

/**
 * A readable note as the LIST returns it: everything but what it says.
 *
 * `openNote` writes `schools.pastoral.note.read` every time a safeguarding body
 * is disclosed, on the principle the server module states outright — "a model
 * nobody can audit is a claim rather than a control". The listing used to carry
 * `body` and the table printed it, so every note a reader was cleared for was
 * disclosed on page load with no audit row, and the read that IS audited was
 * the one that had already happened.
 *
 * Typed without `body` rather than with an optional one, so a component that
 * wants it has to fetch the note through the path that records the fetch.
 */
export type ListedNote = Omit<ReadableNote, "body">;

export type ListedProjection = ListedNote | WithheldNote;

export type PastoralListing = {
  notes: ListedProjection[];
  counts: {
    youMayRead: number;
    withheldFromYou: number;
    reviewOverdue: number;
    referredOn: number;
  };
  /** False where this reader holds the grant and no clearance at all. */
  cleared: boolean;
};

export function fetchPastoralNotes(
  params: {
    level?: number;
    classId?: string;
    streamId?: string;
    band?: PastoralBand;
    review?: "overdue" | "due" | "none";
    studentId?: string;
    search?: string;
    limit?: number;
  } = {},
) {
  return fetchJson<PastoralListing>(
    `/api/v2/schools/conduct/pastoral/notes${query(params)}`,
  );
}

export function openPastoralNote(noteId: string) {
  return fetchJson<{ note: ReadableNote }>(
    `/api/v2/schools/conduct/pastoral/notes/${noteId}`,
  );
}

export function writePastoralNote(input: {
  studentId: string;
  body: string;
  band: PastoralBand;
  reviewDueAt?: string | null;
  referredTo?: string | null;
  namedReaderIds?: string[];
}) {
  return fetchJson<{ id: string }>("/api/v2/schools/conduct/pastoral/notes", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function askToSeeNote(noteId: string, reason?: string) {
  return fetchJson<{ id: string }>(
    `/api/v2/schools/conduct/pastoral/notes/${noteId}/access-request`,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
}

export type ReaderRow = {
  kind: "person";
  userId: string;
  name: string;
  role: string | null;
  mayRead: string;
  cleared: boolean;
  isYou: boolean;
};

export function fetchPastoralReaders() {
  return fetchJson<{ readers: ReaderRow[]; staffTotal: number; never: string[] }>(
    "/api/v2/schools/conduct/pastoral/readers",
  );
}

export function grantPastoralClearance(input: {
  userId: string;
  bands: PastoralBand[];
  scope: "SCHOOL" | "YEAR_GROUP" | "CLASS";
  scopeLevel?: number | null;
  scopeClassId?: string | null;
}) {
  return fetchJson<{ id: string }>("/api/v2/schools/conduct/pastoral/readers", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function revokePastoralClearance(userId: string) {
  return fetchJson<{ id: string }>("/api/v2/schools/conduct/pastoral/readers", {
    method: "POST",
    body: JSON.stringify({ userId, revoke: true }),
  });
}
