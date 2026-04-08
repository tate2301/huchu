"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ScrapShell } from "@/components/scrap-metal/scrap-shell";
import { StatusState } from "@/components/shared/status-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/ui/data-table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

type ComplianceScope = "INBOUND" | "OUTBOUND" | "BOTH";
type ComplianceRule = {
  id: string;
  name: string;
  scope: ComplianceScope;
  materialId?: string | null;
  category?: string | null;
  requirePhotos: boolean;
  requirePaymentMethod: boolean;
  requirePaymentReference: boolean;
  requireNotes: boolean;
  isActive: boolean;
  material?: { id: string; code: string; name: string; category: string } | null;
  createdAt: string;
  updatedAt: string;
};

type Material = { id: string; code: string; name: string; category: string };

type RuleForm = {
  name: string;
  scope: ComplianceScope;
  materialId: string;
  category: string;
  requirePhotos: boolean;
  requirePaymentMethod: boolean;
  requirePaymentReference: boolean;
  requireNotes: boolean;
  isActive: boolean;
};

const CATEGORY_OPTIONS = ["BATTERIES", "COPPER", "ALUMINUM", "STEEL", "BRASS", "MIXED", "OTHER"];

function emptyRuleForm(): RuleForm {
  return {
    name: "",
    scope: "BOTH",
    materialId: "__any",
    category: "__any",
    requirePhotos: false,
    requirePaymentMethod: false,
    requirePaymentReference: false,
    requireNotes: false,
    isActive: true,
  };
}

