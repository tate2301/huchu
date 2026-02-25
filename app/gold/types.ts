import type { GoldShiftAllocation } from "@/lib/api";

export type AttendanceShiftSummary = {
  key: string;
  date: string;
  shift: string;
  siteId: string;
  siteName: string;
  siteCode: string;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  totalCrew: number;
  presentEmployees: Array<{ id: string; name: string; employeeId: string }>;
};

export type ShiftExpenseInput = {
  id: string;
  type: string;
  weight: string;
};

export type SearchableOption = {
  value: string;
  label: string;
  description?: string;
  meta?: string;
  avatarUrl?: string;
  badgeVariant?: "default" | "secondary" | "destructive" | "outline";
};

export type WorkerPayout = {
  id: string;
  name: string;
  employeeId: string;
  total: number;
};

export type ShiftAllocation = GoldShiftAllocation;
