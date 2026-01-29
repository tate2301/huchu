"use client";

import { useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Minus, Plus, Home, Package, Fuel } from "lucide-react";
import Link from "next/link";
import { mockInventory } from "../mock-data";

export default function InventoryPage() {
  const [selectedSite, setSelectedSite] = useState("site1");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const filteredInventory = mockInventory.filter(
    (item) => selectedCategory === "all" || item.category === selectedCategory,
  );

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
        title="Stock on Hand"
        description="Current inventory across all locations"
      />

      <div className="flex flex-wrap gap-2 border-b pb-2">
        <Link href="/stores">
          <Button variant="outline" size="sm" className="gap-2">
            <Home className="size-5" />
            Overview
          </Button>
        </Link>
        <Link href="/stores/inventory">
          <Button variant="default" size="sm" className="gap-2">
            <Package className="size-5" />
            Stock on Hand
          </Button>
        </Link>
        <Link href="/stores/fuel">
          <Button variant="outline" size="sm" className="gap-2">
            <Fuel className="size-5" />
            Fuel Ledger
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Stock on Hand</CardTitle>
              <CardDescription>
                Current inventory across all locations
              </CardDescription>
            </div>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex gap-4 mb-4">
            <Select value={selectedSite} onValueChange={setSelectedSite}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select site" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="site1">Mine Site 1</SelectItem>
                <SelectItem value="site2">Mine Site 2</SelectItem>
                <SelectItem value="site3">Mine Site 3</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={selectedCategory}
              onValueChange={setSelectedCategory}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="FUEL">Fuel</SelectItem>
                <SelectItem value="SPARES">Spares</SelectItem>
                <SelectItem value="CONSUMABLES">Consumables</SelectItem>
                <SelectItem value="PPE">PPE</SelectItem>
                <SelectItem value="REAGENTS">Reagents</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Inventory Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-3 text-sm font-medium">Code</th>
                  <th className="text-left p-3 text-sm font-medium">
                    Item Name
                  </th>
                  <th className="text-left p-3 text-sm font-medium">
                    Category
                  </th>
                  <th className="text-right p-3 text-sm font-medium">
                    Current Stock
                  </th>
                  <th className="text-right p-3 text-sm font-medium">Min</th>
                  <th className="text-left p-3 text-sm font-medium">
                    Location
                  </th>
                  <th className="text-right p-3 text-sm font-medium">Value</th>
                  <th className="text-center p-3 text-sm font-medium">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredInventory.map((item) => (
                  <tr key={item.id} className="border-b hover:bg-muted/60">
                    <td className="p-3 text-sm font-mono">{item.code}</td>
                    <td className="p-3 text-sm font-medium">{item.name}</td>
                    <td className="p-3 text-sm">{item.category}</td>
                    <td className="p-3 text-sm text-right font-medium">
                      {item.currentStock} {item.unit}
                    </td>
                    <td className="p-3 text-sm text-right text-muted-foreground">
                      {item.minStock} {item.unit}
                    </td>
                    <td className="p-3 text-sm">{item.location}</td>
                    <td className="p-3 text-sm text-right">
                      ${(item.currentStock * item.unitCost).toFixed(2)}
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          item.status === "critical"
                            ? "bg-red-100 text-red-800"
                            : item.status === "low"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-green-100 text-green-800"
                        }`}
                      >
                        {item.status === "critical"
                          ? "Critical"
                          : item.status === "low"
                            ? "Low"
                            : "OK"}
                      </span>
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
