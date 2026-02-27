import { fetchJson } from "@/lib/api-client";

type PortalQueryParams = Record<string, string | number | boolean | null | undefined>;

function buildQuery(params: PortalQueryParams = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export type ParentPortalData = {
  resource: "portal-parent";
  companyId: string;
  guardian: {
    id: string;
    guardianNo: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string;
  } | null;
  children: Array<{
    linkId: string;
    relationship: string;
    isPrimary: boolean;
    canReceiveFinancials: boolean;
    canReceiveAcademicResults: boolean;
    student: {
      id: string;
      studentNo: string;
      firstName: string;
      lastName: string;
      status: string;
      isBoarding: boolean;
      currentClass: { id: string; code: string; name: string } | null;
      currentStream: { id: string; code: string; name: string } | null;
      enrollments: Array<{
        id: string;
        status: string;
        enrolledAt: string;
        term: { id: string; code: string; name: string };
        class: { id: string; code: string; name: string };
        stream: { id: string; code: string; name: string } | null;
      }>;
    };
  }>;
  results: Array<{
    id: string;
    studentId: string;
    subjectCode: string;
    score: number;
    grade: string | null;
    updatedAt: string;
    student: {
      id: string;
      studentNo: string;
      firstName: string;
      lastName: string;
    };
    sheet: {
      id: string;
      title: string;
      status: string;
      publishedAt: string | null;
      term: { id: string; code: string; name: string };
      class: { id: string; code: string; name: string };
    };
  }>;
  boarding: Array<{
    id: string;
    status: string;
    startDate: string;
    endDate: string | null;
    term: { id: string; code: string; name: string };
    hostel: { id: string; code: string; name: string };
    room: { id: string; code: string } | null;
    bed: { id: string; code: string } | null;
    student: {
      id: string;
      studentNo: string;
      firstName: string;
      lastName: string;
    };
  }>;
  fees: Array<{
    id: string;
    invoiceNo: string;
    status: string;
    issueDate: string;
    dueDate: string;
    totalAmount: number;
    paidAmount: number;
    waivedAmount: number;
    writeOffAmount: number;
    balanceAmount: number;
    student: {
      id: string;
      studentNo: string;
      firstName: string;
      lastName: string;
    };
    term: { id: string; code: string; name: string };
  }>;
  summary: {
    linkedChildren: number;
    publishedResultLines: number;
    activeBoardingAllocations: number;
    outstandingBalance: number;
    hasLinkedGuardian: boolean;
  };
};

export type StudentPortalData = {
  resource: "portal-student";
  companyId: string;
  student: {
    id: string;
    studentNo: string;
    firstName: string;
    lastName: string;
    status: string;
    isBoarding: boolean;
    currentClass: { id: string; code: string; name: string } | null;
    currentStream: { id: string; code: string; name: string } | null;
  } | null;
  enrollments: Array<{
    id: string;
    status: string;
    enrolledAt: string;
    endedAt: string | null;
    term: { id: string; code: string; name: string };
    class: { id: string; code: string; name: string };
    stream: { id: string; code: string; name: string } | null;
  }>;
  guardians: Array<{
    id: string;
    relationship: string;
    isPrimary: boolean;
    canReceiveFinancials: boolean;
    canReceiveAcademicResults: boolean;
    guardian: {
      id: string;
      guardianNo: string;
      firstName: string;
      lastName: string;
      phone: string;
      email: string | null;
    };
  }>;
  boarding: Array<{
    id: string;
    status: string;
    startDate: string;
    endDate: string | null;
    term: { id: string; code: string; name: string };
    hostel: { id: string; code: string; name: string };
    room: { id: string; code: string } | null;
    bed: { id: string; code: string } | null;
  }>;
  results: Array<{
    id: string;
    subjectCode: string;
    score: number;
    grade: string | null;
    updatedAt: string;
    sheet: {
      id: string;
      title: string;
      status: string;
      publishedAt: string | null;
      term: { id: string; code: string; name: string };
      class: { id: string; code: string; name: string };
    };
  }>;
  fees: Array<{
    id: string;
    invoiceNo: string;
    status: string;
    issueDate: string;
    dueDate: string;
    totalAmount: number;
    paidAmount: number;
    waivedAmount: number;
    writeOffAmount: number;
    balanceAmount: number;
    term: { id: string; code: string; name: string };
  }>;
  summary: {
    hasLinkedStudent: boolean;
    enrollmentRecords: number;
    publishedResultLines: number;
    activeBoardingAllocations: number;
    outstandingBalance: number;
  };
};

export type TeacherPortalRecord = {
  id: string;
  title: string;
  status: "DRAFT" | "SUBMITTED" | "HOD_APPROVED" | "HOD_REJECTED" | "PUBLISHED";
  submittedAt: string | null;
  hodApprovedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  term: { id: string; code: string; name: string };
  class: { id: string; code: string; name: string };
  stream: { id: string; code: string; name: string } | null;
  _count: { lines: number };
  stats: { averageScore: number | null; linesCount: number };
};

export type TeacherPortalData = {
  resource: "portal-teacher";
  companyId: string;
  data: TeacherPortalRecord[];
  teacherProfile: {
    id: string;
    userId: string;
    employeeCode: string;
    department: string | null;
    isClassTeacher: boolean;
    isHod: boolean;
    isActive: boolean;
  } | null;
  assignmentSummary: {
    assignments: number;
    uniqueClasses: number;
    uniqueTerms: number;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasMore: boolean;
  };
  summary: {
    draftSheets: number;
    submittedSheets: number;
    hodRejectedSheets: number;
    hodApprovedSheets: number;
    publishedSheets: number;
  };
};

type PortalResponse<T> = {
  success: true;
  data: T;
};

export async function fetchParentPortalData(params: {
  guardianId?: string;
  search?: string;
} = {}) {
  const query = buildQuery(params);
  const response = await fetchJson<PortalResponse<ParentPortalData>>(
    `/api/v2/portal/parent${query}`,
  );
  return response.data;
}

export async function fetchStudentPortalData(params: {
  studentId?: string;
  studentNo?: string;
} = {}) {
  const query = buildQuery(params);
  const response = await fetchJson<PortalResponse<StudentPortalData>>(
    `/api/v2/portal/student${query}`,
  );
  return response.data;
}

export async function fetchTeacherPortalData(params: {
  page?: number;
  limit?: number;
  search?: string;
  termId?: string;
  classId?: string;
  status?: "DRAFT" | "SUBMITTED" | "HOD_APPROVED" | "HOD_REJECTED" | "PUBLISHED";
} = {}) {
  const query = buildQuery(params);
  const response = await fetchJson<PortalResponse<Omit<TeacherPortalData, "data" | "pagination"> & {
    data: TeacherPortalRecord[];
    pagination: TeacherPortalData["pagination"];
  }>>(`/api/v2/portal/teacher${query}`);
  return response.data;
}
