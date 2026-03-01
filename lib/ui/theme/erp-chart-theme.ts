export const erpChartHex = {
  primary: "#4C66D4",
  success: "#24866A",
  danger: "#D24133",
  warning: "#F08D1A",
  inProgress: "#F7B01B",
  inReview: "#4D6FC2",
  pending: "#C8C3BF",
  inactive: "#9B9692",
  border: "#E7E4E3",
  textMuted: "#7A7A7A",
} as const;

export const erpChartVars = {
  primary: "var(--chart-1)",
  success: "var(--chart-2)",
  warning: "var(--chart-3)",
  danger: "var(--chart-4)",
  inProgress: "var(--chart-5)",
  inReview: "var(--chart-in-review)",
  pending: "var(--chart-pending)",
  inactive: "var(--chart-inactive)",
  grid: "var(--chart-grid)",
  text: "var(--text-muted)",
} as const;

export const erpChartTheme = {
  grid: erpChartVars.grid,
  gridStrokeDasharray: "4 6",
  text: erpChartVars.text,
  tickColor: erpChartVars.text,
  textSize: 11,
  barRadius: 4,
  fontFamily: "\"SS Huchu\", \"Inter\", ui-sans-serif, system-ui, sans-serif",
  tooltip: {
    background: "var(--surface-base)",
    border: "var(--border)",
    shadow: "var(--shadow-popover)",
    radius: 12,
  },
  palette: [
    erpChartVars.primary,
    erpChartVars.success,
    erpChartVars.warning,
    erpChartVars.danger,
    erpChartVars.inProgress,
  ],
  status: {
    passing: erpChartVars.success,
    failing: erpChartVars.danger,
    needChanges: erpChartVars.warning,
    inReview: erpChartVars.inReview,
    inProgress: erpChartVars.inProgress,
    pending: erpChartVars.pending,
    inactive: erpChartVars.inactive,
    ignored: erpChartVars.inactive,
  },
} as const;

function normalizeStatusKey(status: string): string {
  return status
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const STATUS_ALIASES: Record<string, keyof typeof erpChartTheme.status> = {
  passing: "passing",
  pass: "passing",
  success: "passing",

  failing: "failing",
  fail: "failing",
  error: "failing",

  need_changes: "needChanges",
  needs_changes: "needChanges",
  needs_change: "needChanges",
  need_change: "needChanges",
  needchanges: "needChanges",
  needschanges: "needChanges",

  in_review: "inReview",
  inreview: "inReview",
  review: "inReview",

  in_progress: "inProgress",
  inprogress: "inProgress",
  progress: "inProgress",

  pending: "pending",

  inactive: "inactive",
  ignored: "ignored",
  ignore: "ignored",
};

export function getErpChartStatusColor(status: string): string {
  const key = STATUS_ALIASES[normalizeStatusKey(status)];
  return key ? erpChartTheme.status[key] : erpChartVars.primary;
}
