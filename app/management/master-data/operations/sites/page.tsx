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
import { createSite, deleteSite, fetchSitesList, type Site, updateSite } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { Pencil, Plus, Trash2 } from "@/lib/icons";

type SiteFormState = {
  name: string;
  code: string;
  location: string;
  measurementUnit: "tonnes" | "trips" | "wheelbarrows";
  isActive: boolean;
};

const emptyForm: SiteFormState = {
  name: "",
  code: "",
  location: "",
  measurementUnit: "tonnes",
  isActive: true,
};

export default function SitesManagementPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Site | null>(null);
  const [formState, setFormState] = useState<SiteFormState>(emptyForm);

  const { data, isLoading, error } = useQuery({
    queryKey: ["management", "master-data", "sites"],
    queryFn: () => fetchSitesList({ active: "all" }),
  });

  const rows = data ?? [];

  const createMutation = useMutation({
    mutationFn: createSite,
    onSuccess: () => {
      toast({
        title: "Site created",
        description: "Site has been added successfully.",
        variant: "success",
      });
      setFormOpen(false);
      setFormState(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["management", "master-data", "sites"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to create site",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; input: Parameters<typeof updateSite>[1] }) =>
      updateSite(payload.id, payload.input),
    onSuccess: () => {
      toast({
        title: "Site updated",
        description: "Site changes saved.",
        variant: "success",
      });
      setFormOpen(false);
      setEditing(null);
      setFormState(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["management", "master-data", "sites"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to update site",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSite,
    onSuccess: () => {
      toast({
        title: "Site archived",
        description: "Site was archived successfully.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["management", "master-data", "sites"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to archive site",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const columns = useMemo<ColumnDef<Site>[]>(
    () => [
      {
        id: "code",
        header: "Code",
        cell: ({ row }) => <span className="font-mono">{row.original.code}</span>,
      },
      {
        id: "name",
        header: "Name",
        accessorKey: "name",
      },
      {
        id: "location",
        header: "Location",
        cell: ({ row }) => row.original.location ?? "-",
      },
      {
        id: "unit",
        header: "Measurement Unit",
        cell: ({ row }) => row.original.measurementUnit,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "secondary" : "outline"}>
            {row.original.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
      },
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
                  name: row.original.name,
                  code: row.original.code,
                  location: row.original.location ?? "",
                  measurementUnit: row.original.measurementUnit as SiteFormState["measurementUnit"],
                  isActive: row.original.isActive,
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
                  if (window.confirm("Archive this site?")) {
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
                Activate
              </Button>
            )}
          </div>
        ),
      },
    ],
    [deleteMutation, updateMutation],
  );

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault();
    if (!formState.name.trim() || !formState.code.trim()) {
      toast({
        title: "Missing details",
        description: "Name and code are required.",
        variant: "destructive",
      });
      return;
    }

    const payload = {
      name: formState.name.trim(),
      code: formState.code.trim(),
      location: formState.location.trim() || undefined,
      measurementUnit: formState.measurementUnit,
      isActive: formState.isActive,
    };

    if (editing) {
      updateMutation.mutate({
        id: editing.id,
        input: {
          ...payload,
          location: formState.location.trim() ? formState.location.trim() : null,
        },
      });
      return;
    }

    createMutation.mutate(payload);
  };

  return (
    <MasterDataShell
      activeTab="sites"
      title="Sites"
      description="Manage site master data used across operations, reports, and staffing."
      actions={
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setFormState(emptyForm);
            setFormOpen(true);
          }}
        >
          <Plus className="mr-2 size-4" />
          New Site
        </Button>
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load sites</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      <DataTable
        data={rows}
        columns={columns}
        searchPlaceholder="Search sites"
        searchSubmitLabel="Search"
        pagination={{ enabled: true }}
        emptyState={isLoading ? "Loading sites..." : "No sites found."}
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
        <SheetContent className="w-full sm:max-w-lg p-6">
          <SheetHeader>
            <SheetTitle>{editing ? "Edit Site" : "New Site"}</SheetTitle>
            <SheetDescription>
              {editing
                ? "Update site details and status."
                : "Create a site for reporting and operational forms."}
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSave} className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold">Name *</label>
              <Input
                value={formState.name}
                onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Mine A"
                required
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Code *</label>
              <Input
                value={formState.code}
                onChange={(event) => setFormState((prev) => ({ ...prev, code: event.target.value }))}
                placeholder="MINE-A"
                required
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Location</label>
              <Input
                value={formState.location}
                onChange={(event) => setFormState((prev) => ({ ...prev, location: event.target.value }))}
                placeholder="District / Coordinates"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Measurement Unit</label>
              <Select
                value={formState.measurementUnit}
                onValueChange={(value) =>
                  setFormState((prev) => ({
                    ...prev,
                    measurementUnit: value as SiteFormState["measurementUnit"],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tonnes">tonnes</SelectItem>
                  <SelectItem value="trips">trips</SelectItem>
                  <SelectItem value="wheelbarrows">wheelbarrows</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant={formState.isActive ? "secondary" : "outline"}
                onClick={() => setFormState((prev) => ({ ...prev, isActive: !prev.isActive }))}
              >
                {formState.isActive ? "Active" : "Inactive"}
              </Button>
              <Button type="submit" className="flex-1" disabled={createMutation.isPending || updateMutation.isPending}>
                {editing ? "Save Changes" : "Create Site"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </MasterDataShell>
  );
}
