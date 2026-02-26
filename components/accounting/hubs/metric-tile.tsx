"use client";

import { FrappeStatCard } from "@/components/charts/frappe-stat-card";

type MetricTileProps = {
  title: string;
  value: number;
  valueLabel: string;
  detail?: string;
  negativeIsBetter?: boolean;
};

export function MetricTile({
  title,
  value,
  valueLabel,
  detail,
  negativeIsBetter = false,
}: MetricTileProps) {
  return (
    <FrappeStatCard
      label={title}
      value={value}
      valueLabel={valueLabel}
      detail={detail}
      negativeIsBetter={negativeIsBetter}
    />
  );
}
