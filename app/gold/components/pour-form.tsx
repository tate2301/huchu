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
import { Send, Shield } from "lucide-react";
import { SearchableSelect } from "@/app/gold/components/searchable-select";

export function PourForm({
  setViewMode,
  employees,
  employeesLoading,
  sites,
  sitesLoading,
}: {
  setViewMode: (mode: "menu" | "pour" | "dispatch" | "receipt" | "reconciliation" | "audit") => void;
  employees: Array<{ id: string; name: string; employeeId: string }>;
  employeesLoading: boolean;
  sites: Array<{ id: string; name: string; code: string; location?: string | null }>;
  sitesLoading: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [formData, setFormData] = useState({
    pourBarId: "",
    pourDate: new Date().toISOString().slice(0, 16),
    siteId: "",
    grossWeight: "",
    estimatedPurity: "",
    witness1Id: "",
    witness2Id: "",
    storageLocation: "",
    notes: "",
  });

  const handleSelectChange =
    (field: keyof typeof formData) => (value: string) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
    };

  const siteOptions = useMemo(
    () =>
      sites.map((site) => ({
        value: site.id,
        label: site.name,
        description: site.location ?? undefined,
        meta: site.code,
      })),
    [sites],
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

  const createPourMutation = useMutation({
    mutationFn: async (payload: {
      siteId: string;
      pourBarId: string;
      pourDate: string;
      grossWeight: number;
      estimatedPurity?: number;
      witness1Id: string;
      witness2Id: string;
      storageLocation: string;
      notes?: string;
    }) =>
      fetchJson("/api/gold/pours", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: "Gold pour recorded",
        description: "Pour saved and ready for dispatch.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["gold-pours"] });
      setViewMode("menu");
    },
  });

  const grossWeightValue = Number(formData.grossWeight);
  const estimatedPurityValue = formData.estimatedPurity
    ? Number(formData.estimatedPurity)
    : undefined;
  const canSubmit =
    !!formData.pourBarId &&
    !!formData.pourDate &&
    !!formData.siteId &&
    !!formData.witness1Id &&
    !!formData.witness2Id &&
    !!formData.storageLocation &&
    grossWeightValue > 0 &&
    !Number.isNaN(grossWeightValue);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      toast({
        title: "Missing details",
        description: "Fill all required pour details before saving.",
        variant: "destructive",
      });
      return;
    }
    if (formData.witness1Id === formData.witness2Id) {
      toast({
        title: "Witnesses must differ",
        description: "Select two different employees for witness validation.",
        variant: "destructive",
      });
      return;
    }
    createPourMutation.mutate({
      siteId: formData.siteId,
      pourBarId: formData.pourBarId.trim(),
      pourDate: formData.pourDate,
      grossWeight: grossWeightValue,
      estimatedPurity: estimatedPurityValue,
      witness1Id: formData.witness1Id,
      witness2Id: formData.witness2Id,
      storageLocation: formData.storageLocation.trim(),
      notes: formData.notes?.trim() || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Button type="button" variant="outline" onClick={() => setViewMode("menu")}>
        Back to Menu
      </Button>

      {createPourMutation.error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to record pour</AlertTitle>
          <AlertDescription>{getApiErrorMessage(createPourMutation.error)}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Pour Details</CardTitle>
          <CardDescription>All fields required for gold pour record</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Pour/Bar ID *</label>
              <Input
                value={formData.pourBarId}
                onChange={(e) => setFormData({ ...formData, pourBarId: e.target.value })}
                placeholder="Auto-generated in production"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Pour Date/Time *</label>
              <Input
                type="datetime-local"
                value={formData.pourDate}
                onChange={(e) => setFormData({ ...formData, pourDate: e.target.value })}
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
              });
            }}
            addLabel="Request new site"
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Gross Weight (grams) *
              </label>
              <Input
                type="number"
                step="0.01"
                value={formData.grossWeight}
                onChange={(e) => setFormData({ ...formData, grossWeight: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Estimated Purity (%)
              </label>
              <Input
                type="number"
                step="0.01"
                max="100"
                value={formData.estimatedPurity}
                onChange={(e) => setFormData({ ...formData, estimatedPurity: e.target.value })}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Shield className="h-4 w-4 text-yellow-600" />
              2-Person Witness Rule
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SearchableSelect
                label="Witness 1 *"
                value={formData.witness1Id || undefined}
                options={employeeOptions}
                placeholder={employeesLoading ? "Loading employees..." : "Select employee"}
                searchPlaceholder="Search employees..."
                onValueChange={handleSelectChange("witness1Id")}
                onAddOption={() => {
                  router.push("/human-resources");
                }}
                addLabel="Add employee"
              />

              <SearchableSelect
                label="Witness 2 *"
                value={formData.witness2Id || undefined}
                options={employeeOptions}
                placeholder={employeesLoading ? "Loading employees..." : "Select employee"}
                searchPlaceholder="Search employees..."
                onValueChange={handleSelectChange("witness2Id")}
                onAddOption={() => {
                  router.push("/human-resources");
                }}
                addLabel="Add employee"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Storage Location *</label>
            <Input
              value={formData.storageLocation}
              onChange={(e) => setFormData({ ...formData, storageLocation: e.target.value })}
              placeholder="e.g., Safe 1, Vault A"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Notes</label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
              placeholder="Additional observations..."
            />
          </div>
        </CardContent>
      </Card>

      <Button type="submit" className="w-full" size="lg" disabled={!canSubmit}>
        <Send className="mr-2 h-5 w-5" />
        {createPourMutation.isPending ? "Recording..." : "Record Pour (Immutable)"}
      </Button>
    </form>
  );
}
