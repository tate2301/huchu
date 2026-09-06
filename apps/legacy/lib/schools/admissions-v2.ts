import { fetchJson } from "@/lib/api-client";
import type { ApplicationStage } from "@/lib/schools/admissions-stages";

/**
 * Client-side calls for admissions. As everywhere in this module,
 * `successResponse` does not wrap, so these read the body directly.
 */

export type SchoolsApplicationRecord = {
  id: string;
  applicationNo: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  gender: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianEmail: string | null;
  previousSchool: string | null;
  source: string | null;
  stage: ApplicationStage;
  assessmentScore: number | null;
  assessmentAt: string | null;
  offeredAt: string | null;
  offerExpiresAt: string | null;
  notes: string | null;
  studentId: string | null;
  createdAt: string;
  appliedForClass: { id: string; code: string; name: string } | null;
  intendedTerm: { id: string; code: string; name: string } | null;
};

export type DuplicateCandidateRecord = {
  id: string;
  applicationNo: string;
  firstName: string;
  lastName: string;
  stage: ApplicationStage;
  reason: string;
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

export async function fetchSchoolApplications(params: {
  stage?: ApplicationStage;
  classId?: string;
  termId?: string;
  search?: string;
  includeClosed?: boolean;
} = {}) {
  return fetchJson<{
    applications: SchoolsApplicationRecord[];
    counts: Record<string, number>;
  }>(`/api/v2/schools/applications${query(params)}`);
}

export async function createSchoolApplication(input: {
  firstName: string;
  lastName: string;
  dateOfBirth?: string | null;
  gender?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  guardianEmail?: string | null;
  previousSchool?: string | null;
  source?: string | null;
  appliedForClassId?: string | null;
  notes?: string | null;
}) {
  return fetchJson<{
    application: SchoolsApplicationRecord;
    duplicates: DuplicateCandidateRecord[];
  }>("/api/v2/schools/applications", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateSchoolApplication(
  id: string,
  input: {
    stage?: ApplicationStage;
    comment?: string | null;
    offerExpiresAt?: string | null;
    assessmentScore?: number | null;
    assessmentAt?: string | null;
    appliedForClassId?: string | null;
    notes?: string | null;
    /**
     * Who to ring about this child. The route has accepted these three since it
     * was written and this signature did not offer them, so the office could
     * move an application between stages but not correct a mistyped phone
     * number — which is the commonest correction there is.
     */
    guardianName?: string | null;
    guardianPhone?: string | null;
    guardianEmail?: string | null;
  },
) {
  return fetchJson<{ id: string; applicationNo: string; stage: ApplicationStage }>(
    `/api/v2/schools/applications/${id}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export async function enrolSchoolApplicant(
  id: string,
  input: { classId?: string; streamId?: string | null; isBoarding?: boolean } = {},
) {
  return fetchJson<{ applicationId: string; studentId: string; studentNo: string }>(
    `/api/v2/schools/applications/${id}/enrol`,
    { method: "POST", body: JSON.stringify(input) },
  );
}
