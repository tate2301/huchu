"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { FormShell } from "@/components/shared/form-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { buildSavedRecordRedirect } from "@/lib/saved-record";
import { goldRoutes } from "@/app/gold/routes";
import { Send, Shield, ChevronDown } from "@/lib/icons";
import { SearchableSelect } from "@/app/gold/components/searchable-select";
import { useReservedId } from "@/hooks/use-reserved-id";

type PourFormValues = {
  pourDate: string;
  siteId: string;
  grossWeight: string;
  estimatedPurity: string;
  witness1Id: string;
  witness2Id: string;
  storageLocation: string;
  additionalExpensesWeight: string;
  additionalExpensesNote: string;
  notes: string;
};

const DEFAULT_VALUES: PourFormValues = {
  pourDate: "",
  siteId: "",
  grossWeight: "",
  estimatedPurity: "",
  witness1Id: "",
  witness2Id: "",
  storageLocation: "Vault",
  additionalExpensesWeight: "",
  additionalExpensesNote: "",
  notes: "",
};

export function PourForm({
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
  cancelHref?: string;
  employees: Array<{ id: string; name: string; employeeId: string }>;
  employeesLoading: boolean;
  sites: Array<{
    id: string;
    name: string;
    code: string;
    location?: string | null;
  }>;
  sitesLoading: boolean;
  mode?: "page" | "modal";
  onSuccess?: () => void;
  onCancel?: () => void;
  redirectOnSuccess?: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [formData, setFormData] = useState<PourFormValues>(() => ({
    ...DEFAULT_VALUES,
    pourDate: (() => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); })(),
  }));
  const [moreOpen, setMoreOpen] = useState(false);
  const {
    reservedId: reservedPourBarId,
    isReserving: reservingPourBarId,
    error: reservePourBarIdError,
  } = useReservedId({ entity: "GOLD_POUR", enabled: true });
  const shouldRedirect = redirectOnSuccess ?? mode === "page";

  // Auto-open the disclosure if any optional field has been filled.
  useEffect(() => {
    if (
      !moreOpen &&
      (formData.estimatedPurity ||
        formData.additionalExpensesWeight ||
        formData.additionalExpensesNote ||
        formData.notes)
    ) {
      setMoreOpen(true);
    }
  }, [
    formData.estimatedPurity,
    formData.additionalExpensesWeight,
    formData.additionalExpensesNote,
    formData.notes,
    moreOpen,
  ]);

  const handleSelectChange =
    (field: keyof PourFormValues) => (value: string) => {
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

  // Auto-pick site if there is exactly one. Removes a click for single-site mines.
  useEffect(() => {
    if (!formData.siteId && sites.length === 1) {
      setFormData((prev) => ({ ...prev, siteId: sites[0].id }));
    }
  }, [sites, formData.siteId]);

  const createPourMutation = useMutation({
    mutationFn: async (payload: {
      pourBarId: string;
      siteId: string;
      pourDate: string;
      grossWeight: number;
      estimatedPurity?: number;
      witness1Id: string;
      witness2Id: string;
      storageLocation: string;
      additionalExpensesWeight?: number;
      additionalExpensesNote?: string;
      notes?: string;
    }) =>
      fetchJson<{ id: string; createdAt?: string }>("/api/gold/pours", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (pour, payload) => {
      toast({
        title: "Batch saved",
        description: "Ready for dispatch.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["gold-pours"] });
      onSuccess?.();
      if (shouldRedirect) {
        const destination = buildSavedRecordRedirect(goldRoutes.intake.pours, {
          createdId: pour.id,
          createdAt: pour.createdAt ?? payload.pourDate,
          source: "gold-pour",
        });
        router.push(destination);
      }
    },
  });

  const grossWeightValue = Number(formData.grossWeight);
  const estimatedPurityValue = formData.estimatedPurity
    ? Number(formData.estimatedPurity)
    : undefined;
  const additionalExpensesWeightValue = formData.additionalExpensesWeight
    ? Number(formData.additionalExpensesWeight)
    : undefined;

  const canSubmit =
    !!reservedPourBarId &&
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
        description: "Fill site, weight, and both witnesses to save.",
        variant: "destructive",
      });
      return;
    }
    if (formData.witness1Id === formData.witness2Id) {
      toast({
        title: "Witnesses must differ",
        description: "Select two different employees.",
        variant: "destructive",
      });
      return;
    }
    if (!reservedPourBarId) {
      toast({
        title: "Unable to reserve batch ID",
        description:
          reservePourBarIdError ?? "Please wait for batch ID reservation.",
        variant: "destructive",
      });
      return;
    }
    createPourMutation.mutate({
      pourBarId: reservedPourBarId,
      siteId: formData.siteId,
      pourDate: formData.pourDate,
      grossWeight: grossWeightValue,
      estimatedPurity: estimatedPurityValue,
      witness1Id: formData.witness1Id,
      witness2Id: formData.witness2Id,
      storageLocation: formData.storageLocation.trim() || "Vault",
      additionalExpensesWeight: additionalExpensesWeightValue,
      additionalExpensesNote:
        formData.additionalExpensesNote?.trim() || undefined,
      notes: formData.notes?.trim() || undefined,
    });
  };

  return (
    <FormShell
      variant={mode === "modal" ? "bare" : "page"}
      title={mode === "modal" ? undefined : "Record Batch"}
      onSubmit={handleSubmit}
      formClassName="space-y-5"
      requiredHint="Fields marked * are required."
      errors={
        createPourMutation.error
          ? [getApiErrorMessage(createPourMutation.error)]
          : undefined
      }
      errorTitle="Could not save batch"
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (mode === "modal") {
                onCancel?.();
                return;
              }
              router.push(cancelHref ?? goldRoutes.intake.pours);
            }}
            className="flex-1 sm:flex-none"
          >
            {mode === "modal" ? "Cancel" : "Back"}
          </Button>
          <Button
            type="submit"
            size="lg"
            disabled={
              !canSubmit || createPourMutation.isPending || reservingPourBarId
            }
            className="flex-1 sm:flex-none"
          >
            <Send className="mr-2 h-5 w-5" />
            {createPourMutation.isPending ? "Saving..." : "Save Batch"}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted-foreground">
        Batch ID is auto-generated. Fill the basics — purity, storage and notes
        live under <strong>More details</strong>.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SearchableSelect
          label="Site *"
          value={formData.siteId || undefined}
          options={siteOptions}
          placeholder={sitesLoading ? "Loading sites..." : "Pick a site"}
          searchPlaceholder="Search sites..."
          onValueChange={handleSelectChange("siteId")}
        />
        <div>
          <label className="block text-sm font-semibold mb-2">
            Gross Weight (g) *
          </label>
          <Input
            autoFocus
            type="number"
            step="0.01"
            inputMode="decimal"
            value={formData.grossWeight}
            onChange={(e) =>
              setFormData({ ...formData, grossWeight: e.target.value })
            }
            placeholder="e.g. 12.50"
            required
          />
        </div>
      </div>

      <div className="rounded-md border bg-muted/30 px-4 py-3">
        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Shield className="h-4 w-4 text-yellow-600" />
          Two-Person Witness *
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SearchableSelect
            label="Witness 1"
            value={formData.witness1Id || undefined}
            options={employeeOptions}
            placeholder={
              employeesLoading ? "Loading..." : "Pick a clerk or manager"
            }
            searchPlaceholder="Search..."
            onValueChange={handleSelectChange("witness1Id")}
          />
          <div>
            <SearchableSelect
              label="Witness 2"
              value={formData.witness2Id || undefined}
              options={employeeOptions}
              placeholder={
                employeesLoading ? "Loading..." : "Pick a clerk or manager"
              }
              searchPlaceholder="Search..."
              onValueChange={handleSelectChange("witness2Id")}
            />
            {formData.witness1Id && formData.witness2Id && formData.witness1Id === formData.witness2Id ? (
              <p className="mt-1 text-xs text-destructive">Witnesses must be different people.</p>
            ) : null}
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold mb-2">
          Pour Date / Time
        </label>
        <Input
          type="datetime-local"
          value={formData.pourDate}
          onChange={(e) =>
            setFormData({ ...formData, pourDate: e.target.value })
          }
        />
      </div>

      <details
        className="group rounded-md border bg-card transition-all"
        open={moreOpen}
        onToggle={(e) => setMoreOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className="flex cursor-pointer select-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold">
          <span>More details</span>
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-4 px-4 pb-4 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-2">
                Estimated Purity (%)
              </label>
              <Input
                type="number"
                step="0.01"
                max="100"
                value={formData.estimatedPurity}
                onChange={(e) =>
                  setFormData({ ...formData, estimatedPurity: e.target.value })
                }
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">
                Storage Location
              </label>
              <Input
                value={formData.storageLocation}
                onChange={(e) =>
                  setFormData({ ...formData, storageLocation: e.target.value })
                }
                placeholder="e.g. Vault, Safe 1"
              />
            </div>
          </div>

          <div className="rounded-md border bg-muted/20 px-3 py-3">
            <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Additional Expenses
            </h5>
            <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-3">
              <div>
                <label className="block text-xs font-medium mb-1.5">
                  Weight (g)
                </label>
                <Input
                  type="number"
                  step="0.001"
                  inputMode="decimal"
                  value={formData.additionalExpensesWeight}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      additionalExpensesWeight: e.target.value,
                    })
                  }
                  placeholder="0.000"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5">
                  Note
                </label>
                <Input
                  value={formData.additionalExpensesNote}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      additionalExpensesNote: e.target.value,
                    })
                  }
                  placeholder="e.g. fuel & food deduction"
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
              placeholder="Anything unusual about this batch..."
            />
          </div>
        </div>
      </details>
    </FormShell>
  );
}
