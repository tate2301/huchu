"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
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
import { SearchableSelect } from "@/app/gold/components/searchable-select";
import { Send, Shield } from "lucide-react";

export function DispatchForm({
  setViewMode,
  employees,
  employeesLoading,
  availablePours,
}: {
  setViewMode: (mode: "menu" | "pour" | "dispatch" | "receipt" | "reconciliation" | "audit") => void;
  employees: Array<{ id: string; name: string; employeeId: string }>;
  employeesLoading: boolean;
  availablePours: Array<{
    id: string;
    pourBarId: string;
    grossWeight: number;
    site: { name: string; code: string };
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
        label: pour.pourBarId,
        description: `${pour.site.name} (${pour.site.code})`,
        meta: `${pour.grossWeight} g`,
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
      notes?: string;
    }) =>
      fetchJson("/api/gold/dispatches", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: "Dispatch recorded",
        description: "Chain of custody opened for this gold pour.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["gold-dispatches"] });
      setViewMode("menu");
    },
  });

  const canSubmit =
    !!formData.goldPourId &&
    !!formData.dispatchDate &&
    !!formData.courier &&
    !!formData.destination &&
    !!formData.sealNumbers &&
    !!formData.handedOverById;

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
      notes: formData.notes?.trim() || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Button type="button" variant="outline" onClick={() => setViewMode("menu")}>
        Back to Menu
      </Button>

      {createDispatchMutation.error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to record dispatch</AlertTitle>
          <AlertDescription>{getApiErrorMessage(createDispatchMutation.error)}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Shield className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <strong className="block mb-1">Chain of Custody</strong>
              <p className="text-foreground">
                This manifest creates an immutable record of gold transfer. Both
                sender and receiver signatures required.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dispatch Details</CardTitle>
          <CardDescription>All fields required for dispatch manifest</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {availablePours.length === 0 ? (
            <Alert>
              <AlertTitle>No pours ready for dispatch</AlertTitle>
              <AlertDescription>
                Record a gold pour before creating a dispatch manifest.
              </AlertDescription>
            </Alert>
          ) : null}
          <SearchableSelect
            label="Pour/Bar ID *"
            value={formData.goldPourId || undefined}
            options={pourOptions}
            placeholder={
              availablePours.length === 0 ? "No pours available" : "Select pour"
            }
            searchPlaceholder="Search pours..."
            onValueChange={handleSelectChange("goldPourId")}
            onAddOption={() => setViewMode("pour")}
            addLabel="Record new pour"
          />
          <p className="text-xs text-muted-foreground">
            Dispatch ID is generated automatically once the manifest is saved.
          </p>

          <div>
            <label className="block text-sm font-medium mb-2">
              Dispatch Date/Time *
            </label>
            <Input
              type="datetime-local"
              value={formData.dispatchDate}
              onChange={(e) => setFormData({ ...formData, dispatchDate: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Courier/Company *
              </label>
              <Input
                value={formData.courier}
                onChange={(e) => setFormData({ ...formData, courier: e.target.value })}
                placeholder="e.g., SecureTransit Ltd"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Vehicle/Registration
              </label>
              <Input
                value={formData.vehicle}
                onChange={(e) => setFormData({ ...formData, vehicle: e.target.value })}
                placeholder="e.g., ABC-1234"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Destination *</label>
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
            <label className="block text-sm font-medium mb-2">Seal Numbers *</label>
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
            <h4 className="text-sm font-medium mb-3">Handover Details</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SearchableSelect
                label="Handed Over By *"
                value={formData.handedOverById || undefined}
                options={employeeOptions}
                placeholder={employeesLoading ? "Loading employees..." : "Select employee"}
                searchPlaceholder="Search employees..."
                onValueChange={handleSelectChange("handedOverById")}
                onAddOption={() => {
                  router.push("/human-resources");
                }}
                addLabel="Add employee"
              />

              <div>
                <label className="block text-sm font-medium mb-2">Received By</label>
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
            <label className="block text-sm font-medium mb-2">Notes</label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
              placeholder="Additional dispatch notes..."
            />
          </div>
        </CardContent>
      </Card>

      <Button type="submit" className="w-full" size="lg" disabled={!canSubmit}>
        <Send className="mr-2 h-5 w-5" />
        {createDispatchMutation.isPending ? "Recording..." : "Create Dispatch Manifest"}
      </Button>
    </form>
  );
}
