export const CANONICAL_UI_STATUSES = [
  "passing",
  "failing",
  "needs_changes",
  "in_review",
  "in_progress",
  "pending",
  "inactive",
] as const;

export type CanonicalUiStatus = (typeof CANONICAL_UI_STATUSES)[number];

export type StatusTone =
  | "success"
  | "error"
  | "warning"
  | "info"
  | "progress"
  | "pending"
  | "inactive";

export type StatusTokenKey =
  | `status-${StatusTone}-bg`
  | `status-${StatusTone}-border`
  | `status-${StatusTone}-text`;

export interface StatusToneTokens {
  bg: StatusTokenKey;
  border: StatusTokenKey;
  text: StatusTokenKey;
}

export interface UiStatusPresentation {
  status: CanonicalUiStatus;
  label: string;
  tone: StatusTone;
  tokens: StatusToneTokens;
}

const STATUS_PRESENTATION: Record<CanonicalUiStatus, UiStatusPresentation> = {
  passing: {
    status: "passing",
    label: "Passing",
    tone: "success",
    tokens: {
      bg: "status-success-bg",
      border: "status-success-border",
      text: "status-success-text",
    },
  },
  failing: {
    status: "failing",
    label: "Failing",
    tone: "error",
    tokens: {
      bg: "status-error-bg",
      border: "status-error-border",
      text: "status-error-text",
    },
  },
  needs_changes: {
    status: "needs_changes",
    label: "Needs changes",
    tone: "warning",
    tokens: {
      bg: "status-warning-bg",
      border: "status-warning-border",
      text: "status-warning-text",
    },
  },
  in_review: {
    status: "in_review",
    label: "In review",
    tone: "info",
    tokens: {
      bg: "status-info-bg",
      border: "status-info-border",
      text: "status-info-text",
    },
  },
  in_progress: {
    status: "in_progress",
    label: "In progress",
    tone: "progress",
    tokens: {
      bg: "status-progress-bg",
      border: "status-progress-border",
      text: "status-progress-text",
    },
  },
  pending: {
    status: "pending",
    label: "Pending",
    tone: "pending",
    tokens: {
      bg: "status-pending-bg",
      border: "status-pending-border",
      text: "status-pending-text",
    },
  },
  inactive: {
    status: "inactive",
    label: "Inactive",
    tone: "inactive",
    tokens: {
      bg: "status-inactive-bg",
      border: "status-inactive-border",
      text: "status-inactive-text",
    },
  },
};

const DIRECT_STATUS_ALIASES: Record<string, CanonicalUiStatus> = {
  passing: "passing",
  pass: "passing",
  passed: "passing",
  success: "passing",
  succeeded: "passing",
  approved: "passing",
  complete: "passing",
  completed: "passing",
  done: "passing",
  ok: "passing",

  failing: "failing",
  fail: "failing",
  failed: "failing",
  failure: "failing",
  error: "failing",
  rejected: "failing",
  denied: "failing",
  blocked: "failing",
  invalid: "failing",

  needs_changes: "needs_changes",
  need_changes: "needs_changes",
  need_change: "needs_changes",
  needs_change: "needs_changes",
  changes_requested: "needs_changes",
  revision_requested: "needs_changes",
  revisions_requested: "needs_changes",
  needs_revision: "needs_changes",
  rework: "needs_changes",

  in_review: "in_review",
  review: "in_review",
  under_review: "in_review",
  pending_review: "in_review",
  awaiting_review: "in_review",
  qa: "in_review",

  in_progress: "in_progress",
  progress: "in_progress",
  processing: "in_progress",
  running: "in_progress",
  ongoing: "in_progress",
  active: "in_progress",
  started: "in_progress",
  open: "in_progress",
  wip: "in_progress",

  pending: "pending",
  queued: "pending",
  queue: "pending",
  waiting: "pending",
  await: "pending",
  todo: "pending",
  scheduled: "pending",
  draft: "pending",
  new: "pending",
  created: "pending",

  inactive: "inactive",
  disabled: "inactive",
  archived: "inactive",
  paused: "inactive",
  cancelled: "inactive",
  canceled: "inactive",
  closed: "inactive",
  void: "inactive",
  off: "inactive",
};

function normalizeStatusKey(rawStatus: string): string {
  return rawStatus
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeUiStatus(
  rawStatus: string | CanonicalUiStatus | null | undefined,
): CanonicalUiStatus {
  if (!rawStatus) {
    return "pending";
  }

  const normalizedKey = normalizeStatusKey(rawStatus);
  const directMatch = DIRECT_STATUS_ALIASES[normalizedKey];
  if (directMatch) {
    return directMatch;
  }

  if (normalizedKey.includes("review")) {
    return "in_review";
  }
  if (normalizedKey.includes("progress") || normalizedKey.includes("process")) {
    return "in_progress";
  }
  if (normalizedKey.includes("inactive") || normalizedKey.includes("archive")) {
    return "inactive";
  }
  if (normalizedKey.includes("fail") || normalizedKey.includes("error")) {
    return "failing";
  }
  if (normalizedKey.includes("change") || normalizedKey.includes("rework")) {
    return "needs_changes";
  }
  if (
    normalizedKey.includes("pass") ||
    normalizedKey.includes("success") ||
    normalizedKey.includes("approve")
  ) {
    return "passing";
  }

  return "pending";
}

export function getUiStatusPresentation(
  rawStatus: string | CanonicalUiStatus | null | undefined,
): UiStatusPresentation {
  const status = normalizeUiStatus(rawStatus);
  return STATUS_PRESENTATION[status];
}

