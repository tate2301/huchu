"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MasterDataShell } from "@/components/management/master-data/master-data-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/components/ui/use-toast";
import {
  createDowntimeCode,
  deleteDowntimeCode,
  fetchDowntimeCodes,
  fetchSitesList,
  type DowntimeCode,
  updateDowntimeCode,
} from "@/lib/api";
import { getApiErrorMessage, resolveDisplayErrorMessage } from "@/lib/api-client";
import { Pencil, Plus, Trash2 } from "@/lib/icons";
import { useReservedId } from "@/hooks/use-reserved-id";

type DowntimeCodeFormState = {
  code: string;
  description: string;
  siteId: string;
  sortOrder: string;
  isActive: boolean;
};

const emptyForm: DowntimeCodeFormState = {
  code: "",
  description: "",
  siteId: "",
  sortOrder: "0",
  isActive: true,
};

const GLOBAL_SENTINEL = "__global__";

export default function DowntimeCodesManagementPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DowntimeCode | null>(null);
  const [formState, setFormState] = useState<DowntimeCodeFormState>(emptyForm);
  const downtimeSiteId =
    !editing && formState.siteId && formState.siteId !== GLOBAL_SENTINEL
      ? formState.siteId
      : undefined;
  const {
    reservedId,
    isReserving,
    error: reserveError,
  } = useReservedId({
    entity: "DOWNTIME_CODE",
    siteId: downtimeSiteId,
    enabled: formOpen && !editing && Boolean(downtimeSiteId),
  });
  const resolvedCode = editing ? formState.code : reservedId;

  const { data, isLoading, error } = useQuery({
    queryKey: ["management", "master-data", "downtime-codes"],
    queryFn: () => fetchDowntimeCodes({ active: "all" }),
  });
  const loadErrorMessage = resolveDisplayErrorMessage([error]);

  const { data: sitesData } = useQuery({
    queryKey: ["management", "master-data", "sites-options", "downtime"],
    queryFn: () => fetchSitesList({ active: true }),
  });

  const rows = data ?? [];
  const sites = sitesData ?? [];

  const createMutation = useMutation({
    mutationFn: createDowntimeCode,
    onSuccess: () => {
      toast({
        title: "Downtime code created",
        description: "Downtime code record created.",
        variant: "success",
      });
      setFormOpen(false);
      setFormState(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["management", "master-data", "downtime-codes"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to create downtime code",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; input: Parameters<typeof updateDowntimeCode>[1] }) =>
      updateDowntimeCode(payload.id, payload.input),
    onSuccess: () => {
      toast({
        title: "Downtime code updated",
        description: "Downtime code record updated.",
        variant: "success",
      });
      setFormOpen(false);
      setEditing(null);
      setFormState(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["management", "master-data", "downtime-codes"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to update downtime code",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDowntimeCode,
    onSuccess: () => {
      toast({
        title: "Downtime code record archived",
        description: "Downtime code record archived.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["management", "master-data", "downtime-codes"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to archive downtime code",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const columns = useMemo<ColumnDef<DowntimeCode>[]>(
    () => [
      {
        id: "code",
        header: "Code",
        cell: ({ row }) => <span className="font-mono">{row.original.code}</span>,
        size: 112,
        minSize: 112,
        maxSize: 112},
      {
        id: "description",
        header: "Description",
        accessorKey: "description",
        size: 260,
        minSize: 200,
        maxSize: 360},
      {
        id: "site",
        header: "Site",
        cell: ({ row }) => {
          if (!row.original.siteId) return "Global default";
          if (!row.original.site) return "Site unavailable";
          return `${row.original.site.code} - ${row.original.site.name}`;
        },
        size: 280,
        minSize: 220,
        maxSize: 420},
      {
        id: "sortOrder",
        header: "Sort",
        cell: ({ row }) => row.original.sortOrder,
        size: 160,
        minSize: 160,
        maxSize: 160},
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "secondary" : "outline"}>
            {row.original.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
        size: 120,
        minSize: 120,
        maxSize: 120},
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => {
                setEditing(row.original);
                setFormState({
                  code: row.original.code,
                  description: row.original.description,
                  siteId: row.original.siteId ?? GLOBAL_SENTINEL,
                  sortOrder: String(row.original.sortOrder),
                  isActive: Boolean(row.original.isActive),
                });
                setFormOpen(true);
              }}
            >
              <Pencil className="size-4" />
            </Button>
            {row.original.isActive ? (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  if (window.confirm("Confirm archival of this downtime code.")) {
                    deleteMutation.mutate(row.original.id);
                  }
                }}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="size-4" />
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  updateMutation.mutate({ id: row.original.id, input: { isActive: true } })
                }
                disabled={updateMutation.isPending}
              >
                Set Active
              </Button>
            )}
          </div>
        ),
        size: 108,
        minSize: 108,
        maxSize: 108},
    ],
    [deleteMutation, updateMutation],
  );

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault();
    if (!formState.description.trim()) {
      toast({
        title: "Incomplete form",
        description: "Downtime description is required.",
        variant: "destructive",
      });
      return;
    }

    const sortOrder = Number(formState.sortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      toast({
        title: "Invalid sort order",
        description: "Sort order must be a non-negative whole number.",
        variant: "destructive",
      });
      return;
    }

    if (!formState.siteId) {
      toast({
        title: "Site selection required",
        description: "A site must be selected for this downtime code.",
        variant: "destructive",
      });
      return;
    }
    if (!editing && !resolvedCode.trim()) {
      toast({
        title: "Downtime code unavailable",
        description: reserveError ?? "Select a site and wait for code reservation.",
        variant: "destructive",
      });
      return;
    }

    const payload = {
      description: formState.description.trim(),
      siteId: formState.siteId === GLOBAL_SENTINEL ? null : formState.siteId,
      sortOrder,
      isActive: formState.isActive,
    };

    if (editing) {
      updateMutation.mutate({
        id: editing.id,
        input: payload,
      });
      return;
    }

    if (payload.siteId === null) {
      toast({
        title: "Site selection required",
        description: "Global downtime code creation is restricted.",
        variant: "destructive",
      });
      return;
    }

    createMutation.mutate({
      code: resolvedCode.trim(),
      description: payload.description,
      siteId: payload.siteId,
      sortOrder: payload.sortOrder,
      isActive: payload.isActive,
    });
  };

  return (
    <MasterDataShell
      activeTab="downtime-codes"
      title="Downtime Codes"
      description="Downtime code reference data for plant reporting."
      actions={
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setFormState({ ...emptyForm, siteId: sites[0]?.id ?? "" });
            setFormOpen(true);
          }}
        >
          <Plus className="mr-2 size-4" />
          New Downtime Code
        </Button>
      }
    >
      {loadErrorMessage ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load downtime codes</AlertTitle>
          <AlertDescription>{loadErrorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <DataTable
        data={rows}
        columns={columns}
        searchPlaceholder="Search downtime codes"
        searchSubmitLabel="Search"
        pagination={{ enabled: true }}
        emptyState={isLoading ? "Loading downtime code records..." : "No downtime code records available."}
      />

      <Sheet
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) {
            setEditing(null);
            setFormState(emptyForm);
          }
        }}
      >
        <SheetContent size="md" className="w-full p-6">
          <SheetHeader>
            <SheetTitle>{editing ? "Edit Downtime Code" : "New Downtime Code"}</SheetTitle>
            <SheetDescription>
              {editing
                ? "Update downtime code record details and status."
                : "Create a downtime code record for a site."}
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSave} className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold">Code *</label>
              <Input
                value={resolvedCode}
                readOnly
                placeholder={isReserving ? "Reserving code..." : "Auto-generated"}
                required
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {editing
                  ? "Downtime code cannot be changed."
                  : reserveError ?? "Code is generated automatically and cannot be edited."}
              </p>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Description *</label>
              <Input
                value={formState.description}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, description: event.target.value }))
                }
                placeholder="Mechanical breakdown"
                required
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Site *</label>
              <Select
                value={formState.siteId}
                onValueChange={(value) => setFormState((prev) => ({ ...prev, siteId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a site" />
                </SelectTrigger>
                <SelectContent>
                  {formState.siteId === GLOBAL_SENTINEL ? (
                    <SelectItem value={GLOBAL_SENTINEL}>Global default</SelectItem>
                  ) : null}
                  {sites.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.code} - {site.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Sort Order *</label>
              <Input
                type="number"
                min="0"
                step="1"
                value={formState.sortOrder}
                onChange={(event) => setFormState((prev) => ({ ...prev, sortOrder: event.target.value }))}
                required
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant={formState.isActive ? "secondary" : "outline"}
                onClick={() => setFormState((prev) => ({ ...prev, isActive: !prev.isActive }))}
              >
                {formState.isActive ? "Active" : "Inactive"}
              </Button>
              <Button type="submit" className="flex-1" disabled={createMutation.isPending || updateMutation.isPending || (!editing && (isReserving || !resolvedCode))}>
                {editing ? "Save Changes" : "Create Downtime Code"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </MasterDataShell>
  );
}
