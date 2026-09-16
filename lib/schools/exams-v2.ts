import { fetchJson } from "@/lib/api-client";

/**
 * Public exams, from the browser's side.
 *
 * The five exam screens read through here. The money arrives as strings —
 * `Decimal` crosses JSON as a string and this module keeps it that way rather
 * than parsing it into a float that cannot hold `$17,332.00` exactly.
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

export type ExamLevel = "O_LEVEL" | "A_LEVEL" | "IGCSE";

export const EXAM_LEVEL_LABELS: Record<ExamLevel, string> = {
  O_LEVEL: "Ordinary Level",
  A_LEVEL: "Advanced Level",
  IGCSE: "IGCSE",
};

export const SERIES_STATUS_LABELS: Record<string, string> = {
  PLANNED: "Planned",
  ENTRIES_OPEN: "Open for entries",
  ENTRIES_CLOSED: "Entries closed",
  SAT: "Sat",
  RESULTS_IN: "Results in",
  ARCHIVED: "Archived",
};

export type SeriesRow = {
  id: string;
  name: string;
  year: number;
  level: ExamLevel;
  status: string;
  board: { id: string; code: string; name: string };
  centre: { id: string; number: string } | null;
  entriesCloseAt: string | null;
  lateEntriesCloseAt: string | null;
  candidates: number;
  entries: number;
  invoiced: string;
  collected: string;
  settled: boolean;
};

export type SeriesIndex = {
  rows: SeriesRow[];
  chips: {
    nearestDeadline: { seriesId: string; boardName: string; days: number } | null;
    candidates: number;
    entryFeesUnpaid: string;
  };
  counts: { all: number; open: number; resultsIn: number };
};

export function fetchSeriesIndex(
  params: {
    boardId?: string;
    level?: ExamLevel;
    status?: "open" | "results" | "all";
    search?: string;
  } = {},
) {
  return fetchJson<SeriesIndex>(`/api/v2/schools/exams/series${query(params)}`);
}

export type SeriesDetail = {
  series: {
    id: string;
    name: string;
    year: number;
    level: ExamLevel;
    status: string;
    cohortLevel: number | null;
    entriesOpenAt: string | null;
    entriesCloseAt: string | null;
    lateEntriesCloseAt: string | null;
    startsOn: string | null;
    endsOn: string | null;
    resultsDueOn: string | null;
    feePerSubject: string | null;
    lateFeePerSubject: string | null;
    currency: string;
    board: { id: string; code: string; name: string };
    centre: { id: string; number: string } | null;
  };
  deadlines: Array<{
    deadline: string;
    date: string | null;
    days: number | null;
    follows: string;
  }>;
  tallies: {
    candidates: number;
    readyToRegister: number;
    cannotBeRegistered: number;
    entryFeesUnpaid: string;
    daysLeft: number | null;
  };
  lastEntryFile: {
    id: string;
    builtAt: string;
    entryCount: number;
    candidateCount: number;
  } | null;
};

export function fetchSeries(seriesId: string) {
  return fetchJson<SeriesDetail>(`/api/v2/schools/exams/series/${seriesId}`);
}

export function createSeries(input: {
  boardId: string;
  centreId?: string | null;
  name: string;
  year: number;
  level: ExamLevel;
  cohortLevel?: number | null;
  entriesOpenAt?: string | null;
  entriesCloseAt?: string | null;
  lateEntriesCloseAt?: string | null;
  startsOn?: string | null;
  endsOn?: string | null;
  resultsDueOn?: string | null;
  feePerSubject?: number | null;
  lateFeePerSubject?: number | null;
  currency?: string;
}) {
  return fetchJson<{ id: string; name: string }>("/api/v2/schools/exams/series", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type Blocker = string;

export type CandidateRow = {
  id: string;
  candidateNumber: string | null;
  certifiedName: string | null;
  status: string;
  student: {
    id: string;
    studentNo: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string | null;
    gender: string | null;
    nationalId: string | null;
    birthCertificateNo: string | null;
    className: string | null;
    streamName: string | null;
  };
  subjects: number;
  fees: { total: string; invoiced: boolean; paid: boolean };
  blockers: Blocker[];
};

export type CandidateRollPage = {
  rows: CandidateRow[];
  tallies: SeriesDetail["tallies"];
  blockers: Array<{ blocker: string; candidates: string[]; count: number }>;
};

export function fetchCandidates(
  seriesId: string,
  params: {
    classId?: string;
    status?: "all" | "ready" | "blocked" | "registered";
    search?: string;
  } = {},
) {
  return fetchJson<CandidateRollPage>(
    `/api/v2/schools/exams/series/${seriesId}/candidates${query(params)}`,
  );
}

export function registerCohort(seriesId: string, input: { classId?: string | null; level?: number | null } = {}) {
  return fetchJson<{ registered: number; skipped: number }>(
    `/api/v2/schools/exams/series/${seriesId}/candidates`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function correctCandidate(
  seriesId: string,
  input: {
    candidateId: string;
    candidateNumber?: string | null;
    certifiedName?: string | null;
    student?: {
      nationalId?: string | null;
      birthCertificateNo?: string | null;
      certifiedName?: string | null;
      dateOfBirth?: string | null;
      gender?: string | null;
    };
  },
) {
  return fetchJson<{ id: string }>(
    `/api/v2/schools/exams/series/${seriesId}/candidates`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export type SubjectEntryRow = {
  examSubjectId: string;
  subject: string;
  code: string;
  entries: number;
  totalFee: string;
  invoiced: string;
  paid: string;
  toInvoice: string;
};

export type EntriesPage = {
  bySubject: SubjectEntryRow[];
  byCandidate: CandidateRow[];
  rule: { minimum: number; maximum: number; below: CandidateRow[]; over: CandidateRow[] };
  totals: {
    entries: number;
    totalFee: string;
    invoiced: string;
    paid: string;
    toInvoice: string;
  };
};

export function fetchEntries(seriesId: string) {
  return fetchJson<EntriesPage>(`/api/v2/schools/exams/series/${seriesId}/entries`);
}

export function enterSubject(seriesId: string, input: { candidateId: string; examSubjectId: string }) {
  return fetchJson<{ id: string; isLate: boolean }>(
    `/api/v2/schools/exams/series/${seriesId}/entries`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function invoiceEntries(seriesId: string) {
  return fetchJson<{ invoices: number; entries: number }>(
    `/api/v2/schools/exams/series/${seriesId}/entries`,
    { method: "POST", body: JSON.stringify({ invoice: true }) },
  );
}

/** Builds the file. A human uploads it — S-13.3 is deferred. */
export function buildEntryFile(seriesId: string) {
  return fetchJson<{
    run: { id: string; builtAt: string };
    csv: string;
    entries: number;
    candidates: number;
  }>(`/api/v2/schools/exams/series/${seriesId}/entries`, {
    method: "POST",
    body: JSON.stringify({ buildEntryFile: true }),
  });
}

