import type {
  AxisChartConfig,
  NumberChartConfig,
} from "@rtcamp/frappe-ui-react";

type AxisSeriesConfig = AxisChartConfig["series"][number];
type AxisKeyType = AxisChartConfig["xAxis"]["type"];
type AxisChartEchartOptions = NonNullable<AxisChartConfig["echartOptions"]>;

type BuildAxisChartConfigInput = {
  data: Record<string, unknown>[];
  title: string;
  subtitle?: string;
  colors?: string[];
  xAxisKey: string;
  xAxisType: AxisKeyType;
  xAxisTimeGrain?: AxisChartConfig["xAxis"]["timeGrain"];
  yAxisTitle?: string;
  yMin?: number;
  yMax?: number;
  y2AxisTitle?: string;
  series: AxisSeriesConfig[];
  stacked?: boolean;
  swapXY?: boolean;
  echartOptions?: AxisChartConfig["echartOptions"];
};

type BuildNumberMetricConfigInput = {
  title: string;
  value: number;
  prefix?: string;
  suffix?: string;
  delta?: number;
  deltaPrefix?: string;
  deltaSuffix?: string;
  negativeIsBetter?: boolean;
};

function toOptionRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function mergeAxisEchartOptions(
  defaults: AxisChartEchartOptions,
  overrides?: AxisChartConfig["echartOptions"],
): AxisChartEchartOptions {
  if (!overrides) return defaults;

  return {
    ...defaults,
    ...overrides,
    grid: {
      ...toOptionRecord(defaults.grid),
      ...toOptionRecord(overrides.grid),
    },
    xAxis: {
      ...toOptionRecord(defaults.xAxis),
      ...toOptionRecord(overrides.xAxis),
    },
    yAxis: {
      ...toOptionRecord(defaults.yAxis),
      ...toOptionRecord(overrides.yAxis),
    },
    tooltip: {
      ...toOptionRecord(defaults.tooltip),
      ...toOptionRecord(overrides.tooltip),
    },
  };
}

export function buildDefaultErpChartOptions(
  overrides?: AxisChartConfig["echartOptions"],
): AxisChartConfig["echartOptions"] {
  const defaults: AxisChartEchartOptions = {
    grid: {
      left: 16,
      right: 16,
      top: 28,
      bottom: 16,
      containLabel: true,
    },
    xAxis: {
      axisTick: {
        show: false,
      },
      axisLine: {
        lineStyle: {
          color: "var(--chart-grid)",
        },
      },
      axisLabel: {
        color: "var(--chart-text)",
        fontSize: 11,
        margin: 10,
      },
      splitLine: {
        show: false,
      },
    },
    yAxis: {
      axisTick: {
        show: false,
      },
      axisLine: {
        show: false,
      },
      axisLabel: {
        color: "var(--chart-text)",
        fontSize: 11,
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: "var(--chart-grid)",
          type: "dashed",
          width: 1,
        },
      },
    },
    tooltip: {
      backgroundColor: "var(--surface-base)",
      borderColor: "var(--edge-default)",
      borderWidth: 1,
      padding: 10,
      textStyle: {
        color: "var(--text-body)",
        fontSize: 12,
      },
      extraCssText: "border-radius: 10px; box-shadow: var(--shadow-popover);",
    },
  };

  return mergeAxisEchartOptions(defaults, overrides);
}

export function buildAxisChartConfig({
  data,
  title,
  subtitle,
  colors,
  xAxisKey,
  xAxisType,
  xAxisTimeGrain,
  yAxisTitle,
  yMin,
  yMax,
  y2AxisTitle,
  series,
  stacked = false,
  swapXY = false,
  echartOptions,
}: BuildAxisChartConfigInput): AxisChartConfig {
  return {
    data,
    title,
    subtitle,
    colors,
    xAxis: {
      key: xAxisKey,
      type: xAxisType,
      timeGrain: xAxisType === "time" ? xAxisTimeGrain ?? "day" : undefined,
    },
    yAxis: {
      title: yAxisTitle,
      yMin,
      yMax,
    },
    y2Axis: y2AxisTitle
      ? {
          title: y2AxisTitle,
        }
      : undefined,
    series,
    stacked,
    swapXY,
    echartOptions: buildDefaultErpChartOptions(echartOptions),
  };
}

export function buildTimeSeriesChartConfig(
  input: Omit<
    BuildAxisChartConfigInput,
    "xAxisType" | "xAxisTimeGrain"
  > & { xAxisTimeGrain?: AxisChartConfig["xAxis"]["timeGrain"] },
): AxisChartConfig {
  return buildAxisChartConfig({
    ...input,
    xAxisType: "time",
    xAxisTimeGrain: input.xAxisTimeGrain ?? "day",
  });
}

export function buildNumberMetricConfig({
  title,
  value,
  prefix,
  suffix,
  delta,
  deltaPrefix,
  deltaSuffix,
  negativeIsBetter,
}: BuildNumberMetricConfigInput): NumberChartConfig {
  return {
    title,
    value,
    prefix,
    suffix,
    delta,
    deltaPrefix,
    deltaSuffix,
    negativeIsBetter,
  };
}