export default function ScrapComplianceRulesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ComplianceRule | null>(null);
  const [form, setForm] = useState<RuleForm>(emptyRuleForm);

  const rulesQuery = useQuery({
    queryKey: ["scrap-compliance-rules"],
    queryFn: async () => {
      const response = await fetchJson<{ data: ComplianceRule[] }>("/api/scrap-metal/compliance-rules?active=false&limit=300");
      return response.data;
    },
  });

  const materialsQuery = useQuery({
    queryKey: ["scrap-materials", "compliance-rules"],
    queryFn: async () => {
      const response = await fetchJson<{ data: Material[] }>("/api/scrap-metal/materials?active=true&limit=500");
      return response.data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: RuleForm) => {
      const body = {
        name: payload.name,
        scope: payload.scope,
        materialId: payload.materialId === "__any" ? null : payload.materialId,
        category: payload.category === "__any" ? null : payload.category,
        requirePhotos: payload.requirePhotos,
        requirePaymentMethod: payload.requirePaymentMethod,
        requirePaymentReference: payload.requirePaymentReference,
        requireNotes: payload.requireNotes,
        isActive: payload.isActive,
      };

      if (editing) {
        return fetchJson(`/api/scrap-metal/compliance-rules/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      }

      return fetchJson("/api/scrap-metal/compliance-rules", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      toast({ title: editing ? "Compliance rule updated" : "Compliance rule created", variant: "success" });
      setFormOpen(false);
      setEditing(null);
      setForm(emptyRuleForm());
      queryClient.invalidateQueries({ queryKey: ["scrap-compliance-rules"] });
    },
    onError: (error) => {
      toast({
        title: editing ? "Unable to update compliance rule" : "Unable to create compliance rule",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/scrap-metal/compliance-rules/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Compliance rule removed", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["scrap-compliance-rules"] });
    },
    onError: (error) => {
      toast({ title: "Unable to remove rule", description: getApiErrorMessage(error), variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (row: ComplianceRule) =>
      fetchJson(`/api/scrap-metal/compliance-rules/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !row.isActive }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scrap-compliance-rules"] });
    },
    onError: (error) => {
      toast({ title: "Unable to toggle rule", description: getApiErrorMessage(error), variant: "destructive" });
    },
  });

  const columns = useMemo<ColumnDef<ComplianceRule>[]>(
    () => [
      { id: "name", header: "Rule", accessorKey: "name" },
      {
        id: "scope",
        header: "Scope",
        cell: ({ row }) => <Badge variant="outline">{row.original.scope}</Badge>,
      },
      {
        id: "material",
        header: "Material / Category",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.material?.name ?? "Any material"}</div>
            <div className="text-xs text-muted-foreground">{row.original.category ?? "Any category"}</div>
          </div>
        ),
      },
      {
        id: "required",
        header: "Required Fields",
        cell: ({ row }) => {
          const parts = [
            row.original.requirePhotos ? "Photos" : null,
            row.original.requirePaymentMethod ? "Payment Method" : null,
            row.original.requirePaymentReference ? "Payment Reference" : null,
            row.original.requireNotes ? "Notes" : null,
          ].filter(Boolean);
          return <span className="text-xs">{parts.length ? parts.join(", ") : "None"}</span>;
        },
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) =>
          row.original.isActive ? <Badge>Active</Badge> : <Badge variant="outline">Inactive</Badge>,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditing(row.original);
                setForm({
                  name: row.original.name,
                  scope: row.original.scope,
                  materialId: row.original.materialId ?? "__any",
                  category: row.original.category ?? "__any",
                  requirePhotos: row.original.requirePhotos,
                  requirePaymentMethod: row.original.requirePaymentMethod,
                  requirePaymentReference: row.original.requirePaymentReference,
                  requireNotes: row.original.requireNotes,
                  isActive: row.original.isActive,
                });
                setFormOpen(true);
              }}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={toggleMutation.isPending}
              onClick={() => toggleMutation.mutate(row.original)}
            >
              {row.original.isActive ? "Disable" : "Enable"}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate(row.original.id)}
            >
              Delete
            </Button>
          </div>
        ),
      },
    ],
    [deleteMutation, toggleMutation],
  );

  if (rulesQuery.error) {
    return (
      <ScrapShell title="Compliance Rules">
        <StatusState variant="error" title="Unable to load compliance rules" description={getApiErrorMessage(rulesQuery.error)} />
      </ScrapShell>
    );
  }

  return (
    <>
      <ScrapShell
        title="Compliance Rules"
        description="Define required fields for inbound and outbound tickets by scope, material, and category."
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setForm(emptyRuleForm());
              setFormOpen(true);
            }}
          >
            New Rule
          </Button>
        }
      >
        <DataTable
          data={rulesQuery.data ?? []}
          columns={columns}
          searchPlaceholder="Search compliance rules"
          pagination={{ enabled: true }}
          emptyState={rulesQuery.isLoading ? "Loading compliance rules..." : "No compliance rules configured."}
        />
      </ScrapShell>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Compliance Rule" : "New Compliance Rule"}</DialogTitle>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!form.name.trim()) {
                toast({ title: "Rule name is required", variant: "destructive" });
                return;
              }
              saveMutation.mutate(form);
            }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-semibold">Rule Name</label>
                <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">Scope</label>
                <Select value={form.scope} onValueChange={(value) => setForm((current) => ({ ...current, scope: value as ComplianceScope }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BOTH">Inbound + Outbound</SelectItem>
                    <SelectItem value="INBOUND">Inbound only</SelectItem>
                    <SelectItem value="OUTBOUND">Outbound only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-semibold">Material</label>
                <Select
                  value={form.materialId}
                  onValueChange={(value) => {
                    const material = (materialsQuery.data ?? []).find((row) => row.id === value);
                    setForm((current) => ({
                      ...current,
                      materialId: value,
                      category: material ? material.category : current.category,
                    }));
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any">Any material</SelectItem>
                    {(materialsQuery.data ?? []).map((material) => (
                      <SelectItem key={material.id} value={material.id}>
                        {material.code} - {material.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">Category</label>
                <Select value={form.category} onValueChange={(value) => setForm((current) => ({ ...current, category: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any">Any category</SelectItem>
                    {CATEGORY_OPTIONS.map((category) => (
                      <SelectItem key={category} value={category}>{category}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border p-3">
              <div className="text-sm font-semibold">Required fields</div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.requirePhotos} onCheckedChange={(checked) => setForm((current) => ({ ...current, requirePhotos: Boolean(checked) }))} />
                Photos
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.requirePaymentMethod} onCheckedChange={(checked) => setForm((current) => ({ ...current, requirePaymentMethod: Boolean(checked) }))} />
                Payment method
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.requirePaymentReference} onCheckedChange={(checked) => setForm((current) => ({ ...current, requirePaymentReference: Boolean(checked) }))} />
                Payment reference
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.requireNotes} onCheckedChange={(checked) => setForm((current) => ({ ...current, requireNotes: Boolean(checked) }))} />
                Notes
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.isActive} onCheckedChange={(checked) => setForm((current) => ({ ...current, isActive: Boolean(checked) }))} />
                Active
              </label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : editing ? "Save Changes" : "Create Rule"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