export type SeatingPlan = {
  session: {
    id: string;
    startsAt: string;
    endsAt: string | null;
    label: string | null;
    paperCode: string | null;
    subject: string | null;
    durationMinutes: number | null;
    series: { id: string; name: string; level: ExamLevel };
  };
  rooms: Array<{
    id: string;
    name: string;
    code: string;
    purpose: string | null;
    capacity: number | null;
    seats: number;
    invigilator: string | null;
  }>;
  seats: Array<{
    id: string;
    seatNumber: string | null;
    allocationId: string;
    candidate: { id: string; candidateNumber: string | null; name: string };
  }>;
  stillToSeat: Array<{ id: string; candidateNumber: string | null; name: string }>;
  arrangements: Array<{
    id: string;
    kind: string;
    extraTimePercent: number | null;
    detail: string | null;
    approved: boolean;
    candidate: { id: string; candidateNumber: string | null; name: string };
  }>;
  chips: { candidates: number; seated: number; stillToSeat: number; sittingTwoAtOnce: number };
  clashes: Array<{
    id: string;
    startsAt: string;
    paperCode: string | null;
    subject: string | null;
    candidates: number;
  }>;
};

export type SeatingPage = {
  sessions: Array<{
    id: string;
    startsAt: string;
    endsAt: string | null;
    label: string | null;
    paper: { code: string; examSubject: { name: string } } | null;
  }>;
  plan: SeatingPlan | null;
};

