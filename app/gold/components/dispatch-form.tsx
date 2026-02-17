"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { FieldHelp } from "@/components/shared/field-help";
import { FormShell } from "@/components/shared/form-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { buildSavedRecordRedirect } from "@/lib/saved-record";
import { goldRoutes } from "@/app/gold/routes";
import { SearchableSelect } from "@/app/gold/components/searchable-select";
import { Send, Shield } from "@/lib/icons";

export function DispatchForm({
  cancelHref,
  newBatchHref,
  employees,
  employeesLoading,
  availablePours,
}: {
  cancelHref?: string;
  newBatchHref?: string;
  employees: Array<{ id: string; name: string; employeeId: string }>;
  employeesLoading: boolean;
  availablePours: Array<{
    id: string;
    pourBarId: string;
    batchCode?: string;
    grossWeight: number;
    site: { name: string; code: string };
    dispatchCount: number;
  }>;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [formData, setFormData] = useState({
    goldPourId: "",
    dispatchDate: new Date().toISOString().slice(0, 16),
    courier: "",
    vehicle: "",
    destination: "",
    sealNumbers: "",
    handedOverById: "",
    receivedBy: "",
    overrideReason: "",
    notes: "",
  });

  const handleSelectChange =
    (field: keyof typeof formData) => (value: string) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
    };

  const pourOptions = useMemo(
    () =>
      availablePours.map((pour) => ({
        value: pour.id,
        label: pour.batchCode ?? pour.pourBarId,
        description: `${pour.site.name} (${pour.site.code}) - ${
          pour.dispatchCount > 0
            ? `${pour.dispatchCount} previous dispatch${pour.dispatchCount === 1 ? "" : "es"}`
            : "No previous dispatch"
        }`,
        meta: `${pour.grossWeight} g`,
        badgeVariant: (pour.dispatchCount > 0 ? "destructive" : "secondary") as "destructive" | "secondary",
      })),
    [availablePours],
  );
  const employeeOptions = useMemo(
    () =>
      employees.map((employee) => ({
        value: employee.id,
        label: employee.name,
        meta: employee.employeeId,
      })),
    [employees],
  );

  const createDispatchMutation = useMutation({
    mutationFn: async (payload: {
      goldPourId: string;
      dispatchDate: string;
      courier: string;
      vehicle?: string;
      destination: string;
      sealNumbers: string;
      handedOverById: string;
      receivedBy?: string;
      overrideReason?: string;
      notes?: string;
    }) =>
      fetchJson<{ id: string; createdAt?: string; warnings?: string[] }>("/api/gold/dispatches", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (dispatch, payload) => {
      toast({
        title: "Dispatch recorded",
        description:
          dispatch.warnings && dispatch.warnings.length > 0
            ? dispatch.warnings[0]
            : "Dispatch saved successfully.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["gold-dispatches"] });
      const destination = buildSavedRecordRedirect(goldRoutes.transit.dispatches, {
        createdId: dispatch.id,
        createdAt: dispatch.createdAt ?? payload.dispatchDate,
        source: "gold-dispatch",
      });
      router.push(destination);
    },
  });

  const selectedPour = availablePours.find((pour) => pour.id === formData.goldPourId);
  const requiresOverrideReason = (selectedPour?.dispatchCount ?? 0) > 0;

  const canSubmit =
    !!formData.goldPourId &&
    !!formData.dispatchDate &&
    !!formData.courier &&
    !!formData.destination &&
    !!formData.sealNumbers &&
    !!formData.handedOverById &&
    (!requiresOverrideReason || !!formData.overrideReason.trim());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      toast({
        title: "Missing details",
        description: "Fill all required dispatch fields before saving.",
        variant: "destructive",
      });
      return;
    }
    createDispatchMutation.mutate({
      goldPourId: formData.goldPourId,
      dispatchDate: formData.dispatchDate,
      courier: formData.courier.trim(),
      vehicle: formData.vehicle?.trim() || undefined,
      destination: formData.destination.trim(),
      sealNumbers: formData.sealNumbers.trim(),
      handedOverById: formData.handedOverById,
      receivedBy: formData.receivedBy?.trim() || undefined,
      overrideReason: formData.overrideReason?.trim() || undefined,
      notes: formData.notes?.trim() || undefined,
    });
  };

  return (
    <FormShell
      title="Dispatch Details"
      description="Capture full custody and transit details for this batch."
      onSubmit={handleSubmit}
      formClassName="space-y-6"
      requiredHint="Fields marked * are required. Submitting redirects to dispatch history with this record highlighted."
      errors={
        createDispatchMutation.error
          ? [getApiErrorMessage(createDispatchMutation.error)]
          : undefined
      }
      errorTitle="Unable to record dispatch"
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(cancelHref ?? goldRoutes.transit.dispatches)}
            className="flex-1 sm:flex-none"
          >
            Back to Dispatches
          </Button>
          <Button
            type="submit"
            size="lg"
            disabled={!canSubmit || createDispatchMutation.isPending}
            className="flex-1 sm:flex-none"
          >
            <Send className="mr-2 h-5 w-5" />
            {createDispatchMutation.isPending ? "Recording..." : "Save Dispatch"}
          </Button>
        </>
      }
    >
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Shield className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <strong className="block mb-1">Dispatch Record</strong>
              <p className="text-foreground">
                Save who sent the batch, who received it, and where it is going.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dispatch Details</CardTitle>
          <CardDescription>
            Fill all required fields.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {availablePours.length === 0 ? (
            <Alert>
              <AlertTitle>No batches ready for dispatch</AlertTitle>
              <AlertDescription>
                Record a batch before creating a dispatch.
              </AlertDescription>
            </Alert>
          ) : null}
          <SearchableSelect
            label="Select Batch *"
            value={formData.goldPourId || undefined}
            options={pourOptions}
            placeholder={
              availablePours.length === 0 ? "No batches available" : "Select batch"
            }
            searchPlaceholder="Search batches..."
            onValueChange={handleSelectChange("goldPourId")}
            onAddOption={() => router.push(newBatchHref ?? goldRoutes.intake.newPour)}
            addLabel="Record new batch"
          />
          <p className="text-xs text-muted-foreground">
            Dispatch ID is created automatically after save.
          </p>

          {requiresOverrideReason ? (
            <Alert>
              <AlertTitle>Batch already dispatched before</AlertTitle>
              <AlertDescription>
                This batch already has {selectedPour?.dispatchCount} dispatch
                record{selectedPour?.dispatchCount === 1 ? "" : "s"}.
                Enter a reason to continue.
              </AlertDescription>
            </Alert>
          ) : null}

          <div>
            <label className="block text-sm font-semibold mb-2">
              Dispatch Date/Time *
            </label>
            <Input
              type="datetime-local"
              value={formData.dispatchDate}
              onChange={(e) =>
                setFormData({ ...formData, dispatchDate: e.target.value })
              }
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-2">
                Courier/Company *
              </label>
              <Input
                value={formData.courier}
                onChange={(e) =>
                  setFormData({ ...formData, courier: e.target.value })
                }
                placeholder="e.g., SecureTransit Ltd"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">
                Vehicle/Registration
              </label>
              <Input
                value={formData.vehicle}
                onChange={(e) =>
                  setFormData({ ...formData, vehicle: e.target.value })
                }
                placeholder="e.g., ABC-1234"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">
              Destination *
            </label>
            <Input
              value={formData.destination}
              onChange={(e) =>
                setFormData({ ...formData, destination: e.target.value })
              }
              placeholder="Buyer name and address"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">
              Seal Numbers *
            </label>
            <Input
              value={formData.sealNumbers}
              onChange={(e) =>
                setFormData({ ...formData, sealNumbers: e.target.value })
              }
              placeholder="e.g., S-12345, S-12346"
              required
            />
          </div>

          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold mb-3">Handover Details</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SearchableSelect
                label="Handed Over By *"
                value={formData.handedOverById || undefined}
                options={employeeOptions}
                placeholder={
                  employeesLoading ? "Loading employees..." : "Select employee"
                }
                searchPlaceholder="Search employees..."
                onValueChange={handleSelectChange("handedOverById")}
                onAddOption={() => {
                  router.push("/human-resources");
                }}
                addLabel="Add employee"
              />

              <div>
                <label className="block text-sm font-semibold mb-2">
                  Received By
                </label>
                <Input
                  value={formData.receivedBy}
                  onChange={(e) =>
                    setFormData({ ...formData, receivedBy: e.target.value })
                  }
                  placeholder="Courier name"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">Notes</label>
            <Textarea
              value={formData.notes}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              rows={2}
              placeholder="Additional dispatch notes..."
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">
              Override Reason {requiresOverrideReason ? "*" : "(optional)"}
            </label>
            <Textarea
              value={formData.overrideReason}
              onChange={(e) =>
                setFormData({ ...formData, overrideReason: e.target.value })
              }
              rows={2}
              placeholder={
                requiresOverrideReason
                  ? "Explain why another dispatch is needed for this batch."
                  : "Only required if this batch already has a dispatch record."
              }
            />
            {requiresOverrideReason && !formData.overrideReason.trim() ? (
              <p className="mt-1 text-xs text-destructive">
                Override reason is required for already-dispatched batches.
              </p>
            ) : null}
            <FieldHelp hint="Provide override reason whenever a batch already has a previous dispatch." />
          </div>
        </CardContent>
      </Card>
    </FormShell>
  );
}
