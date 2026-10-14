"use client";

import { Badge } from "@corelithzw/react";

import { STANDING_TONE, standingDetail, type StandingReading } from "@/lib/admin/standing";

export function StandingBadge({ reading, withDetail = false }: { reading: StandingReading; withDetail?: boolean }) {
  const detail = withDetail ? standingDetail(reading) : null;
  return <Badge tone={STANDING_TONE[reading.standing]}>{detail ? `${reading.standing}, ${detail}` : reading.standing}</Badge>;
}
