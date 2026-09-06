"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";

const rows = [
  { client: "Axiom Mining", tier: "Standard", status: "EXPIRING_SOON", expiration: "2026-03-18", grace: "7 days", monthly: 1240 },
  { client: "Kasiya Metals", tier: "Enterprise", status: "ACTIVE", expiration: "2026-04-02", grace: "-", monthly: 2100 },
  { client: "Apex Drilling", tier: "Basic", status: "IN_GRACE", expiration: "2026-03-05", grace: "3 days", monthly: 540 },
  { client: "Prospector Labs", tier: "Standard", status: "PAST_DUE", expiration: "2026-02-28", grace: "0 days", monthly: 960 },
];

function formatCurrency(value: number) {
  return `$${value.toLocaleString()}/month`;
}

export function HealthPage() {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Health</h1>
        <p className="text-sm text-[var(--text-muted)]">Subscription health states with recommended actions.</p>
      </div>

      <Card className="border-[var(--border)]">
        <CardHeader>
          <CardTitle className="text-base">Subscription Health</CardTitle>
          <CardDescription>ACTIVE · EXPIRING_SOON · IN_GRACE · EXPIRED_BLOCKED · MISSING_SUBSCRIPTION</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
              <tr>
                <th className="px-3 py-2">Client</th>
                <th className="px-3 py-2">Tier</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Expiration</th>
                <th className="px-3 py-2">Grace Remaining</th>
                <th className="px-3 py-2">Monthly Amount</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.client} className="border-t">
                  <td className="px-3 py-2">{row.client}</td>
                  <td className="px-3 py-2">{row.tier}</td>
                  <td className="px-3 py-2"><StatusChip status={row.status} /></td>
                  <td className="px-3 py-2">{row.expiration}</td>
                  <td className="px-3 py-2">{row.grace}</td>
                  <td className="px-3 py-2 font-mono">{formatCurrency(row.monthly)}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline">Fix subscription</Button>
                      <Button size="sm" variant="ghost">Extend grace</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </section>
  );
}
