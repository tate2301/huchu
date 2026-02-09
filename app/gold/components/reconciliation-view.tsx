"use client";

import { useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PdfTemplate } from "@/components/pdf/pdf-template";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertTriangle, Download } from "lucide-react";
import {
  fetchGoldDispatches,
  fetchGoldPours,
  fetchGoldReceipts,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { exportElementToPdf } from "@/lib/pdf";

export function ReconciliationView({
  setViewMode,
}: {
  setViewMode: (
    mode: "menu" | "pour" | "dispatch" | "receipt" | "reconciliation" | "audit",
  ) => void;
}) {
  const reconciliationPdfRef = useRef<HTMLDivElement | null>(null);
  const {
    data: poursData,
    isLoading: poursLoading,
    error: poursError,
  } = useQuery({
    queryKey: ["gold-pours"],
    queryFn: () => fetchGoldPours({ limit: 200 }),
  });
  const {
    data: dispatchesData,
    isLoading: dispatchesLoading,
    error: dispatchesError,
  } = useQuery({
    queryKey: ["gold-dispatches"],
    queryFn: () => fetchGoldDispatches({ limit: 200 }),
  });
  const {
    data: receiptsData,
    isLoading: receiptsLoading,
    error: receiptsError,
  } = useQuery({
    queryKey: ["gold-receipts"],
    queryFn: () => fetchGoldReceipts({ limit: 200 }),
  });
  const pours = useMemo(() => poursData?.data ?? [], [poursData]);
  const dispatches = useMemo(
    () => dispatchesData?.data ?? [],
    [dispatchesData],
  );
  const receipts = useMemo(() => receiptsData?.data ?? [], [receiptsData]);
  const dispatchByPourId = useMemo(() => {
    const map = new Map<string, (typeof dispatches)[number]>();
    dispatches.forEach((dispatch) => {
      map.set(dispatch.goldPourId, dispatch);
    });
    return map;
  }, [dispatches]);
  const receiptByDispatchId = useMemo(() => {
    const map = new Map<string, (typeof receipts)[number]>();
    receipts.forEach((receipt) => {
      map.set(receipt.goldDispatch.id, receipt);
    });
    return map;
  }, [receipts]);
  const reconciliationItems = useMemo(() => {
    return pours
      .slice()
      .sort((a, b) => b.pourDate.localeCompare(a.pourDate))
      .map((pour) => {
        const dispatch = dispatchByPourId.get(pour.id);
        const receipt = dispatch
          ? receiptByDispatchId.get(dispatch.id)
          : undefined;
        const status = receipt ? "sold" : dispatch ? "moved" : "in-storage";
        return {
          id: pour.pourBarId,
          date: pour.pourDate.slice(0, 10),
          site: pour.site.name,
          weight: pour.grossWeight,
          status,
          dispatch,
          receipt,
        };
      });
  }, [dispatchByPourId, pours, receiptByDispatchId]);
  const incompleteTransfers = useMemo(
    () =>
      dispatches.filter((dispatch) => !receiptByDispatchId.has(dispatch.id))
        .length,
    [dispatches, receiptByDispatchId],
  );
  const isLoading = poursLoading || dispatchesLoading || receiptsLoading;
  const error = poursError || dispatchesError || receiptsError;
  const exportDisabled = isLoading || reconciliationItems.length === 0;
  return (
    <div className="space-y-6">
      <Button variant="outline" onClick={() => setViewMode("menu")}>
        Back to Menu
      </Button>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load reconciliation</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      {incompleteTransfers > 0 && (
        <Alert variant="destructive">
          <AlertTitle>Incomplete gold chain</AlertTitle>
          <AlertDescription>
            {incompleteTransfers} dispatch
            {incompleteTransfers === 1 ? "" : "es"} recorded without a sale
            receipt. Follow up to close the chain of custody.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Gold Reconciliation</CardTitle>
          <CardDescription>
            Complete chain: Pour, Dispatch, Sale receipt
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">
              Loading reconciliation...
            </div>
          ) : reconciliationItems.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No gold pours recorded yet.
            </div>
          ) : (
            <div className="space-y-4">
              {reconciliationItems.map((pour) => (
                <div key={pour.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-semibold">{pour.id}</div>
                    <div
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        pour.status === "sold"
                          ? "bg-green-100 text-green-800"
                          : pour.status === "moved"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {pour.status === "sold"
                        ? "sold"
                        : pour.status === "moved"
                          ? "moved"
                          : "in storage"}
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500"></div>
                      <span className="font-semibold">Pour:</span>
                      <span className="text-muted-foreground">
                        {pour.date} - {pour.site} - {pour.weight}g
                      </span>
                    </div>

                    {pour.dispatch ? (
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                        <span className="font-semibold">Dispatch:</span>
                        <span className="text-muted-foreground">
                          Courier: {pour.dispatch.courier} - Seals:{" "}
                          {pour.dispatch.sealNumbers}
                        </span>
                      </div>
                    ) : null}

                    {pour.receipt ? (
                      <>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                          <span className="font-semibold">Sale receipt:</span>
                          <span className="text-muted-foreground">
                            #{pour.receipt.receiptNumber} - Assay{" "}
                            {pour.receipt.assayResult ?? "n/a"}g
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-green-500"></div>
                          <span className="font-semibold">Sale cleared:</span>
                          <span className="text-muted-foreground">
                            Paid weight {pour.receipt.paidAmount}g
                          </span>
                        </div>
                      </>
                    ) : null}
                  </div>

                  {pour.status === "in-storage" ? (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs text-orange-600">
                        Awaiting dispatch
                      </p>
                    </div>
                  ) : null}
                  {pour.status === "moved" ? (
                    <div className="mt-3 pt-3 border-t">
                      <div className="flex items-start gap-2 text-xs text-blue-600">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5" />
                        <span>
                          Moved without sale. Record sale receipt to complete
                          chain.
                        </span>
                      </div>
                    </div>
                  ) : null}
                  {pour.status === "sold" ? (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs text-green-600">Chain complete</p>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => {
            if (reconciliationPdfRef.current) {
              exportElementToPdf(
                reconciliationPdfRef.current,
                `gold-reconciliation-${new Date().toISOString().slice(0, 10)}.pdf`,
              );
            }
          }}
          disabled={exportDisabled}
        >
          <Download className="h-4 w-4 mr-2" />
          Export Reconciliation Report (PDF)
        </Button>
      </div>

      <div className="absolute left-[-9999px] top-0">
        <div ref={reconciliationPdfRef}>
          <PdfTemplate
            title="Gold Reconciliation"
            subtitle="Pour to dispatch to sale chain"
            meta={[
              { label: "Total pours", value: String(reconciliationItems.length) },
              {
                label: "Incomplete transfers",
                value: String(incompleteTransfers),
              },
            ]}
          >
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="py-2">Pour ID</th>
                  <th className="py-2">Date</th>
                  <th className="py-2">Site</th>
                  <th className="py-2 text-right">Weight (g)</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Dispatch</th>
                  <th className="py-2">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {reconciliationItems.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="py-2 font-semibold">{item.id}</td>
                    <td className="py-2">{item.date}</td>
                    <td className="py-2">{item.site}</td>
                    <td className="py-2 text-right">{item.weight}</td>
                    <td className="py-2">{item.status}</td>
                    <td className="py-2">
                      {item.dispatch
                        ? `${item.dispatch.courier} · ${item.dispatch.sealNumbers}`
                        : "-"}
                    </td>
                    <td className="py-2">
                      {item.receipt
                        ? `#${item.receipt.receiptNumber} · Paid ${item.receipt.paidAmount}g`
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PdfTemplate>
        </div>
      </div>
    </div>
  );
}
