"use client";

import { PageActions } from "@/components/layout/page-actions";
import { PageHeading } from "@/components/layout/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Package,
  Fuel,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { mockInventory, mockRecentMovements } from "./mock-data";
import { StoresNavigation } from "./components/stores-navigation";

export default function StoresPage() {
  // Calculate stats
  const totalItems = mockInventory.length;
  const lowStockItems = mockInventory.filter(
    (item) => item.status === "low" || item.status === "critical",
  ).length;
  const totalValue = mockInventory.reduce(
    (sum, item) => sum + item.currentStock * item.unitCost,
    0,
  );
  const criticalItems = mockInventory.filter(
    (item) => item.status === "critical",
  ).length;
  const dieselItem = mockInventory.find((item) => item.code === "FUEL-001");
  const dieselStock = dieselItem?.currentStock ?? 0;
  const dieselMin = dieselItem?.minStock ?? 0;
  const dieselVariance = dieselStock - dieselMin;
  const dieselBelowMin = dieselItem ? dieselStock < dieselMin : false;

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
        title="Stores & Fuel Management"
        description="Inventory tracking and fuel ledger"
      />

      <StoresNavigation activeView="overview" />

      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Card className="py-4 gap-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                Inventory Snapshot
              </CardTitle>
              <CardDescription className="text-xs">
                Quick totals across stores
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-0 min-w-0 h-8 w-full justify-between px-2"
              >
                <div className="flex items-center gap-2 text-left">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs">Total Items</span>
                </div>
                <span className="text-sm font-semibold">{totalItems}</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-0 min-w-0 h-8 w-full justify-between px-2"
              >
                <div className="flex items-center gap-2 text-left">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs">Inventory Value</span>
                </div>
                <span className="text-sm font-semibold">
                  ${totalValue.toLocaleString()}
                </span>
              </Button>
            </CardContent>
          </Card>

          <Card className="py-4 gap-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                Stock Alerts
              </CardTitle>
              <CardDescription className="text-xs">
                Items below minimums
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-0 min-w-0 h-8 w-full justify-between px-2"
              >
                <div className="flex items-center gap-2 text-left">
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs">Low or Critical</span>
                </div>
                <span className="text-sm font-semibold text-destructive">
                  {lowStockItems}
                </span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-0 min-w-0 h-8 w-full justify-between px-2"
              >
                <div className="flex items-center gap-2 text-left">
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs">Critical Only</span>
                </div>
                <span className="text-sm font-semibold text-destructive">
                  {criticalItems}
                </span>
              </Button>
            </CardContent>
          </Card>

          <Card className="py-4 gap-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                Fuel Snapshot
              </CardTitle>
              <CardDescription className="text-xs">
                Diesel stock health
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-0 min-w-0 h-auto w-full items-start justify-between gap-3 px-2 py-1.5"
              >
                <div className="flex items-center gap-2 text-left">
                  <Fuel className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs">Diesel Stock</span>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-sm font-semibold">
                    {dieselStock} L
                  </span>
                  <Badge variant={dieselBelowMin ? "destructive" : "secondary"}>
                    {dieselBelowMin ? "Below Min" : "On Target"}
                  </Badge>
                </div>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-0 min-w-0 h-8 w-full justify-between px-2"
              >
                <div className="flex items-center gap-2 text-left">
                  <Minus className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs">Variance to Min</span>
                </div>
                <span
                  className={`text-sm font-semibold ${
                    dieselVariance < 0 ? "text-destructive" : ""
                  }`}
                >
                  {dieselVariance >= 0 ? "+" : ""}
                  {dieselVariance} L
                </span>
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="py-4 gap-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                Reorder Alerts
              </CardTitle>
              <CardDescription className="text-xs">
                Items below minimum stock
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {mockInventory.filter(
                (item) => item.status === "low" || item.status === "critical",
              ).length === 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-0 min-w-0 h-8 w-full justify-between px-2"
                  disabled
                >
                  No low stock items
                </Button>
              ) : (
                mockInventory
                  .filter(
                    (item) =>
                      item.status === "low" || item.status === "critical",
                  )
                  .map((item) => (
                    <Button
                      key={item.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-0 min-w-0 h-auto w-full items-start justify-between gap-3 whitespace-normal px-2 py-1.5"
                    >
                      <div className="flex flex-col items-start text-left">
                        <span className="text-sm font-medium">
                          {item.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Current: {item.currentStock} {item.unit} | Min:{" "}
                          {item.minStock} {item.unit}
                        </span>
                      </div>
                      <Badge
                        variant={
                          item.status === "critical"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {item.status === "critical" ? "Critical" : "Low"}
                      </Badge>
                    </Button>
                  ))
              )}
            </CardContent>
          </Card>

          <Card className="py-4 gap-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                Recent Movements
              </CardTitle>
              <CardDescription className="text-xs">
                Last 4 transactions
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {mockRecentMovements.map((movement) => (
                <Button
                  key={movement.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-0 min-w-0 h-auto w-full items-start justify-between gap-3 whitespace-normal px-2 py-1.5"
                >
                  <div className="flex items-start gap-2 text-left">
                    {movement.type === "issue" ? (
                      <TrendingDown className="h-4 w-4 text-destructive" />
                    ) : (
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    )}
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">
                        {movement.item}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {movement.type === "issue"
                          ? "Issued to"
                          : "Received to"}
                        : {movement.issuedTo} | {movement.requestedBy}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge
                      variant={
                        movement.type === "issue" ? "destructive" : "secondary"
                      }
                    >
                      {movement.type === "issue" ? "Issue" : "Receipt"}
                    </Badge>
                    <span
                      className={`text-xs font-medium ${
                        movement.type === "issue" ? "text-destructive" : ""
                      }`}
                    >
                      {movement.type === "issue" ? "-" : "+"}
                      {movement.quantity} {movement.unit}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {movement.timestamp}
                    </span>
                  </div>
                </Button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
