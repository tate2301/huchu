import { fetchJson } from "@/lib/api-client";

/** Leavers and alumni, from the browser's side. */

function query(params: Record<string, string | number | boolean | undefined | null>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

export type LeavingReason =
  | "COMPLETED_FORM_4"
  | "COMPLETED_UPPER_6"
  | "FEES"
  | "TRANSFERRED_TO_ANOTHER_SCHOOL"
  | "MOVED_ABROAD"
  | "EXPELLED"
  | "WITHDRAWN_BY_GUARDIAN"
  | "OTHER";

export const LEAVING_REASON_LABELS: Record<LeavingReason, string> = {
  COMPLETED_FORM_4: "Completed Form 4",
  COMPLETED_UPPER_6: "Completed Upper 6",
  FEES: "Fees",
  TRANSFERRED_TO_ANOTHER_SCHOOL: "Transferred to another school",
  MOVED_ABROAD: "Moved abroad",
  EXPELLED: "Expelled",
  WITHDRAWN_BY_GUARDIAN: "Withdrawn by guardian",
  OTHER: "Other",
};

export type ClearanceKind = "FEES" | "LIBRARY" | "BOARDING" | "PORTAL" | "RESULTS";

export const CLEARANCE_LABELS: Record<ClearanceKind, string> = {
  FEES: "Fees",
  LIBRARY: "Library",
  BOARDING: "Bed",
  PORTAL: "Portal",
  RESULTS: "Docs",
};

export const CLEARANCE_ORDER: ClearanceKind[] = [
  "FEES",
  "LIBRARY",
  "BOARDING",
  "PORTAL",
  "RESULTS",
];

export type LeaverRow = {
  id: string;
  lastDay: string;
  reason: LeavingReason;
  reasonNote: string | null;
  status: string;
  student: {
    id: string;
    studentNo: string;
    firstName: string;
    lastName: string;
    className: string | null;
    streamName: string | null;
  };
  clearances: Array<{
    kind: ClearanceKind;
    state: "TODO" | "DONE" | "NOT_APPLICABLE";
    detail: string | null;
    overrideNote: string | null;
  }>;
  nextStep: string;
  owed: string;
};

export type LeaverQueuePage = {
  rows: LeaverRow[];
  tallies: {
    inTheQueue: number;
    notCleared: number;
    owingOnExit: string;
    documentsOutstanding: number;
  };
  goneStillOwing: LeaverRow[];
};

export function fetchLeaverQueue(
  params: {
    status?: "open" | "closed";
    reason?: LeavingReason;
    level?: number;
    classId?: string;
    streamId?: string;
    clearance?: "cleared" | "not-cleared";
    search?: string;
  } = {},
) {
  return fetchJson<LeaverQueuePage>(`/api/v2/schools/leavers${query(params)}`);
}

export function recordLeaver(input: {
  studentId: string;
  lastDay: string;
  reason: LeavingReason;
  reasonNote?: string | null;
}) {
  return fetchJson<{ id: string }>("/api/v2/schools/leavers", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function markClearance(
  leaverId: string,
  input: {
    kind: ClearanceKind;
    state: "TODO" | "DONE" | "NOT_APPLICABLE";
    overrideNote?: string | null;
  },
) {
  return fetchJson<{ id: string; state: string }>(`/api/v2/schools/leavers/${leaverId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function closeLeaver(leaverId: string) {
  return fetchJson<{ id: string }>(`/api/v2/schools/leavers/${leaverId}`, {
    method: "PATCH",
    body: JSON.stringify({ close: true }),
  });
}

export type LeavingDocumentsPage = {
  leaver: {
    id: string;
    lastDay: string;
    reason: LeavingReason;
    student: {
      id: string;
      studentNo: string;
      firstName: string;
      lastName: string;
      currentClass: { name: string } | null;
      currentStream: { name: string } | null;
    };
    clearances: Array<{ kind: ClearanceKind; state: string; detail: string | null }>;
  };
  documents: Array<{
    key: string;
    label: string;
    state: "ready" | "blocked" | "not-built";
    detail: string;
    needs: ClearanceKind | null;
  }>;
};

export function fetchLeavingDocuments(leaverId: string) {
  return fetchJson<LeavingDocumentsPage>(`/api/v2/schools/leavers/${leaverId}`);
}

export type ContactConsent = "NOT_ASKED" | "MAY_CONTACT" | "NO_CONTACT";

export const CONSENT_LABELS: Record<ContactConsent, string> = {
  NOT_ASKED: "Not asked",
  MAY_CONTACT: "May contact",
  NO_CONTACT: "No contact",
};

export type DestinationKind =
  | "UNKNOWN"
  | "UNIVERSITY"
  | "COLLEGE"
  | "EMPLOYED"
  | "SELF_EMPLOYED"
  | "TRANSFERRED"
  | "GAP_YEAR"
  | "ABROAD"
  | "OTHER";

export const DESTINATION_LABELS: Record<DestinationKind, string> = {
  UNKNOWN: "Unknown",
  UNIVERSITY: "University",
  COLLEGE: "College",
  EMPLOYED: "Employed",
  SELF_EMPLOYED: "Self-employed",
  TRANSFERRED: "Transferred",
  GAP_YEAR: "Gap year",
  ABROAD: "Abroad",
  OTHER: "Other",
};

export type AlumnusRow = {
  id: string;
  firstName: string;
  lastName: string;
  classOf: number;
  finalClassName: string | null;
  house: string | null;
  email: string | null;
  phone: string | null;
  contactConsent: ContactConsent;
  destinationKind: DestinationKind;
  destination: string | null;
  destinationConfirmedAt: string | null;
  studentId: string | null;
  results: { passes: number; grades: number } | null;
};

export type AlumniPage = {
  rows: AlumnusRow[];
  tallies: {
    onTheRegister: number;
    leftThisYear: number;
    destinationUnknown: number;
    consentNeverAsked: number;
    kept: Array<{ measure: string; count: number; of: number }>;
    destinationByYear: Array<{ classOf: number; recorded: number; of: number }>;
  };
  houses: string[];
  years: number[];
};

export function fetchAlumni(
  params: {
    classOf?: number;
    house?: string;
    destinationKind?: DestinationKind;
    consent?: ContactConsent;
    search?: string;
  } = {},
) {
  return fetchJson<AlumniPage>(`/api/v2/schools/alumni${query(params)}`);
}

export type AlumnusRecord = {
  alumnus: {
    id: string;
    firstName: string;
    lastName: string;
    classOf: number;
    finalClassName: string | null;
    house: string | null;
    email: string | null;
    phone: string | null;
    addressLine: string | null;
    contactConsent: ContactConsent;
    consentGivenAt: string | null;
    destinationKind: DestinationKind;
    destination: string | null;
    destinationConfirmedAt: string | null;
    notes: string | null;
    studentId: string | null;
    updates: Array<{
      id: string;
      happenedOn: string;
      summary: string;
      documentReference: string | null;
      recordedByUserId: string | null;
    }>;
  };
  results: Array<{
    grade: string;
    points: number | null;
    examSubject: { name: string; level: string };
    series: { name: string; level: string };
  }>;
  honours: Array<{ id: string; kind: string; year: number; title: string }>;
  conduct: { incidents: number; merits: number; summary: string };
};

export function fetchAlumnus(alumnusId: string) {
  return fetchJson<AlumnusRecord>(`/api/v2/schools/alumni/${alumnusId}`);
}

export function recordConsent(alumnusId: string, consent: ContactConsent) {
  return fetchJson<{ id: string }>(`/api/v2/schools/alumni/${alumnusId}`, {
    method: "PATCH",
    body: JSON.stringify({ consent }),
  });
}

export function recordDestination(
  alumnusId: string,
  input: { destinationKind: DestinationKind; destination?: string | null },
) {
  return fetchJson<{ id: string }>(`/api/v2/schools/alumni/${alumnusId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function addAlumniUpdate(
  alumnusId: string,
  input: { happenedOn: string; summary: string; documentReference?: string | null },
) {
  return fetchJson<{ id: string }>(`/api/v2/schools/alumni/${alumnusId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
