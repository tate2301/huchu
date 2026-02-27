/**
 * Chart Design System
 * Extracted from design specifications to match warm paper aesthetic
 *
 * Features:
 * - Dashed gridlines for lightness
 * - Status-based color palette
 * - Minimal styling, no heavy strokes
 * - Consistent with overall design tokens
 */

export const chartTheme = {
  // Grid styling - very light and dashed
  grid: "var(--chart-grid)",
  gridStrokeDasharray: "4 6",

  // Text styling - muted for axes
  text: "var(--chart-text)",
  textSize: 11,

  // Tooltip styling
  tooltip: {
    bg: "var(--surface)",
    border: "var(--border)",
    shadow: "var(--shadow-popover)",
    borderRadius: 12,
    padding: 12,
  },

  // Status-based colors (semantic naming)
  colors: {
    passing: "var(--chart-passing)",
    failing: "var(--chart-failing)",
    needChanges: "var(--chart-need-changes)",
    inReview: "var(--chart-in-review)",
    inProgress: "var(--chart-in-progress)",
    pending: "var(--chart-pending)",
    inactive: "var(--chart-inactive)",
  },

  // Generic chart colors (for non-status data)
  palette: [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
  ],
};

/**
 * Default Recharts configuration
 * Apply these to all chart components
 */
export const rechartsDefaults = {
  // Bar configuration
  bar: {
    radius: [4, 4, 0, 0] as [number, number, number, number],
    maxBarSize: 48,
  },

  // Grid configuration
  cartesianGrid: {
    strokeDasharray: "4 6",
    stroke: "var(--chart-grid)",
    vertical: false, // Typically hide vertical grid lines
  },

  // Axis configuration
  xAxis: {
    stroke: "var(--chart-grid)",
    tick: { fill: "var(--chart-text)", fontSize: 11 },
    axisLine: { stroke: "var(--chart-grid)" },
    tickLine: false,
  },

  yAxis: {
    stroke: "var(--chart-grid)",
    tick: { fill: "var(--chart-text)", fontSize: 11 },
    axisLine: false,
    tickLine: false,
    width: 40,
  },

  // Tooltip configuration
  tooltip: {
    contentStyle: {
      backgroundColor: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "12px",
      boxShadow: "var(--shadow-popover)",
      padding: "12px",
    },
    itemStyle: {
      fontSize: 13,
      color: "var(--text-body)",
    },
    labelStyle: {
      fontSize: 12,
      color: "var(--text-muted)",
      marginBottom: 4,
    },
  },

  // Legend configuration
  legend: {
    iconType: "circle" as const,
    iconSize: 8,
    wrapperStyle: {
      fontSize: 13,
      color: "var(--text-body)",
    },
  },
};

/**
 * Get status color by name
 */
export function getStatusColor(status: string): string {
  const statusMap: Record<string, string> = {
    passing: "var(--chart-passing)",
    failing: "var(--chart-failing)",
    "need-changes": "var(--chart-need-changes)",
    "in-review": "var(--chart-in-review)",
    "in-progress": "var(--chart-in-progress)",
    pending: "var(--chart-pending)",
    inactive: "var(--chart-inactive)",
  };

  return statusMap[status.toLowerCase()] || "var(--chart-1)";
}

/**
 * Pattern fill for "ignored" status
 * Use this for bars/areas that need hatching
 */
export function getIgnoredPattern() {
  return {
    id: "ignored-pattern",
    patternUnits: "userSpaceOnUse" as const,
    width: 8,
    height: 8,
    fill: "var(--chart-inactive)",
    path: "M 0,8 l 8,-8 M -2,2 l 4,-4 M 6,10 l 4,-4",
  };
}

/**
 * Chart container wrapper styles
 * Apply to all chart card containers
 */
export const chartContainerStyles = {
  card: "border border-border bg-surface-base rounded-lg p-4",
  title: "text-section-title mb-4",
  chart: "w-full h-[320px]",
};
