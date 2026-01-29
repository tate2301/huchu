"use client";

import { useRouter } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield } from "lucide-react";
import { mockAuditLog } from "../mock-data";

export default function AuditTrailPage() {
  const router = useRouter();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeading title="Gold Control" description="Audit Trail" />

      <div className="space-y-6">
        <Button variant="outline" onClick={() => router.push("/gold")}>
          ← Back to Menu
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Audit Trail</CardTitle>
            <CardDescription>
              Immutable log of all gold operations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {mockAuditLog.map((log, index) => (
                <div
                  key={index}
                  className="flex gap-4 p-3 border-l-4 border-border bg-muted/60 rounded"
                >
                  <div className="flex-shrink-0 text-xs text-muted-foreground w-32">
                    {log.timestamp}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-sm">{log.action}</div>
                    <div className="text-sm text-muted-foreground">
                      {log.details}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      By: {log.user}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Shield className="h-4 w-4" />
                <span>
                  All entries are cryptographically secured and cannot be modified
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button variant="outline" className="w-full">
          Export Complete Audit Log (PDF)
        </Button>
      </div>
    </div>
  );
}
