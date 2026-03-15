"use client";

import { useEffect, useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import { fetchManifest } from "@/components/admin-portal/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type OperationManifest = Record<string, string[]>;

type HistoryEntry = {
  id: number;
  module: string;
  action: string;
  mode: "payload" | "args";
  at: string;
  ok: boolean;
};

function prettyTime(value: string) {
  return new Date(value).toLocaleString();
}

export function AdminConsole({ actorEmail }: { actorEmail: string }) {
  const [manifest, setManifest] = useState<OperationManifest | null>(null);
  const [moduleName, setModuleName] = useState("org");
  const [actionName, setActionName] = useState("list");
  const [argsText, setArgsText] = useState("[]");
  const [payloadText, setPayloadText] = useState('{\n  "actor": ""\n}');
  const [loading, setLoading] = useState(false);
  const [loadingManifest, setLoadingManifest] = useState(true);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [result, setResult] = useState<string>("Ready.");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  useEffect(() => {
    let ignore = false;

    async function loadManifest() {
      setLoadingManifest(true);
      setManifestError(null);
      try {
        const nextManifest = await fetchManifest();
        if (ignore) {
          return;
        }

        setManifest(nextManifest);
        const [firstModule, actions] = Object.entries(nextManifest)[0] ?? [];
        const nextModule = "org" in nextManifest ? "org" : firstModule ?? "";
        const nextAction = nextManifest[nextModule]?.includes("list")
          ? "list"
          : actions?.[0] ?? "";

        if (nextModule) {
          setModuleName(nextModule);
          setActionName(nextAction);
        }
      } catch (error) {
        if (!ignore) {
          setManifestError(error instanceof Error ? error.message : "Failed to load operations manifest");
        }
      } finally {
        if (!ignore) {
          setLoadingManifest(false);
        }
      }
    }

    void loadManifest();
    return () => {
      ignore = true;
    };
  }, []);

  const resolvedManifest = useMemo(() => manifest ?? {}, [manifest]);
  const actionOptions = resolvedManifest[moduleName] ?? [];

  const catalogRows = useMemo(
    () => Object.entries(resolvedManifest).flatMap(([module, actions]) => actions.map((action) => ({ module, action }))),
    [resolvedManifest],
  );

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return catalogRows;
    return catalogRows.filter((row) => row.module.includes(term) || row.action.toLowerCase().includes(term));
  }, [catalogRows, search]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  const runOperation = async (mode: "payload" | "args") => {
    setLoading(true);
    setResult("Running...");

    try {
      const body: Record<string, unknown> = { module: moduleName, action: actionName };
      if (mode === "args") {
        body.args = JSON.parse(argsText);
      } else {
        const parsed = JSON.parse(payloadText);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const typed = parsed as Record<string, unknown>;
          if (!typed.actor) {
            typed.actor = actorEmail;
          }
        }
        body.payload = parsed;
      }

      const response = await fetch("/api/platform-admin/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      setResult(JSON.stringify(data, null, 2));
      setHistory((prev) => [
        {
          id: Date.now(),
          module: moduleName,
          action: actionName,
          mode,
          at: new Date().toISOString(),
          ok: response.ok,
        },
        ...prev,
      ]);
    } catch (error) {
      setResult(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)] text-[var(--text-strong)]">
      <div className="mx-auto w-full max-w-6xl space-y-4 p-4 md:p-6">
        <Card className="border-[var(--border)] bg-[var(--surface-base)]">
          <CardHeader className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-xl">Pagka Superuser Operations</CardTitle>
              <Badge variant="secondary" className="font-mono">{actorEmail}</Badge>
            </div>
            <CardDescription>Complete platform control surface with mobile-first execution flow.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => signOut({ callbackUrl: "/admin/login" })}>Sign out</Button>
          </CardContent>
        </Card>

        <Tabs defaultValue="execute" className="space-y-3">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="execute">Execute</TabsTrigger>
            <TabsTrigger value="catalog">Catalog</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="execute" className="space-y-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Action execution</CardTitle>
                <CardDescription>Pick any module/action and run via payload or positional args.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {loadingManifest ? (
                  <div className="rounded-md border bg-[var(--surface-muted)] px-4 py-6 text-sm text-[var(--text-muted)]">
                    Loading live operations manifest...
                  </div>
                ) : manifestError ? (
                  <div className="rounded-md border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-700">
                    {manifestError}
                  </div>
                ) : null}

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Module</Label>
                    <Select
                      value={moduleName}
                      disabled={loadingManifest || Boolean(manifestError)}
                      onValueChange={(value) => {
                        const nextAction = (resolvedManifest[value] ?? [])[0] ?? "";
                        setModuleName(value);
                        setActionName(nextAction);
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.keys(resolvedManifest).map((item) => (
                          <SelectItem key={item} value={item}>{item}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Action</Label>
                    <Select value={actionName} onValueChange={setActionName} disabled={loadingManifest || Boolean(manifestError)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {actionOptions.map((item) => (
                          <SelectItem key={item} value={item}>{item}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Payload JSON</Label>
                  <Textarea
                    value={payloadText}
                    onChange={(event) => setPayloadText(event.target.value)}
                    className="min-h-40 font-mono text-xs"
                    disabled={loadingManifest || Boolean(manifestError)}
                  />
                  <Button disabled={loading || loadingManifest || Boolean(manifestError)} onClick={() => runOperation("payload")} className="w-full">
                    {loading ? "Running..." : "Run with payload"}
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label>Args JSON array</Label>
                  <Input
                    value={argsText}
                    onChange={(event) => setArgsText(event.target.value)}
                    className="font-mono text-xs"
                    disabled={loadingManifest || Boolean(manifestError)}
                  />
                  <Button variant="outline" disabled={loading || loadingManifest || Boolean(manifestError)} onClick={() => runOperation("args")} className="w-full">
                    Run with args
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Result</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="max-h-[50vh] overflow-auto rounded-md border bg-[var(--surface-muted)] p-3 font-mono text-xs">{result}</pre>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="catalog" className="space-y-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Operations catalog</CardTitle>
                <CardDescription>Single-table manifest view with search and pagination.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {loadingManifest ? (
                  <div className="rounded-md border bg-[var(--surface-muted)] px-4 py-6 text-sm text-[var(--text-muted)]">
                    Loading live operations catalog...
                  </div>
                ) : manifestError ? (
                  <div className="rounded-md border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-700">
                    {manifestError}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    placeholder="Search module or action"
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setPage(1);
                    }}
                    className="h-9 flex-1"
                    disabled={loadingManifest || Boolean(manifestError)}
                  />
                  <Button className="h-9" onClick={() => setPage(1)} disabled={loadingManifest || Boolean(manifestError)}>Search</Button>
                  <Select
                    value={String(rowsPerPage)}
                    onValueChange={(value) => {
                      setRowsPerPage(Number(value));
                      setPage(1);
                    }}
                    disabled={loadingManifest || Boolean(manifestError)}
                  >
                    <SelectTrigger className="h-9 w-[120px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10 / page</SelectItem>
                      <SelectItem value="20">20 / page</SelectItem>
                      <SelectItem value="50">50 / page</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" className="h-9" disabled={currentPage <= 1 || loadingManifest || Boolean(manifestError)} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
                  <Badge variant="outline" className="h-9 rounded-md px-3 font-mono">{currentPage}/{totalPages}</Badge>
                  <Button variant="outline" className="h-9" disabled={currentPage >= totalPages || loadingManifest || Boolean(manifestError)} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</Button>
                </div>

                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                      <tr>
                        <th className="px-3 py-2">Module</th>
                        <th className="px-3 py-2">Action</th>
                        <th className="px-3 py-2">Run</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedRows.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-3 py-6 text-center text-[var(--text-muted)]">
                            {loadingManifest ? "Loading catalog..." : manifestError ? "Catalog unavailable." : "No operations match your search."}
                          </td>
                        </tr>
                      ) : (
                        pagedRows.map((row) => (
                          <tr key={`${row.module}.${row.action}`} className="border-t">
                            <td className="px-3 py-2 font-mono">{row.module}</td>
                            <td className="px-3 py-2">{row.action}</td>
                            <td className="px-3 py-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setModuleName(row.module);
                                  setActionName(row.action);
                                }}
                              >
                                Load
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Execution history</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                      <tr>
                        <th className="px-3 py-2">Time</th>
                        <th className="px-3 py-2">Module</th>
                        <th className="px-3 py-2">Action</th>
                        <th className="px-3 py-2">Mode</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-6 text-center text-[var(--text-muted)]">No operations yet.</td>
                        </tr>
                      ) : (
                        history.map((entry) => (
                          <tr key={entry.id} className="border-t">
                            <td className="px-3 py-2 font-mono">{prettyTime(entry.at)}</td>
                            <td className="px-3 py-2 font-mono">{entry.module}</td>
                            <td className="px-3 py-2">{entry.action}</td>
                            <td className="px-3 py-2 font-mono">{entry.mode}</td>
                            <td className="px-3 py-2">
                              <Badge variant={entry.ok ? "secondary" : "destructive"}>{entry.ok ? "ok" : "error"}</Badge>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
