"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Shield } from "lucide-react";

const mockAuditLog = [
  {
    timestamp: "2026-01-08 14:30",
    action: "Pour Recorded",
    user: "John Doe",
    details: "PB-123456, 45.5g",
  },
  {
    timestamp: "2026-01-08 15:45",
    action: "Dispatch Created",
    user: "Sarah Smith",
    details: "PB-123456 to Buyer A",
  },
  {
    timestamp: "2026-01-08 18:20",
    action: "Receipt Confirmed",
    user: "Mike Johnson",
    details: "Assay: 42.3g pure",
  },
  {
    timestamp: "2026-01-07 10:15",
    action: "Pour Recorded",
    user: "John Doe",
    details: "PB-123457, 38.2g",
  },
];

export function AuditTrail({
  setViewMode,
}: {
  setViewMode: (
    mode: "menu" | "pour" | "dispatch" | "receipt" | "reconciliation" | "audit",
  ) => void;
}) {
  return (
    <div className="space-y-6">
      <Button variant="outline" onClick={() => setViewMode("menu")}>
        Back to Menu
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
                key={`${log.timestamp}-${index}`}
                className="flex gap-4 p-3 border-l-4 border-border bg-muted/60 rounded"
              >
                <div className="flex-shrink-0 text-xs text-muted-foreground w-32">
                  {log.timestamp}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-sm">{log.action}</div>
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
  );
}