export function fetchSeating(seriesId: string, sessionId?: string) {
  return fetchJson<SeatingPage>(
    `/api/v2/schools/exams/series/${seriesId}/seating${query({ sessionId })}`,
  );
}

export function assignSeats(seriesId: string, sessionId: string, candidateIds?: string[]) {
  return fetchJson<{ seated: number; short: number; message: string | null }>(
    `/api/v2/schools/exams/series/${seriesId}/seating`,
    { method: "POST", body: JSON.stringify({ sessionId, assign: true, candidateIds }) },
  );
}

export function allocateRoom(
  seriesId: string,
  input: {
    sessionId: string;
    roomId: string;
    purpose?: string | null;
    capacity?: number | null;
    invigilatorTeacherProfileId?: string | null;
    invigilatorName?: string | null;
  },
) {
  return fetchJson<{ id: string }>(`/api/v2/schools/exams/series/${seriesId}/seating`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type ResultsPage = {
  series: { id: string; name: string; level: ExamLevel; board: { name: string } };
  candidates: number;
  subjects: Array<{
    subject: string;
    code: string;
    sat: number;
    passes: number;
    passRate: number;
    bands: Record<string, number>;
    against: number | null;
  }>;
  stats: { candidates: number; fiveOrMoreAtC: number; aStarAndA: number; ungraded: number };
  subjectsThatFell: number;
  amended: number;
  statementReceived: boolean;
  byCandidate: Array<{
    candidateId: string;
    candidateNumber: string | null;
    name: string;
    studentId: string;
    passes: number;
    aStarOrA: number;
    ungraded: number;
    grades: Array<{
      subject: string;
      code: string;
      grade: string;
      points: number | null;
      isRemark: boolean;
    }>;
  }>;
};

export function fetchResults(seriesId: string, compareSeriesId?: string) {
  return fetchJson<ResultsPage>(
    `/api/v2/schools/exams/series/${seriesId}/results${query({ compareSeriesId })}`,
  );
}

export function captureResults(
  seriesId: string,
  rows: Array<{
    candidateId: string;
    examSubjectId: string;
    grade: string;
    points?: number | null;
    isRemark?: boolean;
  }>,
) {
  return fetchJson<{ captured: number }>(
    `/api/v2/schools/exams/series/${seriesId}/results`,
    { method: "POST", body: JSON.stringify({ rows }) },
  );
}

export type ExamReference = {
  boards: Array<{ id: string; code: string; name: string }>;
  centres: Array<{ id: string; number: string; boardId: string }>;
  subjects: Array<{ id: string; code: string; name: string; level: ExamLevel; boardId: string }>;
};

export function fetchExamReference() {
  return fetchJson<ExamReference>("/api/v2/schools/exams/reference");
}

export type TimetablePaper = {
  id: string;
  paperNumber: number;
  code: string;
  sitsAt: string | null;
  durationMinutes: number | null;
  subject: { id: string; code: string; name: string };
  session: { id: string; startsAt: string; endsAt: string | null; seated: number } | null;
};

export function fetchTimetable(seriesId: string) {
  return fetchJson<{ papers: TimetablePaper[] }>(
    `/api/v2/schools/exams/series/${seriesId}/timetable`,
  );
}

export function addTimetablePaper(
  seriesId: string,
  input: {
    examSubjectId: string;
    paperNumber: number;
    code?: string | null;
    sitsAt: string;
    durationMinutes?: number | null;
  },
) {
  return fetchJson<{ paper: TimetablePaper }>(
    `/api/v2/schools/exams/series/${seriesId}/timetable`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function reschedulePaper(
  seriesId: string,
  input: { paperId: string; sitsAt: string; durationMinutes?: number | null },
) {
  return fetchJson<{ paperId: string }>(
    `/api/v2/schools/exams/series/${seriesId}/timetable`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export function removeTimetablePaper(seriesId: string, paperId: string) {
  return fetchJson<{ paperId: string }>(
    `/api/v2/schools/exams/series/${seriesId}/timetable${query({ paperId })}`,
    { method: "DELETE" },
  );
}
