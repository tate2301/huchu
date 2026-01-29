"use client";

import { useRouter } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { mockPours } from "../mock-data";

export default function ReconciliationViewPage() {
  const router = useRouter();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeading title="Gold Control" description="Reconciliation" />

      <div className="space-y-6">
        <Button variant="outline" onClick={() => router.push("/gold")}>
          ← Back to Menu
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Gold Reconciliation</CardTitle>
            <CardDescription>
              Complete chain: Pour → Dispatch → Receipt → Payment
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {mockPours.map((pour) => (
                <div key={pour.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-semibold">{pour.id}</div>
                    <div
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        pour.status === "received"
                          ? "bg-green-100 text-green-800"
                          : pour.status === "dispatched"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {pour.status}
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500"></div>
                      <span className="font-medium">Pour:</span>
                      <span className="text-muted-foreground">
                        {pour.date} • {pour.site} • {pour.weight}g
                      </span>
                    </div>

                    {pour.status !== "in-storage" && (
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                        <span className="font-medium">Dispatch:</span>
                        <span className="text-muted-foreground">
                          Courier: SecureTransit • Seals: S-12345
                        </span>
                      </div>
                    )}

                    {pour.status === "received" && (
                      <>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                          <span className="font-medium">Receipt:</span>
                          <span className="text-muted-foreground">
                            Assay: {(pour.weight * 0.93).toFixed(2)}g pure
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-green-500"></div>
                          <span className="font-medium">Payment:</span>
                          <span className="text-muted-foreground">
                            $2,150.00 • Bank Transfer • Confirmed
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  {pour.status === "in-storage" && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs text-orange-600">
                        ⚠ Awaiting dispatch
                      </p>
                    </div>
                  )}
                  {pour.status === "dispatched" && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs text-blue-600">
                        ⏳ In transit - awaiting receipt confirmation
                      </p>
                    </div>
                  )}
                  {pour.status === "received" && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs text-green-600">
                        ✓ Transaction complete
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1">
            Export Reconciliation Report (PDF)
          </Button>
          <Button variant="outline" className="flex-1">
            Export to CSV
          </Button>
        </div>
      </div>
    </div>
  );
}
