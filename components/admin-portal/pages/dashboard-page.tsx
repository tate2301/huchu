"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchMetrics } from "@/components/admin-portal/api";
import { AdminMetricCard } from "@/components/admin-portal/types";

export function DashboardPage({ companyId }: { companyId?: string }) {
  const [metrics, setMetrics] = useState<AdminMetricCard[]>([]);

  useEffect(() => {
    void fetchMetrics(companyId).then(setMetrics).catch(() => setMetrics([]));
  }, [companyId]);

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{companyId ? "Organization Dashboard" : "Platform Dashboard"}</h1>
        <p className="text-sm text-[var(--text-muted)]">Operational metrics across all available platform modules.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.id}>
            <CardHeader className="pb-2">
              <CardDescription>{metric.label}</CardDescription>
              <CardTitle className="font-mono text-2xl">{metric.value}</CardTitle>
            </CardHeader>
            {metric.hint ? (
              <CardContent>
                <p className="text-xs text-[var(--text-muted)]">{metric.hint}</p>
              </CardContent>
            ) : null}
          </Card>
        ))}
      </div>
    </section>
  );
}
