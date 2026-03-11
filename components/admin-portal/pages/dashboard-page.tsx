"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, LineChart } from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { fetchMetrics } from "@/components/admin-portal/api";
import { AdminMetricCard } from "@/components/admin-portal/types";

const chartPalette = ["#2CA47C", "#F4B400", "#F46414", "#EC442C", "#6B7280", "#312E81"];

const fallbackCharts = {
  tiers: [
    { name: "Basic", value: 24 },
    { name: "Standard", value: 32 },
    { name: "Enterprise", value: 18 },
  ],
  addons: [
    { name: "CCTV Suite", value: 28 },
    { name: "Accounting", value: 22 },
    { name: "Analytics Pro", value: 18 },
    { name: "Compliance Pro", value: 12 },
    { name: "Gold Advanced", value: 9 },
  ],
  revenue: [
    { name: "Base Plans", value: 68 },
    { name: "Add-ons", value: 22 },
    { name: "Usage", value: 10 },
  ],
};

const fallbackAlerts = [
  { id: "a1", title: "3 plans expiring this week", tone: "EXPIRING_SOON", hint: "Renewals: Axiom Mining, Kasiya Metals, Apex Drilling." },
  { id: "a2", title: "2 clients in grace", tone: "IN_GRACE", hint: "Auto-disable non-core features in 48 hours." },
  { id: "a3", title: "Pricing catalog drift detected", tone: "PAST_DUE", hint: "Run catalog sync to align bundles and entitlements." },
  { id: "a4", title: "Billing webhook failures", tone: "EXPIRING_SOON", hint: "Retry queue contains 5 events awaiting replay." },
];

export function DashboardPage({ companyId }: { companyId?: string }) {
  const [metrics, setMetrics] = useState<AdminMetricCard[]>([]);

  useEffect(() => {
    void fetchMetrics(companyId).then(setMetrics).catch(() => setMetrics([]));
  }, [companyId]);

  const displayMetrics = useMemo(() => {
    if (metrics.length > 0) return metrics;
    return [
      { id: "clients", label: "Total Clients", value: 74, hint: "Active tenants across the platform." },
      { id: "subscriptions", label: "Active Subscriptions", value: 69, hint: "Includes clients in grace." },
      { id: "revenue", label: "Revenue Estimate", value: 1630, hint: "Monthly recurring USD." },
      { id: "expiring", label: "Expiring Soon", value: 3 },
      { id: "in-grace", label: "In Grace", value: 2 },
      { id: "past-due", label: "Past Due", value: 1 },
    ];
  }, [metrics]);

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{companyId ? "Client Health Overview" : "Platform Admin Dashboard"}</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Guided, layman-friendly overview for operators. Metrics, charts, and alerts stay aligned with platform pricing and entitlements.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {displayMetrics.map((metric) => (
          <Card key={metric.id} className="border-[var(--border)]">
            <CardHeader className="pb-2">
              <CardDescription>{metric.label}</CardDescription>
              <CardTitle className="font-mono text-2xl">
                {metric.id === "revenue" ? `$${metric.value.toLocaleString()}` : metric.value}
              </CardTitle>
            </CardHeader>
            {metric.hint ? (
              <CardContent>
                <p className="text-xs text-[var(--text-muted)]">{metric.hint}</p>
              </CardContent>
            ) : null}
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="col-span-1 border-[var(--border)]">
          <CardHeader className="flex items-center justify-between gap-2 pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-4 w-4 text-[var(--text-muted)]" />
                Clients by Tier
              </CardTitle>
              <CardDescription>Distribution by plan level.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fallbackCharts.tiers}>
                <XAxis dataKey="name" />
                <Tooltip cursor={{ fill: "var(--surface-muted)" }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {fallbackCharts.tiers.map((entry, index) => (
                    <Cell key={entry.name} fill={chartPalette[index % chartPalette.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="col-span-1 border-[var(--border)]">
          <CardHeader className="flex items-center justify-between gap-2 pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <LineChart className="h-4 w-4 text-[var(--text-muted)]" />
                Add-on Usage
              </CardTitle>
              <CardDescription>Adoption across clients.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fallbackCharts.addons}>
                <XAxis dataKey="name" />
                <Tooltip cursor={{ fill: "var(--surface-muted)" }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {fallbackCharts.addons.map((entry, index) => (
                    <Cell key={entry.name} fill={chartPalette[(index + 2) % chartPalette.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="col-span-1 border-[var(--border)]">
          <CardHeader className="flex items-center justify-between gap-2 pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-4 w-4 text-[var(--text-muted)]" />
                Revenue Breakdown
              </CardTitle>
              <CardDescription>USD monthly share.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={fallbackCharts.revenue}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={4}
                >
                  {fallbackCharts.revenue.map((entry, index) => (
                    <Cell key={entry.name} fill={chartPalette[(index + 4) % chartPalette.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="border-[var(--border)]">
        <CardHeader className="flex items-center justify-between pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-[var(--text-muted)]" />
              Alerts & Drift
            </CardTitle>
            <CardDescription>Expiring plans, failed billing, misconfiguration, and catalog drift.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {fallbackAlerts.map((alert) => (
            <div key={alert.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">{alert.title}</p>
                <p className="text-xs text-[var(--text-muted)]">{alert.hint}</p>
              </div>
              <StatusChip status={alert.tone} showDot />
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
