/** What a person's incident record and its disciplinary actions are, and the words for them. */

export type Tone = "done" | "info" | "warn" | "bad" | "draft" | "void";

export type HrIncidentRecord = {
  id: string;
  incidentDate: string;
  category: "MISCONDUCT" | "ATTENDANCE" | "SAFETY_POLICY" | "PERFORMANCE" | "OTHER";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "UNDER_REVIEW" | "CLOSED";
  title: string;
  description: string;
  investigationNotes: string | null;
  employee: {
    id: string;
    employeeId: string;
    name: string;
  };
  site: {
    id: string;
    name: string;
    code: string | null;
  } | null;
  reportedBy: {
    id: string;
    name: string;
  } | null;
  resolvedBy: {
    id: string;
    name: string;
  } | null;
  _count: {
    actions: number;
  };
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

export type DisciplinaryActionRecord = {
  id: string;
  actionType: "WARNING" | "PENALTY" | "SUSPENSION" | "TERMINATION" | "OTHER";
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "APPLIED";
  summary: string;
  notes: string | null;
  effectiveDate: string | null;
  penaltyAmount: number;
  penaltyCurrency: string;
  penaltyStatus: "NONE" | "PENDING" | "DEDUCTED" | "PAID" | "WAIVED";
  createdAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
  appliedAt: string | null;
  createdBy: { id: string; name: string };
  submittedBy: { id: string; name: string } | null;
  approvedBy: { id: string; name: string } | null;
  appliedBy: { id: string; name: string } | null;
  employee: { id: string; employeeId: string; name: string };
};

export const CATEGORY_LABELS: Record<HrIncidentRecord["category"], string> = {
  SAFETY_POLICY: "Safety and policy",
  MISCONDUCT: "Misconduct",
  ATTENDANCE: "Attendance",
  PERFORMANCE: "Performance",
  OTHER: "Other",
};

export type Severity = HrIncidentRecord["severity"];
export type ActionStatus = DisciplinaryActionRecord["status"];

export const SEVERITY_LABEL: Record<Severity, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", CRITICAL: "Critical" };
export const SEVERITY_TONE: Record<Severity, Tone> = { LOW: "info", MEDIUM: "warn", HIGH: "bad", CRITICAL: "bad" };
export const STATUS_LABEL: Record<HrIncidentRecord["status"], string> = { OPEN: "Open", UNDER_REVIEW: "Under review", CLOSED: "Closed" };
export const STATUS_TONE: Record<HrIncidentRecord["status"], Tone> = { OPEN: "bad", UNDER_REVIEW: "warn", CLOSED: "done" };

export const ACTION_LABEL: Record<DisciplinaryActionRecord["actionType"], string> = {
  WARNING: "Warning",
  PENALTY: "Fine",
  SUSPENSION: "Suspension",
  TERMINATION: "Termination",
  OTHER: "Other",
};
export const ACTION_STATUS_LABEL: Record<ActionStatus, string> = { DRAFT: "Draft", SUBMITTED: "Waiting for approval", APPROVED: "Approved", REJECTED: "Rejected", APPLIED: "Applied" };
export const ACTION_TONE: Record<ActionStatus, Tone> = { DRAFT: "draft", SUBMITTED: "warn", APPROVED: "info", REJECTED: "bad", APPLIED: "done" };
export const ACTION_DONE = { submit: "Sent for approval", approve: "Approved", apply: "Applied", reject: "Rejected" } as const;
export const PENALTY_LABEL: Record<DisciplinaryActionRecord["penaltyStatus"], string> = {
  NONE: "",
  PENDING: "to settle",
  DEDUCTED: "deducted from pay",
  PAID: "paid",
  WAIVED: "waived",
};
/** How an approved penalty is settled when it is applied (the route takes the same three). */
export const PENALTY_CHOICES = [
  { value: "DEDUCTED", label: "Deduct from pay" },
  { value: "PAID", label: "Mark as paid" },
  { value: "WAIVED", label: "Waive it" },
] as const;

/** The kit's status dot class, for inside a drawer (the Books states are drawn only on the page). */
export const dotClass = (tone: Tone) => (tone === "done" ? " status-success" : tone === "warn" ? " status-warning" : tone === "bad" ? " status-danger" : "");
