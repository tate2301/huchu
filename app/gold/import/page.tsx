"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { GoldShell } from "@/components/gold/gold-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { fetchSites, fetchShiftGroups } from "@/lib/api";
import { goldRoutes } from "@/app/gold/routes";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ClientDate } from "@/components/ui/client-date";

type CreatedImport = {
  id: string;
  rowsTotal: number;
  distinctNames: string[];
  warnings: string[];
};

type ImportListRow = {
  id: string;
  fileName: string;
  status: string;
  rowsTotal: number;
  rowsCreated: number;
  rowsAnomaly: number;
  rowsFailed: number;
  createdAt: string;
  uploadedBy: { name: string } | null;
  site: { name: string; code: string } | null;
  _count?: { entries: number };
};

export default function GoldImportPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [siteId, setSiteId] = useState<string | undefined>();

  const { data: imports, isLoading: importsLoading } = useQuery({
    queryKey: ["gold-imports"],
    queryFn: () =>
      fetchJson<{ data: ImportListRow[] }>("/api/gold/imports?limit=20"),
  });

  const { data: sitesData } = useQuery({
    queryKey: ["sites", "gold-import"],
    queryFn: fetchSites,
  });

  const sites = useMemo(() => sitesData ?? [], [sitesData]);

  const createMutation = useMutation({
    mutationFn: async (payload: { csvText: string; fileName?: string; siteId?: string }) =>
      fetchJson<CreatedImport>("/api/gold/imports", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      toast({
        title: "Ledger uploaded",
        description: `${data.rowsTotal} rows parsed, ${data.distinctNames.length} distinct names`,
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["gold-imports"] });
      router.push(`/gold/import/${data.id}`);
    },
  });

  const handleFile = async (file: File) => {
    setFileName(file.name);
    const text = await file.text();
    setCsvText(text);
  };

  const canSubmit = csvText.trim().length > 0;

  return (
    <GoldShell
      activeTab="home"
      title="Import ledger"
      actions={
        <Button asChild size="sm" variant="outline">
          <Link href={goldRoutes.intake.pours}>Back</Link>
        </Button>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-lg border bg-card p-5 space-y-4">
          <header>
            <h2 className="font-semibold">Upload</h2>
            <p className="text-sm text-muted-foreground">
              Save the ledger as CSV and drop it here. Columns expected: Date,
              Name, Tonn, Grams, Diesel, Shoots, LCD, Tot Exp, Workers,
              Company, Total (g), Bal.
            </p>
          </header>

          <SearchableSelect
            label="Default site"
            value={siteId}
            options={sites.map((s) => ({ value: s.id, label: s.name, meta: s.code }))}
            placeholder="Pick the mine site"
            searchPlaceholder="Search sites..."
            onValueChange={(v) => setSiteId(v || undefined)}
          />

          <div>
            <label className="block text-sm font-semibold mb-2">CSV file</label>
            <Input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            {fileName ? (
              <p className="mt-2 text-xs text-muted-foreground">Loaded: {fileName}</p>
            ) : null}
          </div>

          {csvText ? (
            <details className="rounded-md border bg-muted/30 p-3">
              <summary className="cursor-pointer text-xs font-semibold">
                Preview ({csvText.length.toLocaleString()} chars)
              </summary>
              <pre className="mt-2 max-h-40 overflow-auto text-[11px] whitespace-pre">
                {csvText.slice(0, 1500)}
              </pre>
            </details>
          ) : null}

          <Button
            disabled={!canSubmit || createMutation.isPending}
            onClick={() => createMutation.mutate({ csvText, fileName, siteId })}
          >
            {createMutation.isPending ? "Parsing..." : "Parse & continue"}
          </Button>

          {createMutation.error ? (
            <Alert variant="destructive">
              <AlertTitle>Could not parse</AlertTitle>
              <AlertDescription>
                {getApiErrorMessage(createMutation.error)}
              </AlertDescription>
            </Alert>
          ) : null}
        </section>

        <section className="rounded-lg border bg-card p-5">
          <header className="mb-3">
            <h2 className="font-semibold">Recent imports</h2>
            <p className="text-sm text-muted-foreground">Pick up where you left off.</p>
          </header>
          {importsLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (imports?.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No imports yet.</p>
          ) : (
            <ul className="divide-y">
              {(imports?.data ?? []).map((row) => (
                <li key={row.id} className="flex items-center justify-between py-2">
                  <div className="min-w-0">
                    <Link
                      href={`/gold/import/${row.id}`}
                      className="font-medium hover:underline"
                    >
                      {row.fileName}
                    </Link>
                    <p className="text-xs text-muted-foreground truncate">
                      {row.uploadedBy?.name ?? "—"} ·{" "}
                      <ClientDate value={row.createdAt} /> ·{" "}
                      {row.site?.name ?? "no site"}
                    </p>
                  </div>
                  <div className="text-right text-xs">
                    <p className="font-semibold">{row.status}</p>
                    <p className="text-muted-foreground">
                      {row.rowsCreated}/{row.rowsTotal} created
                      {row.rowsAnomaly ? `, ${row.rowsAnomaly} flagged` : ""}
                      {row.rowsFailed ? `, ${row.rowsFailed} failed` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </GoldShell>
  );
}
