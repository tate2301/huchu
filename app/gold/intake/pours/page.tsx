"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";

import { GoldShell } from "@/components/gold/gold-shell";
import { DataListShell } from "@/components/shared/data-list-shell";
import { PageIntro } from "@/components/shared/page-intro";
import { RecordSavedBanner } from "@/components/shared/record-saved-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchGoldPours } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { goldRoutes } from "@/app/gold/routes";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function GoldIntakePoursPage() {
  const searchParams = useSearchParams();
  const createdId = searchParams.get("createdId");
  const [query, setQuery] = useState("");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["gold-pours", "intake-lane"],
    queryFn: () => fetchGoldPours({ limit: 300 }),
  });

  const pours = useMemo(() => data?.data ?? [], [data]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return pours;
    return pours.filter((pour) => {
      return (
        pour.pourBarId.toLowerCase().includes(term) ||
        pour.site.name.toLowerCase().includes(term) ||
        pour.site.code.toLowerCase().includes(term)
      );
    });
  }, [pours, query]);

  return (
    <GoldShell
      activeTab="intake"
      title="Batches"
      description="All recorded batches"
      actions={
        <Button asChild size="sm">
          <Link href={goldRoutes.intake.newPour}>Create Batch</Link>
        </Button>
      }
    >
      <PageIntro
        title="Batches"
        purpose="Review all batches before dispatch."
        nextStep="Find a batch, then create dispatch if needed."
      />
      <RecordSavedBanner entityLabel="gold batch" />

      <DataListShell
        title="Batch History"
        description="Recorded batch entries"
        hasData={filtered.length > 0}
        isLoading={isLoading}
        isError={Boolean(error)}
        errorMessage={error ? getApiErrorMessage(error) : undefined}
        onRetry={() => void refetch()}
        emptyTitle="No batches found"
        emptyDescription="Record a new batch to get started."
        emptyAction={
          <Button asChild size="sm">
            <Link href={goldRoutes.intake.newPour}>Create Batch</Link>
          </Button>
        }
        filters={
          <div className="max-w-sm">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by batch ID or site"
              aria-label="Search batches"
            />
          </div>
        }
      >
        <div className="overflow-x-auto">
          <Table className="w-full text-sm">
            <TableHeader className="bg-muted">
              <TableRow>
                <TableHead className="p-3 text-left font-semibold">Date</TableHead>
                <TableHead className="p-3 text-left font-semibold">Batch ID</TableHead>
                <TableHead className="p-3 text-left font-semibold">Site</TableHead>
                <TableHead className="p-3 text-left font-semibold">Storage</TableHead>
                <TableHead className="p-3 text-right font-semibold">Gross Weight</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((pour) => (
                <TableRow
                  key={pour.id}
                  className={`border-b ${createdId === pour.id ? "bg-[var(--status-success-bg)]" : ""}`}
                >
                  <TableCell className="p-3">{new Date(pour.pourDate).toLocaleString()}</TableCell>
                  <TableCell className="p-3 font-medium">{pour.pourBarId}</TableCell>
                  <TableCell className="p-3">{pour.site.name}</TableCell>
                  <TableCell className="p-3">{pour.storageLocation}</TableCell>
                  <TableCell className="p-3 text-right">{pour.grossWeight.toFixed(3)} g</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DataListShell>
    </GoldShell>
  );
}


