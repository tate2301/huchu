"use client"

import { useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { useQuery } from "@tanstack/react-query"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { PurchaseForm } from "@/app/gold/components/purchase-form"
import { GoldShell } from "@/components/gold/gold-shell"
import { PageIntro } from "@/components/shared/page-intro"
import { RecordSavedBanner } from "@/components/shared/record-saved-banner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/ui/data-table"
import { NumericCell } from "@/components/ui/numeric-cell"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { fetchEmployees, fetchGoldPurchases, fetchSites } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-client"

type GoldPurchaseRow = Awaited<ReturnType<typeof fetchGoldPurchases>>["data"][number]

export default function GoldIntakePurchasesPage() {
  const [manualCreateOpen, setManualCreateOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const createRequested = searchParams.get("create") === "1"
  const createOpen = manualCreateOpen || createRequested

  const handleCloseCreate = () => {
    setManualCreateOpen(false)
    if (!createRequested) return
    const params = new URLSearchParams(searchParams.toString())
    params.delete("create")
    const next = params.toString()
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false })
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ["gold-purchases", "intake-lane"],
    queryFn: () => fetchGoldPurchases({ limit: 300 }),
  })
  const { data: employeesData, isLoading: employeesLoading } = useQuery({
    queryKey: ["employees", "gold-purchase-modal"],
    queryFn: () => fetchEmployees({ active: true, limit: 500 }),
    enabled: createOpen,
  })
  const { data: sitesData, isLoading: sitesLoading } = useQuery({
    queryKey: ["sites", "gold-purchase-modal"],
    queryFn: fetchSites,
    enabled: createOpen,
  })

  const rows = useMemo(
    () =>
      (data?.data ?? [])
        .slice()
        .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate)),
    [data],
  )
  const employees = useMemo(() => employeesData?.data ?? [], [employeesData])
  const sites = useMemo(() => sitesData ?? [], [sitesData])

  const columns = useMemo<ColumnDef<GoldPurchaseRow>[]>(
    () => [
      {
        id: "purchaseDate",
        header: "Date",
        cell: ({ row }) => (
          <NumericCell align="left">
            {new Date(row.original.purchaseDate).toLocaleString()}
          </NumericCell>
        ),
        size: 128,
        minSize: 128,
        maxSize: 128},
      {
        id: "purchaseNumber",
        header: "Purchase No.",
        cell: ({ row }) => <span className="font-mono font-semibold">{row.original.purchaseNumber}</span>,
        size: 112,
        minSize: 112,
        maxSize: 112},
      {
        id: "batch",
        header: "Batch ID",
        cell: ({ row }) => <span className="font-mono">{row.original.goldPour.pourBarId}</span>,
        size: 112,
        minSize: 112,
        maxSize: 112},
      {
        id: "site",
        header: "Site",
        cell: ({ row }) => row.original.site.name,
        size: 280,
        minSize: 220,
        maxSize: 420},
      {
        id: "seller",
        header: "Seller",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.sellerName}</div>
            <div className="text-xs text-muted-foreground">{row.original.sellerPhone}</div>
          </div>
        ),
        size: 160,
        minSize: 160,
        maxSize: 160},
      {
        id: "sellerType",
        header: "Type",
        cell: ({ row }) => (
          <Badge variant={row.original.sellerType === "EMPLOYEE" ? "info" : "secondary"}>
            {row.original.sellerType === "EMPLOYEE" ? "Employee" : "Walk-in"}
          </Badge>
        ),
        size: 160,
        minSize: 160,
        maxSize: 160},
      {
        id: "grossWeight",
        header: "Weight",
        cell: ({ row }) => <NumericCell>{row.original.grossWeight.toFixed(3)} g</NumericCell>,
        size: 120,
        minSize: 120,
        maxSize: 120},
      {
        id: "paidAmount",
        header: "Spend",
        cell: ({ row }) => (
          <NumericCell>
            {row.original.paidAmount.toFixed(2)} {row.original.currency}
          </NumericCell>
        ),
        size: 160,
        minSize: 160,
        maxSize: 160},
    ],
    [],
  )

  return (
    <GoldShell
      activeTab="purchases"
      title="Purchases"
      description="Gold bought from walk-in sellers, recorded as company-owned lots."
      actions={
        <Button size="sm" onClick={() => setManualCreateOpen(true)}>
          Record Purchase
        </Button>
      }
    >
      <PageIntro
        title="Purchases"
        purpose="Capture public gold purchases and spend in one audited flow."
        nextStep="Record each purchase, then continue dispatch and settlement from the generated batch."
      />
      <RecordSavedBanner entityLabel="gold purchase" />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load purchases</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      <section className="space-y-3">
        <header className="section-shell space-y-1">
          <h2 className="text-section-title text-foreground font-bold tracking-tight">
            Purchase History
          </h2>
          <p className="text-sm text-muted-foreground">Recorded public gold purchases and spend.</p>
        </header>
        <DataTable
          data={rows}
          columns={columns}
          searchPlaceholder="Search by purchase number, batch, site, or seller"
          searchSubmitLabel="Search"
          tableClassName="text-sm"
          pagination={{ enabled: true }}
          emptyState={isLoading ? "Loading purchases..." : "No purchases found."}
        />
      </section>

      <Sheet
        open={createOpen}
        onOpenChange={(next) => {
          if (next) {
            setManualCreateOpen(true)
            return
          }
          handleCloseCreate()
        }}
      >
        <SheetContent size="xl" className="w-full p-6">
          <SheetHeader>
            <SheetTitle>Record Purchase</SheetTitle>
            <SheetDescription>
              Capture seller details, custody intake, and payment for company-owned gold.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <PurchaseForm
              mode="modal"
              redirectOnSuccess={false}
              onSuccess={handleCloseCreate}
              onCancel={handleCloseCreate}
              employees={employees}
              employeesLoading={employeesLoading}
              sites={sites}
              sitesLoading={sitesLoading}
            />
          </div>
        </SheetContent>
      </Sheet>
    </GoldShell>
  )
}
