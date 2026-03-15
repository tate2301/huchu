"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3, Eye, Masks, ShieldCheck, TimerReset } from "lucide-react";
import { SearchableSelect } from "@/app/gold/components/searchable-select";
import type { SearchableOption } from "@/app/gold/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchCompanies } from "@/components/admin-portal/api";
import { enrichClients, type EnrichedClient } from "./client-data";
import { StatusChip } from "@/components/ui/status-chip";

const ACTIVE_LEVELS = ["READ_ONLY", "READ_WRITE"] as const;
const SESSION_MODES = ["IMPERSONATE", "SHADOW"] as const;

export function SupportAccessPage() {
  const [clients, setClients] = useState<EnrichedClient[]>([]);
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [level, setLevel] = useState<(typeof ACTIVE_LEVELS)[number]>(ACTIVE_LEVELS[0]);
  const [mode, setMode] = useState<(typeof SESSION_MODES)[number]>(SESSION_MODES[0]);
  const [duration, setDuration] = useState<string>("30");

  useEffect(() => {
    void fetchCompanies()
      .then((data) => setClients(enrichClients(data)))
      .catch(() => setClients([]));
  }, []);

  const clientOptions = useMemo<SearchableOption[]>(
    () =>
      clients.map((client) => ({
        value: client.id,
        label: client.name,
        description: `${client.tierName} plan • ${client.activeSites} active sites`,
        meta: client.slug ?? client.id,
        badgeVariant: client.status === "ACTIVE" ? "secondary" : "outline",
      })),
    [clients],
  );

  const selectedClientRecord = clients.find((client) => client.id === selectedClient);

  const sessions = [
    { id: "s1", client: "Axiom Mining", level: "READ_WRITE", mode: "IMPERSONATE", status: "In progress", expires: "35m", actor: "ops@pagka.dev" },
    { id: "s2", client: "Kasiya Metals", level: "READ_ONLY", mode: "SHADOW", status: "Pending", expires: "1h 10m", actor: "support@pagka.dev" },
  ];

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Support Access</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Launch time-bound shadow or impersonation sessions with clear actor context and workspace-aware targeting.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Card className="border-[var(--border)]">
          <CardHeader>
            <CardTitle className="text-base">Generate Support Session</CardTitle>
            <CardDescription>Select the workspace, access level, session mode, and duration before launching.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SearchableSelect
              label="Client workspace"
              value={selectedClient}
              options={clientOptions}
              placeholder="Search client workspace"
              searchPlaceholder="Search by client name, slug, or id"
              onValueChange={setSelectedClient}
            />

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Access level</Label>
                <Select value={level} onValueChange={(value) => setLevel(value as (typeof ACTIVE_LEVELS)[number])}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIVE_LEVELS.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item === "READ_ONLY" ? "Read only" : "Read and write"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Session mode</Label>
                <Select value={mode} onValueChange={(value) => setMode(value as (typeof SESSION_MODES)[number])}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IMPERSONATE">Impersonate</SelectItem>
                    <SelectItem value="SHADOW">Shadow session</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Duration (minutes)</Label>
              <Input type="number" value={duration} min={5} max={240} onChange={(event) => setDuration(event.target.value)} />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <ShieldCheck className="h-4 w-4 text-[var(--text-muted)]" />
                  Access
                </div>
                <p className="mt-2 text-sm">{level === "READ_ONLY" ? "Read only" : "Read and write"}</p>
              </div>
              <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  {mode === "IMPERSONATE" ? <Masks className="h-4 w-4 text-[var(--text-muted)]" /> : <Eye className="h-4 w-4 text-[var(--text-muted)]" />}
                  Mode
                </div>
                <p className="mt-2 text-sm">{mode === "IMPERSONATE" ? "Impersonate user view" : "Shadow for observation"}</p>
              </div>
              <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <TimerReset className="h-4 w-4 text-[var(--text-muted)]" />
                  Duration
                </div>
                <p className="mt-2 text-sm">{duration} minutes</p>
              </div>
            </div>

            {selectedClientRecord ? (
              <div className="rounded-[18px] border border-[var(--border)] p-4">
                <p className="text-sm font-semibold">{selectedClientRecord.name}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {selectedClientRecord.slug ?? selectedClientRecord.id} • {selectedClientRecord.tierName} • {selectedClientRecord.activeSites} active sites
                </p>
              </div>
            ) : null}

            <Button className="w-full">
              <ShieldCheck className="mr-2 h-4 w-4" />
              Launch guided support session
            </Button>
          </CardContent>
        </Card>

        <Card className="border-[var(--border)]">
          <CardHeader>
            <CardTitle className="text-base">Active and pending sessions</CardTitle>
            <CardDescription>Shadow and impersonation sessions stay time-bound, visible, and easy to terminate.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-2">Client</th>
                  <th className="px-3 py-2">Access</th>
                  <th className="px-3 py-2">Mode</th>
                  <th className="px-3 py-2">Actor</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Expires</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id} className="border-t">
                    <td className="px-3 py-3">
                      <p className="font-medium">{session.client}</p>
                      <p className="text-xs text-[var(--text-muted)]">{session.id}</p>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant="outline">{session.level === "READ_ONLY" ? "Read only" : "Read and write"}</Badge>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant="secondary">{session.mode}</Badge>
                    </td>
                    <td className="px-3 py-3 text-xs text-[var(--text-muted)]">{session.actor}</td>
                    <td className="px-3 py-3"><StatusChip status={session.status} /></td>
                    <td className="px-3 py-3 text-xs text-[var(--text-muted)]">
                      <Clock3 className="mr-2 inline h-4 w-4" />
                      {session.expires}
                    </td>
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
