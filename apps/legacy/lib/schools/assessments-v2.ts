import { fetchJson } from "@/lib/api-client";

/**
 * Client-side calls for assessments and marks.
 *
 * NOTE, as everywhere in the schools client layer: `successResponse` does not
 * wrap its payload, so these return the body directly and never read `.data`
 * off it. That mistake has been made twice in this module and both times the
 * screen rendered empty for ever rather than failing.
 */

export type AssessmentKind = "CONTINUOUS" | "EXAM" | "PRACTICAL";

export const ASSESSMENT_KIND_LABELS: Record<AssessmentKind, string> = {
  CONTINUOUS: "Class work",
  EXAM: "Exam",
  PRACTICAL: "Practical",
};

export type SchoolsAssessmentRecord = {
  id: string;
  kind: AssessmentKind;
  title: string;
  maxScore: number;
  weight: number;
  assessedOn: string | null;
  status: "OPEN" | "LOCKED";
  termId: string;
  classSubjectId: string;
  classSubject: {
    id: string;
    subject: { id: string; code: string; name: string };
    class: { id: string; code: string; name: string };
    stream: { id: string; code: string; name: string } | null;
    teacherProfile: {
      id: string;
      employeeCode: string;
      user: { id: string; name: string | null };
    };
  };
  _count: { scores: number };
};

export type MarkSheetRow = {
  student: { id: string; studentNo: string; firstName: string; lastName: string };
  score: number | null;
  isAbsent: boolean;
  comment: string | null;
  marked: boolean;
};

export type MarkSheet = {
  assessment: {
    id: string;
    title: string;
    kind: AssessmentKind;
    maxScore: number;
    weight: number;
    status: "OPEN" | "LOCKED";
    assessedOn: string | null;
    classSubject: {
      id: string;
      subject: { id: string; code: string; name: string };
      class: { id: string; code: string; name: string };
      stream: { id: string; code: string; name: string } | null;
    };
  };
  rows: MarkSheetRow[];
};

export type TermMarkRow = {
  studentId: string;
  student: { id: string; studentNo: string; firstName: string; lastName: string };
  classSubjectId: string;
  subject: { id: string; code: string; name: string };
  mark: number | null;
  continuous: number | null;
  exam: number | null;
  grade: { grade: string; points?: number | null; remark?: string | null } | null;
  caveat: string | null;
};

export type TermMarksResponse = {
  termId: string;
  scheme: {
    id: string;
    code: string;
    name: string;
    continuousWeight: number;
    examWeight: number;
    passMark: number;
  };
  marks: TermMarkRow[];
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

export async function fetchSchoolAssessments(params: {
  termId?: string;
  classId?: string;
  streamId?: string;
  subjectId?: string;
  classSubjectId?: string;
  kind?: AssessmentKind;
  mine?: boolean;
} = {}) {
  return fetchJson<{ termId: string; assessments: SchoolsAssessmentRecord[] }>(
    `/api/v2/schools/assessments${query(params)}`,
  );
}

export async function createSchoolAssessment(input: {
  classSubjectId: string;
  kind: AssessmentKind;
  title: string;
  maxScore: number;
  weight?: number;
  assessedOn?: string | null;
}) {
  return fetchJson<SchoolsAssessmentRecord>("/api/v2/schools/assessments", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateSchoolAssessment(
  id: string,
  input: { title?: string; maxScore?: number; weight?: number; status?: "OPEN" | "LOCKED" },
) {
  return fetchJson<{ id: string; title: string; status: string }>(
    `/api/v2/schools/assessments/${id}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export async function deleteSchoolAssessment(id: string) {
  return fetchJson<{ id: string }>(`/api/v2/schools/assessments/${id}`, {
    method: "DELETE",
  });
}

export async function fetchMarkSheet(assessmentId: string) {
  return fetchJson<MarkSheet>(`/api/v2/schools/assessments/${assessmentId}/scores`);
}

export async function saveMarkSheet(
  assessmentId: string,
  scores: {
    studentId: string;
    score: number | null;
    isAbsent?: boolean;
    comment?: string | null;
  }[],
) {
  return fetchJson<{ saved: number }>(
    `/api/v2/schools/assessments/${assessmentId}/scores`,
    { method: "PUT", body: JSON.stringify({ scores }) },
  );
}

export async function fetchTermMarks(params: {
  classId: string;
  streamId?: string;
  classSubjectId?: string;
  termId?: string;
}) {
  return fetchJson<TermMarksResponse>(
    `/api/v2/schools/assessments/term-marks${query(params)}`,
  );
}

export async function rollUpTermMarksRequest(input: {
  classId: string;
  streamId?: string | null;
  termId?: string;
  title?: string;
}) {
  return fetchJson<{
    sheetId: string;
    linesWritten: number;
    skipped: number;
    scheme: { id: string; name: string };
  }>("/api/v2/schools/assessments/term-marks", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type ClassSubjectOption = {
  id: string;
  subject: { id: string; code: string; name: string };
  class: { id: string; code: string; name: string };
  stream: { id: string; code: string; name: string } | null;
  teacherProfile: { id: string; user: { id: string; name: string | null } };
};

export async function fetchClassSubjects(params: {
  classId?: string;
  streamId?: string;
  termId?: string;
  teacherProfileId?: string;
}) {
  return fetchJson<{ data: ClassSubjectOption[] }>(
    `/api/v2/schools/teachers/assignments${query({ ...params, limit: 200 })}`,
  );
}
