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

export type SchoolsStudentRecord = {
  id: string;
  studentNo: string;
  admissionNo: string | null;
  firstName: string;
  lastName: string;
  status: string;
  isBoarding: boolean;
  currentClass: { id: string; code: string; name: string } | null;
  currentStream: { id: string; code: string; name: string; classId: string } | null;
  _count: {
    guardianLinks: number;
    enrollments: number;
    boardingAllocations: number;
    resultLines: number;
  };
};

export type SchoolsGuardianRecord = {
  id: string;
  guardianNo: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  nationalId: string | null;
  _count: { studentLinks: number };
};

export type SchoolsEnrollmentRecord = {
  id: string;
  status: string;
  enrolledAt: string;
  endedAt: string | null;
  student: {
    id: string;
    studentNo: string;
    firstName: string;
    lastName: string;
    status: string;
  };
  term: { id: string; code: string; name: string };
  class: { id: string; code: string; name: string };
  stream: { id: string; code: string; name: string } | null;
};

export type SchoolsAttendanceRosterData = {
  resource: "schools-attendance";
  companyId: string;
  data: Array<{
    id: string;
    studentNo: string;
    firstName: string;
    lastName: string;
    status: string;
    isBoarding: boolean;
    currentClass: { id: string; code: string; name: string } | null;
    currentStream: { id: string; code: string; name: string } | null;
    _count: { enrollments: number };
  }>;
  pagination: Paginated<unknown>["pagination"];
  summary: {
    totalStudents: number;
    activeStudents: number;
    applicantStudents: number;
    suspendedStudents: number;
    listedBoarders: number;
  };
};

export type SchoolsClassRecord = {
  id: string;
  code: string;
  name: string;
  level: number | null;
  capacity: number | null;
  streams?: { id: string; code: string; name: string; capacity: number | null }[];
  _count: { streams: number; students: number };
};

export type SchoolsStreamRecord = {
  id: string;
  code: string;
  name: string;
  capacity: number | null;
};

export type SchoolsSubjectRecord = {
  id: string;
  code: string;
  name: string;
  isCore: boolean;
  passMark: number;
  isActive: boolean;
  _count: { classSubjects: number };
};

export type TeacherProfileRecord = {
  id: string;
  employeeCode: string;
  department: string | null;
  isClassTeacher: boolean;
  isHod: boolean;
  isActive: boolean;
  user: { id: string; name: string; email: string; isActive: boolean };
  _count: { assignments: number };
};

export type TeacherSubjectRecord = {
  id: string;
  code: string;
  name: string;
  isCore: boolean;
  passMark: number;
  isActive: boolean;
  _count: { classSubjects: number };
};

export type TeacherAssignmentRecord = {
  id: string;
  isActive: boolean;
  term: { id: string; code: string; name: string };
  class: { id: string; code: string; name: string };
  stream: { id: string; code: string; name: string } | null;
  subject: {
    id: string;
    code: string;
    name: string;
    isCore: boolean;
    passMark: number;
  };
  teacherProfile: {
    id: string;
    employeeCode: string;
    isClassTeacher: boolean;
    isHod: boolean;
    isActive: boolean;
    user: { id: string; name: string; email: string };
  };
};

export async function fetchSchoolsStudents(params: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  classId?: string;
  streamId?: string;
  isBoarding?: boolean;
} = {}) {
  const query = buildQuery(params);
  const response = await fetchJson<ApiResponse<Paginated<SchoolsStudentRecord>>>(
    `/api/v2/schools/students${query}`,
  );
  return response.data;
}

export async function fetchSchoolsGuardians(params: {
  page?: number;
  limit?: number;
  search?: string;
  studentId?: string;
} = {}) {
  const query = buildQuery(params);
  const response = await fetchJson<ApiResponse<Paginated<SchoolsGuardianRecord>>>(
    `/api/v2/schools/guardians${query}`,
  );
  return response.data;
}

export async function fetchSchoolsEnrollments(params: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  termId?: string;
  classId?: string;
  streamId?: string;
} = {}) {
  const query = buildQuery(params);
  const response = await fetchJson<ApiResponse<Paginated<SchoolsEnrollmentRecord>>>(
    `/api/v2/schools/enrollments${query}`,
  );
  return response.data;
}

