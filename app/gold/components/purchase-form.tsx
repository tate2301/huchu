"use client"

import { useMemo, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"

import { SearchableSelect } from "@/app/gold/components/searchable-select"
import type { SearchableOption } from "@/app/gold/types"
import { goldRoutes } from "@/app/gold/routes"
import { FieldHelp } from "@/components/shared/field-help"
import { FormShell } from "@/components/shared/form-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import { fetchJson, getApiErrorMessage } from "@/lib/api-client"
import { Send } from "@/lib/icons"
import { buildSavedRecordRedirect } from "@/lib/saved-record"
import { useReservedId } from "@/hooks/use-reserved-id"

type SellerType = "EMPLOYEE" | "EXTERNAL"

export function PurchaseForm({
  cancelHref,
  employees,
  employeesLoading,
  sites,
  sitesLoading,
  mode = "page",
  onSuccess,
  onCancel,
  redirectOnSuccess,
}: {
  cancelHref?: string
  employees: Array<{ id: string; name: string; employeeId: string; phone?: string | null }>
  employeesLoading: boolean
  sites: Array<{
    id: string
    name: string
    code: string
    location?: string | null
  }>
  sitesLoading: boolean
  mode?: "page" | "modal"
  onSuccess?: () => void
  onCancel?: () => void
  redirectOnSuccess?: boolean
}) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const router = useRouter()
  const shouldRedirect = redirectOnSuccess ?? mode === "page"

  const [sellerType, setSellerType] = useState<SellerType>("EXTERNAL")
  const [formData, setFormData] = useState({
    purchaseDate: new Date().toISOString().slice(0, 16),
    siteId: "",
    sellerEmployeeId: "",
    sellerName: "",
    sellerPhone: "",
    grossWeight: "",
    estimatedPurity: "",
    storageLocation: "",
    receiver1Id: "",
    receiver2Id: "",
    paidAmount: "",
    currency: "USD",
    paymentMethod: "CASH",
    paymentChannel: "",
    paymentReference: "",
    notes: "",
  })

  const [paymentMethods, setPaymentMethods] = useState<SearchableOption[]>([
    { value: "CASH", label: "Cash" },
    { value: "BANK_TRANSFER", label: "Bank Transfer" },
    { value: "MOBILE_MONEY", label: "Mobile Money" },
    { value: "CHECK", label: "Check" },
  ])

  const {
    reservedId: reservedPurchaseNumber,
    isReserving: reservingPurchaseNumber,
    error: reservePurchaseNumberError,
  } = useReservedId({
    entity: "GOLD_PURCHASE",
    enabled: true,
  })

  const employeeOptions = useMemo(
    () =>
      employees.map((employee) => ({
        value: employee.id,
        label: employee.name,
        meta: employee.employeeId,
      })),
    [employees],
  )

  const siteOptions = useMemo(
    () =>
      sites.map((site) => ({
        value: site.id,
        label: site.name,
        description: site.location ?? undefined,
        meta: site.code,
      })),
    [sites],
  )

  const handleSelectChange =
    (field: keyof typeof formData) => (value: string) => {
      setFormData((prev) => ({ ...prev, [field]: value }))
    }

  const handleSellerTypeChange = (value: SellerType) => {
    setSellerType(value)
    if (value === "EXTERNAL") {
      setFormData((prev) => ({ ...prev, sellerEmployeeId: "" }))
    }
  }

  const handleEmployeeSellerChange = (employeeId: string) => {
    const selected = employees.find((employee) => employee.id === employeeId)
    setFormData((prev) => ({
      ...prev,
      sellerEmployeeId: employeeId,
      sellerName: selected?.name ?? prev.sellerName,
      sellerPhone: selected?.phone ?? prev.sellerPhone,
    }))
  }

  const handleAddPaymentMethod = (query: string) => {
    const label = query.trim()
    if (!label) return
    const value = label.toUpperCase().replace(/\s+/g, "_")
    if (paymentMethods.some((method) => method.value === value)) return
    const next = { value, label }
    setPaymentMethods((prev) => [...prev, next])
    setFormData((prev) => ({ ...prev, paymentMethod: value }))
  }

  const createPurchaseMutation = useMutation({
    mutationFn: async (payload: {
      purchaseNumber: string
      purchaseDate: string
      siteId: string
      sellerType: SellerType
      sellerEmployeeId?: string
      sellerName?: string
      sellerPhone?: string
      grossWeight: number
      estimatedPurity?: number
      storageLocation: string
      receiver1Id: string
      receiver2Id: string
      paidAmount: number
      currency: string
      paymentMethod: string
      paymentChannel?: string
      paymentReference?: string
      notes?: string
    }) =>
      fetchJson<{ id: string; createdAt?: string }>("/api/gold/purchases", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (purchase, payload) => {
      toast({
        title: "Purchase recorded",
        description: "Gold purchase saved and linked to company custody.",
        variant: "success",
      })
      queryClient.invalidateQueries({ queryKey: ["gold-purchases"] })
      queryClient.invalidateQueries({ queryKey: ["gold-pours"] })
      onSuccess?.()
      if (shouldRedirect) {
        const destination = buildSavedRecordRedirect(goldRoutes.intake.purchases, {
          createdId: purchase.id,
          createdAt: purchase.createdAt ?? payload.purchaseDate,
          source: "gold-purchase",
        })
        router.push(destination)
      }
    },
  })

  const grossWeightValue = Number(formData.grossWeight)
  const estimatedPurityValue = formData.estimatedPurity ? Number(formData.estimatedPurity) : undefined
  const paidAmountValue = Number(formData.paidAmount)

  const canSubmit =
    !!reservedPurchaseNumber &&
    !!formData.purchaseDate &&
    !!formData.siteId &&
    !!formData.grossWeight &&
    grossWeightValue > 0 &&
    !Number.isNaN(grossWeightValue) &&
    !!formData.storageLocation &&
    !!formData.receiver1Id &&
    !!formData.receiver2Id &&
    !!formData.paidAmount &&
    paidAmountValue >= 0 &&
    !Number.isNaN(paidAmountValue) &&
    !!formData.paymentMethod &&
    !!formData.currency.trim() &&
    !!formData.sellerName.trim() &&
    !!formData.sellerPhone.trim() &&
    (sellerType === "EXTERNAL" || !!formData.sellerEmployeeId)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) {
      toast({
        title: "Missing details",
        description: "Fill all required purchase details before saving.",
        variant: "destructive",
      })
      return
    }
    if (formData.receiver1Id === formData.receiver2Id) {
      toast({
        title: "Receivers must differ",
        description: "Select two different employees for receiving validation.",
        variant: "destructive",
      })
      return
    }
    if (!reservedPurchaseNumber) {
      toast({
        title: "Unable to reserve purchase number",
        description:
          reservePurchaseNumberError ??
          "Please wait for purchase number reservation to complete.",
        variant: "destructive",
      })
      return
    }

    createPurchaseMutation.mutate({
      purchaseNumber: reservedPurchaseNumber,
      purchaseDate: formData.purchaseDate,
      siteId: formData.siteId,
      sellerType,
      sellerEmployeeId: sellerType === "EMPLOYEE" ? formData.sellerEmployeeId : undefined,
      sellerName: formData.sellerName.trim(),
      sellerPhone: formData.sellerPhone.trim(),
      grossWeight: grossWeightValue,
      estimatedPurity: estimatedPurityValue,
      storageLocation: formData.storageLocation.trim(),
      receiver1Id: formData.receiver1Id,
      receiver2Id: formData.receiver2Id,
      paidAmount: paidAmountValue,
      currency: formData.currency.trim().toUpperCase(),
      paymentMethod: formData.paymentMethod,
      paymentChannel: formData.paymentChannel.trim() || undefined,
      paymentReference: formData.paymentReference.trim() || undefined,
      notes: formData.notes.trim() || undefined,
    })
  }

  return (
    <FormShell
      title="Purchase Details"
      description="Capture seller details, custody intake, and payment information."
      onSubmit={handleSubmit}
      formClassName="space-y-6"
      requiredHint="Fields marked * are required. Submitting redirects to purchases with this record highlighted."
      errors={createPurchaseMutation.error ? [getApiErrorMessage(createPurchaseMutation.error)] : undefined}
      errorTitle="Unable to record purchase"
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (mode === "modal") {
                onCancel?.()
                return
              }
              router.push(cancelHref ?? goldRoutes.intake.purchases)
            }}
            className="flex-1 sm:flex-none"
          >
            {mode === "modal" ? "Cancel" : "Back to Purchases"}
          </Button>
          <Button
            type="submit"
            size="lg"
            disabled={!canSubmit || createPurchaseMutation.isPending || reservingPurchaseNumber}
            className="flex-1 sm:flex-none"
          >
            <Send className="mr-2 h-5 w-5" />
            {createPurchaseMutation.isPending ? "Recording..." : "Save Purchase"}
          </Button>
        </>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>Purchase Record</CardTitle>
          <CardDescription>Buyer is the company. Capture seller and payment details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Purchase Number</label>
              <Input
                value={reservedPurchaseNumber}
                readOnly
                aria-readonly="true"
                placeholder={reservingPurchaseNumber ? "Reserving..." : "Auto-generated"}
              />
              <FieldHelp
                hint={
                  reservePurchaseNumberError ??
                  "Purchase number is auto-generated and cannot be edited."
                }
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Purchase Date/Time *</label>
              <Input
                type="datetime-local"
                value={formData.purchaseDate}
                onChange={(e) => setFormData((prev) => ({ ...prev, purchaseDate: e.target.value }))}
                required
              />
            </div>
          </div>

          <SearchableSelect
            label="Site *"
            value={formData.siteId || undefined}
            options={siteOptions}
            placeholder={sitesLoading ? "Loading sites..." : "Select site"}
            searchPlaceholder="Search sites..."
            onValueChange={handleSelectChange("siteId")}
            onAddOption={() => {
              toast({
                title: "Add new site",
                description: "Sites are managed in admin settings.",
              })
            }}
            addLabel="Request new site"
          />

          <div className="border-t pt-4 space-y-4">
            <h4 className="text-sm font-semibold">Seller Details</h4>
            <div>
              <label className="block text-sm font-semibold mb-2">Seller Type *</label>
              <Select value={sellerType} onValueChange={(value) => handleSellerTypeChange(value as SellerType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EXTERNAL">Walk-in person</SelectItem>
                  <SelectItem value="EMPLOYEE">Employee</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {sellerType === "EMPLOYEE" ? (
              <SearchableSelect
                label="Employee Seller *"
                value={formData.sellerEmployeeId || undefined}
                options={employeeOptions}
                placeholder={employeesLoading ? "Loading employees..." : "Select employee"}
                searchPlaceholder="Search employees..."
                onValueChange={handleEmployeeSellerChange}
                onAddOption={() => {
                  router.push("/human-resources")
                }}
                addLabel="Add employee"
              />
            ) : null}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Seller Name *</label>
                <Input
                  value={formData.sellerName}
                  onChange={(e) => setFormData((prev) => ({ ...prev, sellerName: e.target.value }))}
                  placeholder="Full name"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Seller Phone *</label>
                <Input
                  value={formData.sellerPhone}
                  onChange={(e) => setFormData((prev) => ({ ...prev, sellerPhone: e.target.value }))}
                  placeholder="Phone number"
                  required
                />
              </div>
            </div>
          </div>

          <div className="border-t pt-4 space-y-4">
            <h4 className="text-sm font-semibold">Custody Intake</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Gross Weight (grams) *</label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.grossWeight}
                  onChange={(e) => setFormData((prev) => ({ ...prev, grossWeight: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Estimated Purity (%)</label>
                <Input
                  type="number"
                  step="0.01"
                  max="100"
                  value={formData.estimatedPurity}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, estimatedPurity: e.target.value }))
                  }
                  placeholder="Optional"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Storage Location *</label>
              <Input
                value={formData.storageLocation}
                onChange={(e) => setFormData((prev) => ({ ...prev, storageLocation: e.target.value }))}
                placeholder="e.g., Safe 1, Vault A"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SearchableSelect
                label="Receiver 1 *"
                value={formData.receiver1Id || undefined}
                options={employeeOptions}
                placeholder={employeesLoading ? "Loading employees..." : "Select employee"}
                searchPlaceholder="Search employees..."
                onValueChange={handleSelectChange("receiver1Id")}
                onAddOption={() => {
                  router.push("/human-resources")
                }}
                addLabel="Add employee"
              />
              <SearchableSelect
                label="Receiver 2 *"
                value={formData.receiver2Id || undefined}
                options={employeeOptions}
                placeholder={employeesLoading ? "Loading employees..." : "Select employee"}
                searchPlaceholder="Search employees..."
                onValueChange={handleSelectChange("receiver2Id")}
                onAddOption={() => {
                  router.push("/human-resources")
                }}
                addLabel="Add employee"
              />
            </div>
          </div>

          <div className="border-t pt-4 space-y-4">
            <h4 className="text-sm font-semibold">Payment Details</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Paid Amount *</label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.paidAmount}
                  onChange={(e) => setFormData((prev) => ({ ...prev, paidAmount: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Currency *</label>
                <Input
                  value={formData.currency}
                  onChange={(e) => setFormData((prev) => ({ ...prev, currency: e.target.value }))}
                  required
                />
              </div>
              <SearchableSelect
                label="Payment Method *"
                value={formData.paymentMethod}
                options={paymentMethods}
                placeholder="Select method"
                searchPlaceholder="Search methods..."
                onValueChange={handleSelectChange("paymentMethod")}
                onAddOption={handleAddPaymentMethod}
                addLabel="Add payment method"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Payment Channel</label>
                <Input
                  value={formData.paymentChannel}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, paymentChannel: e.target.value }))
                  }
                  placeholder="e.g., EcoCash, cash office"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Payment Reference</label>
                <Input
                  value={formData.paymentReference}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, paymentReference: e.target.value }))
                  }
                  placeholder="Reference ID"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">Notes</label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
              rows={2}
              placeholder="Optional notes about this purchase..."
            />
          </div>
        </CardContent>
      </Card>
    </FormShell>
  )
}
