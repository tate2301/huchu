"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusChip } from "@/components/ui/status-chip";

const entries = [
  { id: "1", operator: "alice@ops.team", action: "Change Tier", target: "Axiom Mining", status: "SUCCESS", at: "2026-03-10 10:24" },
  { id: "2", operator: "bob@ops.team", action: "Enable Add-on", target: "Kasiya Metals", status: "SUCCESS", at: "2026-03-10 09:58" },
  { id: "3", operator: "carol@ops.team", action: "Support Login", target: "Apex Drilling", status: "PENDING", at: "2026-03-10 09:55" },
  { id: "4", operator: "alice@ops.team", action: "Recompute Pricing", target: "Prospector Labs", status: "SUCCESS", at: "2026-03-10 09:10" },
];

export function AuditLogPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [actorFilter, setActorFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return entries.filter((entry) => {
      const matchesSearch =
        !term ||
        entry.target.toLowerCase().includes(term) ||
        entry.action.toLowerCase().includes(term) ||
        entry.operator.toLowerCase().includes(term);
      const matchesActor = actorFilter === "all" || entry.operator === actorFilter;
      return matchesSearch && matchesActor;
    });
  }, [actorFilter, searchTerm]);

  const uniqueActors = Array.from(new Set(entries.map((entry) => entry.operator)));

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Audit Log</h1>
        <p className="text-sm text-[var(--text-muted)]">Operator, action, target, changes, timestamp.</p>
      </div>

      <Card className="border-[var(--border)]">
        <CardHeader className="space-y-3">
          <div>
            <CardTitle className="text-base">Admin activity</CardTitle>
            <CardDescription>Filters: operator, client, action type.</CardDescription>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <div>
              <Label className="sr-only">Search</Label>
              <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search action or target" className="h-10" />
            </div>
            <div>
              <Label className="sr-only">Operator</Label>
              <Select value={actorFilter} onValueChange={setActorFilter}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Operator" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All operators</SelectItem>
                  {uniqueActors.map((actor) => (
                    <SelectItem key={actor} value={actor}>{actor}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
              <tr>
                <th className="px-3 py-2">Operator</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Target</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                <tr key={entry.id} className="border-t">
                  <td className="px-3 py-2 font-mono">{entry.operator}</td>
                  <td className="px-3 py-2">{entry.action}</td>
                  <td className="px-3 py-2">{entry.target}</td>
                  <td className="px-3 py-2"><StatusChip status={entry.status} /></td>
                  <td className="px-3 py-2 text-xs text-[var(--text-muted)]">{entry.at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </section>
  );
}
