import { fetchJson } from "@/lib/api-client";

type QueryValue = string | number | boolean | null | undefined;

function buildQuery(params: Record<string, QueryValue>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

type ApiResponse<T> = {
  success: true;
  data: T;
};

export type SchoolsDashboardData = {
  resource: "schools";
  companyId: string;
  counts: {
    students: number;
    guardians: number;
    enrollments: number;
    boardingAllocations: number;
    resultSheets: number;
    resultModerationActions: number;
    teacherProfiles: number;
    subjects: number;
    classSubjects: number;
    publishWindows: number;
    feeStructures: number;
    feeInvoices: number;
    feeReceipts: number;
    feeWaivers: number;
  };
  count: number;
  records: Array<{ id: string; name: string }>;
};

export type SchoolsBoardingData = {
  resource: "schools-boarding";
  companyId: string;
  data: Array<{
    id: string;
    status: "ACTIVE" | "TRANSFERRED" | "ENDED";
    startDate: string;
    endDate: string | null;
    student: {
      id: string;
      studentNo: string;
      firstName: string;
      lastName: string;
      status: string;
      isBoarding: boolean;
    };
    term: { id: string; code: string; name: string; isActive: boolean };
    hostel: { id: string; code: string; name: string; isActive: boolean };
    room: { id: string; code: string; isActive: boolean } | null;
    bed: { id: string; code: string; status: string; isActive: boolean } | null;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasMore: boolean;
  };
  hostels: Array<{
    id: string;
    code: string;
    name: string;
    genderPolicy: string;
    isActive: boolean;
    _count: {
      rooms: number;
      beds: number;
      allocations: number;
    };
  }>;
  summary: {
    activeAllocations: number;
    listedAllocations: number;
    totalAllocations: number;
    hostels: number;
    rooms: number;
    beds: number;
  };
};

export type SchoolsBoardingLeaveRequestData = {
  data: Array<{
    id: string;
    requestType: "LEAVE" | "OUTING";
    status:
      | "DRAFT"
      | "SUBMITTED"
      | "APPROVED"
      | "CHECKED_OUT"
      | "CHECKED_IN"
      | "REJECTED"
      | "CANCELED";
    startDateTime: string;
    endDateTime: string;
    destination: string;
    guardianContact: string;
    reason: string | null;
    approvedAt: string | null;
    checkedOutAt: string | null;
    checkedInAt: string | null;
    student: {
      id: string;
      studentNo: string;
      firstName: string;
      lastName: string;
      status: string;
      isBoarding: boolean;
    };
    term: { id: string; code: string; name: string; isActive: boolean } | null;
    allocation: {
      id: string;
      termId: string;
      status: string;
      startDate: string;
      endDate: string | null;
      hostel: { id: string; code: string; name: string };
      room: { id: string; code: string } | null;
      bed: { id: string; code: string; status: string } | null;
    };
    movementLogs: Array<{
      id: string;
      movementType: "CHECK_OUT" | "CHECK_IN" | "TRANSFER" | "BED_RELEASE";
      recordedAt: string;
      notes: string | null;
      recordedBy: { id: string; name: string; email: string };
    }>;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasMore: boolean;
  };
};

export type SchoolsResultsData = {
  resource: "schools-results";
  companyId: string;
  data: Array<{
    id: string;
    title: string;
    status: "DRAFT" | "SUBMITTED" | "HOD_APPROVED" | "HOD_REJECTED" | "PUBLISHED";
    submittedAt: string | null;
    hodApprovedAt: string | null;
    publishedAt: string | null;
    createdAt: string;
    updatedAt: string;
    term: { id: string; code: string; name: string; isActive: boolean };
    class: { id: string; code: string; name: string };
    stream: { id: string; code: string; name: string } | null;
    _count: { lines: number };
    stats: { averageScore: number | null; linesCount: number };
  }>;
  publishWindows: Array<{
    id: string;
    status: "SCHEDULED" | "OPEN" | "CLOSED";
    openAt: string;
    closeAt: string;
    notes: string | null;
    term: { id: string; code: string; name: string };
    class: { id: string; code: string; name: string } | null;
    stream: { id: string; code: string; name: string } | null;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasMore: boolean;
  };
  summary: {
    totalSheets: number;
    draftSheets: number;
    submittedSheets: number;
    hodApprovedSheets: number;
    hodRejectedSheets: number;
    publishedSheets: number;
    openPublishWindows: number;
    scheduledPublishWindows: number;
    closedPublishWindows: number;
  };
};

export async function fetchSchoolsDashboardData() {
  const response = await fetchJson<ApiResponse<SchoolsDashboardData>>("/api/v2/schools");
  return response.data;
}

export async function fetchSchoolsBoardingData(params: {
  page?: number;
  limit?: number;
  status?: "ACTIVE" | "TRANSFERRED" | "ENDED";
  termId?: string;
  hostelId?: string;
  search?: string;
} = {}) {
  const query = buildQuery(params);
  const response = await fetchJson<ApiResponse<SchoolsBoardingData>>(
    `/api/v2/schools/boarding${query}`,
  );
  return response.data;
}

export async function fetchSchoolsResultsData(params: {
  page?: number;
  limit?: number;
  status?: "DRAFT" | "SUBMITTED" | "HOD_APPROVED" | "HOD_REJECTED" | "PUBLISHED";
  termId?: string;
  classId?: string;
  streamId?: string;
  search?: string;
} = {}) {
  const query = buildQuery(params);
  const response = await fetchJson<ApiResponse<SchoolsResultsData>>(
    `/api/v2/schools/results${query}`,
  );
  return response.data;
}

export async function fetchSchoolsBoardingLeaveRequests(params: {
  page?: number;
  limit?: number;
  search?: string;
  studentId?: string;
  allocationId?: string;
  status?:
    | "DRAFT"
    | "SUBMITTED"
    | "APPROVED"
    | "CHECKED_OUT"
    | "CHECKED_IN"
    | "REJECTED"
    | "CANCELED";
  requestType?: "LEAVE" | "OUTING";
} = {}) {
  const query = buildQuery(params);
  const response = await fetchJson<ApiResponse<SchoolsBoardingLeaveRequestData>>(
    `/api/v2/schools/boarding/leave-requests${query}`,
  );
  return response.data;
}
