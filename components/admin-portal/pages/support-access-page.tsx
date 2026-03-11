"use client";

import { useEffect, useState } from "react";
import { Clock3, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchCompanies } from "@/components/admin-portal/api";
import { enrichClients, type EnrichedClient } from "./client-data";
import { StatusChip } from "@/components/ui/status-chip";

const ACTIVE_LEVELS = ["Read-only", "Support Agent", "Admin Shadow"];

export function SupportAccessPage() {
  const [clients, setClients] = useState<EnrichedClient[]>([]);
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [level, setLevel] = useState<string>(ACTIVE_LEVELS[0]);
  const [duration, setDuration] = useState<string>("30");

  useEffect(() => {
    void fetchCompanies()
      .then((data) => setClients(enrichClients(data)))
      .catch(() => setClients([]));
  }, []);

  const sessions = [
    { id: "s1", client: "Axiom Mining", level: "Support Agent", status: "ACTIVE", expires: "35m" },
    { id: "s2", client: "Kasiya Metals", level: "Read-only", status: "ACTIVE", expires: "1h 10m" },
  ];

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Support Access</h1>
        <p className="text-sm text-[var(--text-muted)]">Generate time-bound support sessions with explicit access level.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card className="border-[var(--border)]">
          <CardHeader>
            <CardTitle className="text-base">Generate Access Session</CardTitle>
            <CardDescription>Select client, access level, and duration. No raw toggles.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Client</Label>
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Access Level</Label>
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVE_LEVELS.map((item) => (
                    <SelectItem key={item} value={item}>{item}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Duration (minutes)</Label>
              <Input type="number" value={duration} min={5} max={240} onChange={(event) => setDuration(event.target.value)} />
            </div>
            <Button className="w-full">
              <ShieldCheck className="mr-2 h-4 w-4" />
              Generate Access Session
            </Button>
          </CardContent>
        </Card>

        <Card className="border-[var(--border)]">
          <CardHeader>
            <CardTitle className="text-base">Active Sessions</CardTitle>
            <CardDescription>Auto-expire and auditable.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-2">Client</th>
                  <th className="px-3 py-2">Access</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Expires</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id} className="border-t">
                    <td className="px-3 py-2">{session.client}</td>
                    <td className="px-3 py-2">{session.level}</td>
                    <td className="px-3 py-2"><StatusChip status={session.status} /></td>
                    <td className="px-3 py-2 text-xs text-[var(--text-muted)]"><Clock3 className="mr-2 inline h-4 w-4" />{session.expires}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
