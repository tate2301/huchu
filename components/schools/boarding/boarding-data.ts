import { fetchJson } from "@/lib/api-client";

/**
 * What the boarding screens read, in one place.
 *
 * These types used to live in `lib/schools/schools-v2.ts` alongside fees and
 * results, and every boarding change meant touching a file three other areas
 * also read. They are only ever used by this folder, so they live here — and
 * the two shapes that were missing from the old ones, a child's class and a
 * hostel's capacity, are the reason the board can now be filtered by year group
 * and say how full a house is.
 */

export type AllocationStatus = "ACTIVE" | "TRANSFERRED" | "ENDED";

export type LeaveStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "CHECKED_OUT"
  | "CHECKED_IN"
  | "REJECTED"
  | "CANCELED";

export type BoardingStudent = {
  id: string;
  studentNo: string;
  firstName: string;
  lastName: string;
  status: string;
  isBoarding: boolean;
  currentClass: { id: string; code: string; name: string } | null;
};

export type BoardingAllocation = {
  id: string;
  status: AllocationStatus;
  startDate: string;
  endDate: string | null;
  reason?: string | null;
  student: BoardingStudent;
  term: { id: string; code: string; name: string; isActive: boolean };
  hostel: { id: string; code: string; name: string; isActive: boolean };
  room: { id: string; code: string; isActive: boolean } | null;
  bed: { id: string; code: string; status: string; isActive: boolean } | null;
};

export type BoardingHostel = {
  id: string;
  code: string;
  name: string;
  genderPolicy: string;
  capacity: number | null;
  isActive: boolean;
  _count: { rooms: number; beds: number; allocations: number };
};

export type BoardingSummary = {
  activeAllocations: number;
  listedAllocations: number;
  totalAllocations: number;
  hostels: number;
  rooms: number;
  beds: number;
};

export type BoardingDashboard = {
  data: BoardingAllocation[];
  hostels: BoardingHostel[];
  summary: BoardingSummary;
};

export type LeaveRequest = {
  id: string;
  requestType: "LEAVE" | "OUTING";
  status: LeaveStatus;
  startDateTime: string;
  endDateTime: string;
  destination: string;
  guardianContact: string;
  reason: string | null;
  student: BoardingStudent;
  allocation: {
    id: string;
    hostel: { id: string; code: string; name: string };
    room: { id: string; code: string } | null;
    bed: { id: string; code: string; status: string } | null;
  } | null;
  movementLogs: { id: string; movementType: string; recordedAt: string }[];
};

/** A hostel's rooms and beds, for the board and for the room editor. */
export type HostelRoom = {
  id: string;
  code: string;
  floor: string | null;
  capacity: number | null;
  isActive: boolean;
  beds: { id: string; code: string; status: string; isActive: boolean }[];
  _count: { beds: number; allocations: number };
};

export async function fetchBoardingDashboard(params: {
  hostelId?: string;
  status?: AllocationStatus;
  search?: string;
} = {}): Promise<BoardingDashboard> {
  const query = new URLSearchParams({ page: "1", limit: "200" });
  if (params.hostelId) query.set("hostelId", params.hostelId);
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  const response = await fetchJson<{ data: BoardingDashboard }>(
    `/api/v2/schools/boarding?${query.toString()}`,
  );
  return response.data;
}

export async function fetchLeaveRequests(params: {
  hostelId?: string;
  status?: LeaveStatus;
  requestType?: "LEAVE" | "OUTING";
} = {}): Promise<LeaveRequest[]> {
  const query = new URLSearchParams({ page: "1", limit: "200" });
  if (params.hostelId) query.set("hostelId", params.hostelId);
  if (params.status) query.set("status", params.status);
  if (params.requestType) query.set("requestType", params.requestType);
  const response = await fetchJson<{ data: LeaveRequest[] }>(
    `/api/v2/schools/boarding/leave-requests?${query.toString()}`,
  );
  return response.data;
}

export async function fetchHostelRooms(hostelId: string): Promise<HostelRoom[]> {
  const response = await fetchJson<{ data: HostelRoom[] }>(
    `/api/v2/schools/boarding/hostels/${hostelId}/rooms`,
  );
  return response.data;
}

/** What the gender policy is called on screen. The values S-1.6 checks. */
export const GENDER_POLICIES = [
  { value: "MIXED", label: "Mixed" },
  { value: "MALE", label: "Boys" },
  { value: "FEMALE", label: "Girls" },
];

export const ALLOCATION_STATUSES: { value: AllocationStatus; label: string }[] = [
  { value: "ACTIVE", label: "Active" },
  { value: "TRANSFERRED", label: "Transferred" },
  { value: "ENDED", label: "Ended" },
];

export const LEAVE_STATUSES: { value: LeaveStatus; label: string }[] = [
  { value: "DRAFT", label: "Draft" },
  { value: "SUBMITTED", label: "Waiting on the warden" },
  { value: "APPROVED", label: "Approved" },
  { value: "CHECKED_OUT", label: "Signed out" },
  { value: "CHECKED_IN", label: "Back" },
  { value: "REJECTED", label: "Refused" },
  { value: "CANCELED", label: "Called off" },
];

export function leaveStatusLabel(status: LeaveStatus): string {
  return LEAVE_STATUSES.find((row) => row.value === status)?.label ?? status;
}

export function genderPolicyLabel(policy: string): string {
  return GENDER_POLICIES.find((row) => row.value === policy)?.label ?? policy;
}
