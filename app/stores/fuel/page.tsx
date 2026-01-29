"use client";

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
import { Download, Fuel, Minus, Plus } from "lucide-react";
import Link from "next/link";
import { mockFuelLedger } from "../mock-data";
import { StoresNavigation } from "../components/stores-navigation";

export default function FuelPage() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageActions>
        <Link href="/stores/issue">
          <Button size="sm">
            <Minus className="h-4 w-4" />
            Issue Stock
          </Button>
        </Link>
        <Link href="/stores/receive">
          <Button size="sm" variant="outline">
            <Plus className="h-4 w-4" />
            Receive Stock
          </Button>
        </Link>
      </PageActions>

      <PageHeading
        title="Fuel Ledger"
        description="Diesel receipts and issues with running balance"
      />

      <StoresNavigation activeView="fuel" />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Fuel className="h-5 w-5 text-orange-600" />
                Fuel Ledger
              </CardTitle>
              <CardDescription>
                Diesel receipts and issues with running balance
              </CardDescription>
            </div>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export PDF
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Current Balance */}
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  Current Diesel Stock
                </p>
                <p className="text-3xl font-bold text-orange-600">
                  450 litres
                </p>
                <p className="text-sm text-red-600 mt-1">
                  ⚠️ Below minimum level (500L)
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Variance</p>
                <p className="text-xl font-medium text-red-600">-50 L</p>
              </div>
            </div>
          </div>

          {/* Fuel Ledger Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-3 text-sm font-medium">Date</th>
                  <th className="text-left p-3 text-sm font-medium">Type</th>
                  <th className="text-left p-3 text-sm font-medium">
                    Equipment/Supplier
                  </th>
                  <th className="text-right p-3 text-sm font-medium">
                    Quantity
                  </th>
                  <th className="text-right p-3 text-sm font-medium">
                    Opening
                  </th>
                  <th className="text-right p-3 text-sm font-medium">
                    Closing
                  </th>
                  <th className="text-left p-3 text-sm font-medium">
                    Authorized By
                  </th>
                </tr>
              </thead>
              <tbody>
                {mockFuelLedger.map((entry, index) => (
                  <tr key={index} className="border-b hover:bg-muted/60">
                    <td className="p-3 text-sm">{entry.date}</td>
                    <td className="p-3 text-sm">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          entry.type === "receipt"
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {entry.type === "receipt" ? "Receipt" : "Issue"}
                      </span>
                    </td>
                    <td className="p-3 text-sm">
                      {entry.type === "receipt"
                        ? entry.supplier
                        : entry.equipment}
                    </td>
                    <td
                      className={`p-3 text-sm text-right font-medium ${
                        entry.type === "receipt"
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {entry.type === "receipt" ? "+" : "-"}
                      {entry.quantity}L
                    </td>
                    <td className="p-3 text-sm text-right">
                      {entry.opening}L
                    </td>
                    <td className="p-3 text-sm text-right font-medium">
                      {entry.closing}L
                    </td>
                    <td className="p-3 text-sm">
                      {entry.type === "receipt"
                        ? entry.receivedBy
                        : entry.approvedBy}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
