"use client";

import Link from "next/link";
import { useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "@/lib/icons";

import { GoldShell } from "@/components/gold/gold-shell";
import { DataListShell } from "@/components/shared/data-list-shell";
import { PageIntro } from "@/components/shared/page-intro";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PdfTemplate } from "@/components/pdf/pdf-template";
import { exportElementToPdf } from "@/lib/pdf";
import {
  fetchGoldCorrections,
  fetchGoldDispatches,
  fetchGoldPours,
  fetchGoldReceipts,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { goldRoutes } from "@/app/gold/routes";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function GoldExceptionsPage() {
  const exceptionPdfRef = useRef<HTMLDivElement>(null);

  const { data: poursData } = useQuery({
    queryKey: ["gold-pours", "exceptions"],
    queryFn: () => fetchGoldPours({ limit: 300 }),
  });
  const { data: dispatchesData } = useQuery({
    queryKey: ["gold-dispatches", "exceptions"],
    queryFn: () => fetchGoldDispatches({ limit: 300 }),
  });
  const {
    data: receiptsData,
    isLoading: receiptsLoading,
    error: receiptsError,
    refetch,
  } = useQuery({
    queryKey: ["gold-receipts", "exceptions"],
    queryFn: () => fetchGoldReceipts({ limit: 300 }),
  });
  const {
    data: correctionsData,
    isLoading: correctionsLoading,
    error: correctionsError,
  } = useQuery({
    queryKey: ["gold-corrections", "exceptions"],
    queryFn: () => fetchGoldCorrections({ limit: 300 }),
  });

  const pours = useMemo(() => poursData?.data ?? [], [poursData]);
  const dispatches = useMemo(() => dispatchesData?.data ?? [], [dispatchesData]);
  const receipts = useMemo(() => receiptsData?.data ?? [], [receiptsData]);
  const corrections = useMemo(() => correctionsData?.data ?? [], [correctionsData]);

  const dispatchByPourId = useMemo(() => {
    const map = new Map<string, (typeof dispatches)[number]>();
    dispatches.forEach((dispatch) => map.set(dispatch.goldPourId, dispatch));
    return map;
  }, [dispatches]);

  const receiptByDispatchId = useMemo(() => {
    const map = new Map<string, (typeof receipts)[number]>();
    receipts.forEach((receipt) => map.set(receipt.goldDispatch.id, receipt));
    return map;
  }, [receipts]);

  const unresolvedPours = useMemo(
    () => pours.filter((pour) => !dispatchByPourId.has(pour.id)),
    [dispatchByPourId, pours],
  );
  const unresolvedDispatches = useMemo(
    () => dispatches.filter((dispatch) => !receiptByDispatchId.has(dispatch.id)),
    [dispatches, receiptByDispatchId],
  );

  const exportDisabled =
    unresolvedPours.length === 0 && unresolvedDispatches.length === 0 && corrections.length === 0;

  return (
    <GoldShell
      activeTab="exceptions"
      title="Issues"
      description="Fix missing records and review corrections"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={goldRoutes.transit.dispatches}>View Dispatches</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={goldRoutes.settlement.receipts}>View Sales</Link>
          </Button>
        </div>
      }
    >
      <PageIntro
        title="Issues"
        purpose="Find records that are missing the next step."
        nextStep="Finish missing records first, then review correction notes."
      />

      {unresolvedDispatches.length > 0 ? (
        <Alert variant="destructive">
          <AlertTitle>Dispatches Still Waiting</AlertTitle>
          <AlertDescription>
            {unresolvedDispatches.length} dispatch
            {unresolvedDispatches.length === 1 ? " is" : "es are"} waiting for a sale record.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Batches Missing Dispatch</CardTitle>
            <CardDescription>Batches without a dispatch record.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{unresolvedPours.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Dispatches Missing Sale</CardTitle>
            <CardDescription>Dispatches without buyer sale record.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{unresolvedDispatches.length}</div>
          </CardContent>
        </Card>
      </div>

      <DataListShell
        title="Correction Log"
        description="Recorded correction notes"
        hasData={corrections.length > 0}
        isLoading={correctionsLoading || receiptsLoading}
        isError={Boolean(correctionsError || receiptsError)}
        errorMessage={getApiErrorMessage(correctionsError || receiptsError)}
        onRetry={() => {
          void refetch();
        }}
        emptyTitle="No correction notes"
        emptyDescription="Correction notes will appear here after they are saved."
      >
        <div className="overflow-x-auto">
          <Table className="w-full text-sm">
            <TableHeader className="bg-muted">
              <TableRow>
                <TableHead className="p-3 text-left font-semibold">Date</TableHead>
                <TableHead className="p-3 text-left font-semibold">Type</TableHead>
                <TableHead className="p-3 text-left font-semibold">Reference</TableHead>
                <TableHead className="p-3 text-left font-semibold">Reason</TableHead>
                <TableHead className="p-3 text-left font-semibold">By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {corrections.map((correction) => (
                <TableRow key={correction.id} className="border-b">
                  <TableCell className="p-3">{new Date(correction.createdAt).toLocaleString()}</TableCell>
                  <TableCell className="p-3">
                    <Badge variant="outline">{correction.entityType}</Badge>
                  </TableCell>
                  <TableCell className="p-3">{correction.pour.pourBarId}</TableCell>
                  <TableCell className="p-3">{correction.reason}</TableCell>
                  <TableCell className="p-3">{correction.createdBy.name}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DataListShell>

      <Button
        variant="outline"
        onClick={() => {
          if (!exceptionPdfRef.current) return;
          exportElementToPdf(
            exceptionPdfRef.current,
            `gold-exceptions-${new Date().toISOString().slice(0, 10)}.pdf`,
          );
        }}
        disabled={exportDisabled}
      >
        <Download className="mr-2 h-4 w-4" />
        Export Issues Snapshot
      </Button>

      <div className="absolute left-[-9999px] top-0">
        <div ref={exceptionPdfRef}>
          <PdfTemplate
            title="Gold Issues Snapshot"
            subtitle="Missing records and correction notes"
            meta={[
              { label: "Batches missing dispatch", value: String(unresolvedPours.length) },
              {
                label: "Dispatches missing sale",
                value: String(unresolvedDispatches.length),
              },
              { label: "Corrections", value: String(corrections.length) },
            ]}
          >
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="py-2">Type</th>
                  <th className="py-2">Reference</th>
                  <th className="py-2">Details</th>
                </tr>
              </thead>
              <tbody>
                {unresolvedPours.map((pour) => (
                  <tr key={`u-p-${pour.id}`} className="border-b border-gray-100">
                    <td className="py-2">Missing Dispatch</td>
                    <td className="py-2">{pour.pourBarId}</td>
                    <td className="py-2">{pour.site.name} | {new Date(pour.pourDate).toLocaleDateString()}</td>
                  </tr>
                ))}
                {unresolvedDispatches.map((dispatch) => (
                  <tr key={`u-d-${dispatch.id}`} className="border-b border-gray-100">
                    <td className="py-2">Missing Sale</td>
                    <td className="py-2">{dispatch.goldPour.pourBarId}</td>
                    <td className="py-2">{dispatch.courier} | {new Date(dispatch.dispatchDate).toLocaleDateString()}</td>
                  </tr>
                ))}
                {corrections.map((correction) => (
                  <tr key={`c-${correction.id}`} className="border-b border-gray-100">
                    <td className="py-2">Correction ({correction.entityType})</td>
                    <td className="py-2">{correction.pour.pourBarId}</td>
                    <td className="py-2">{correction.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PdfTemplate>
        </div>
      </div>
    </GoldShell>
  );
}