export async function fetchSchoolsAttendanceRoster(params: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  classId?: string;
  streamId?: string;
  isBoarding?: boolean;
} = {}) {
  const query = buildQuery(params);
  const response = await fetchJson<ApiResponse<SchoolsAttendanceRosterData>>(
    `/api/v2/schools/attendance${query}`,
  );
  return response.data;
}

export async function fetchTeacherProfiles(params: {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
} = {}) {
  const query = buildQuery(params);
  const response = await fetchJson<ApiResponse<Paginated<TeacherProfileRecord>>>(
    `/api/v2/schools/teachers/profiles${query}`,
  );
  return response.data;
}

export async function fetchTeacherSubjects(params: {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
} = {}) {
  const query = buildQuery(params);
  const response = await fetchJson<ApiResponse<Paginated<TeacherSubjectRecord>>>(
    `/api/v2/schools/teachers/subjects${query}`,
  );
  return response.data;
}

export async function fetchStudentProfile(studentId: string) {
  // Profile response shape is dynamic (includes nested relations)
  type StudentProfileResponse = Record<string, unknown>;
  return fetchJson<StudentProfileResponse>(`/api/v2/schools/students/${studentId}`);
}

export async function fetchTeacherProfile(teacherId: string) {
  // Profile response shape is dynamic (includes nested relations)
  type TeacherProfileResponse = Record<string, unknown>;
  return fetchJson<TeacherProfileResponse>(`/api/v2/schools/teachers/${teacherId}`);
}

export async function fetchGuardianProfile(guardianId: string) {
  // Profile response shape is dynamic (includes nested relations)
  type GuardianProfileResponse = Record<string, unknown>;
  return fetchJson<GuardianProfileResponse>(`/api/v2/schools/guardians/${guardianId}`);
}

export async function fetchTeacherAssignments(params: {
  page?: number;
  limit?: number;
  search?: string;
  termId?: string;
  classId?: string;
  streamId?: string;
  teacherProfileId?: string;
  isActive?: boolean;
} = {}) {
  const query = buildQuery(params);
  const response = await fetchJson<ApiResponse<Paginated<TeacherAssignmentRecord>>>(
    `/api/v2/schools/teachers/assignments${query}`,
  );
  return response.data;
}

export async function fetchSchoolsClasses(params: {
  page?: number;
  limit?: number;
  search?: string;
} = {}) {
  const query = buildQuery(params);
  const response = await fetchJson<ApiResponse<Paginated<SchoolsClassRecord>>>(
    `/api/v2/schools/classes${query}`,
  );
  return response.data;
}

export async function fetchSchoolsSubjects(params: {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
} = {}) {
  const query = buildQuery(params);
  const response = await fetchJson<ApiResponse<Paginated<SchoolsSubjectRecord>>>(
    `/api/v2/schools/subjects${query}`,
  );
  return response.data;
}

export type HostelDetail = {
  id: string;
  code: string;
  name: string;
  genderPolicy: string;
  capacity: number | null;
  isActive: boolean;
  rooms: Array<{
    id: string;
    code: string;
    floor: string | null;
    capacity: number | null;
    isActive: boolean;
    beds: Array<{
      id: string;
      code: string;
      status: string;
      isActive: boolean;
    }>;
    _count: { beds: number; allocations: number };
  }>;
  allocations: Array<{
    id: string;
    status: string;
    startDate: string;
    endDate: string | null;
    student: {
      id: string;
      studentNo: string;
      firstName: string;
      lastName: string;
      status: string;
    };
    room: { id: string; code: string } | null;
    bed: { id: string; code: string } | null;
    term: { id: string; code: string; name: string } | null;
  }>;
  _count: { rooms: number; beds: number; allocations: number };
};

export async function fetchHostelDetail(hostelId: string) {
  const response = await fetchJson<ApiResponse<HostelDetail>>(
    `/api/v2/schools/boarding/hostels/${hostelId}`,
  );
  return response.data;
}
