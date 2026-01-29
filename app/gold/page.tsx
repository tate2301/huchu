"use client";

import Link from "next/link";
import { PageActions } from "@/components/layout/page-actions";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Coins, Send, Shield, Package, FileCheck } from "lucide-react";
import { mockPours } from "./mock-data";

export default function GoldPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageActions>
        <Link href="/gold/pour">
          <Button size="sm">
            <Coins className="h-4 w-4" />
            Record Pour
          </Button>
        </Link>
        <Link href="/gold/dispatch">
          <Button size="sm" variant="outline">
            <Package className="h-4 w-4" />
            Dispatch
          </Button>
        </Link>
      </PageActions>

      <PageHeading title="Gold Control" description="Security-critical operations" />

      <div className="space-y-6">
        {/* Warning Banner */}
        <Card className="bg-yellow-50 border-yellow-300">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <Shield className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <strong className="block mb-1">High-Security Module</strong>
                <p className="text-foreground">
                  All gold operations require 2-person witness rule and create
                  immutable audit trails. Corrections require approval, not silent
                  edits.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link href="/gold/pour">
            <Card className="cursor-pointer transition-shadow pb-6 border-none">
              <CardHeader>
                <Coins className="h-10 w-10 text-yellow-600 mb-2" />
                <CardTitle>Record Pour</CardTitle>
                <CardDescription>
                  Create new gold pour/bar record with witnesses
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/gold/dispatch">
            <Card className="cursor-pointer transition-shadow pb-6 border-none">
              <CardHeader>
                <Package className="h-10 w-10 text-blue-600 mb-2" />
                <CardTitle>Dispatch</CardTitle>
                <CardDescription>
                  Create dispatch manifest and chain of custody
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/gold/receipt">
            <Card className="cursor-pointer transition-shadow pb-6 border-none">
              <CardHeader>
                <FileCheck className="h-10 w-10 text-green-600 mb-2" />
                <CardTitle>Buyer Receipt</CardTitle>
                <CardDescription>
                  Record buyer assay and payment confirmation
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/gold/reconciliation">
            <Card className="cursor-pointer transition-shadow pb-6 border-none">
              <CardHeader>
                <Shield className="h-10 w-10 text-purple-600 mb-2" />
                <CardTitle>Reconciliation</CardTitle>
                <CardDescription>
                  View pour → dispatch → receipt → payment trail
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </div>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Recent Activity</CardTitle>
              <Link href="/gold/audit">
                <Button variant="outline" size="sm">
                  View Audit Log
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {mockPours.length === 0 ? (
              <div className="text-center text-muted-foreground py-6">
                <p className="text-sm">No gold operations recorded yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {mockPours.slice(0, 3).map((pour) => (
                  <div
                    key={pour.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div>
                      <div className="font-medium">{pour.id}</div>
                      <div className="text-sm text-muted-foreground">
                        {pour.site} • {pour.weight}g
                      </div>
                    </div>
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
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
