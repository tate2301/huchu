import type {
  AxisChartConfig,
  NumberChartConfig,
} from "@rtcamp/frappe-ui-react";

type AxisSeriesConfig = AxisChartConfig["series"][number];
type AxisKeyType = AxisChartConfig["xAxis"]["type"];

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
    echartOptions,
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

