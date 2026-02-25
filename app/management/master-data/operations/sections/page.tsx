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
  createSection,
  deleteSection,
  fetchSections,
  fetchSitesList,
  type SectionSummary,
  updateSection,
} from "@/lib/api";
import { getApiErrorMessage, resolveDisplayErrorMessage } from "@/lib/api-client";
import { Pencil, Plus, Trash2 } from "@/lib/icons";

type SectionFormState = {
  name: string;
  siteId: string;
  isActive: boolean;
};

const emptyForm: SectionFormState = {
  name: "",
  siteId: "",
  isActive: true,
};

export default function SectionsManagementPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SectionSummary | null>(null);
  const [formState, setFormState] = useState<SectionFormState>(emptyForm);

  const { data: sectionsData, isLoading, error } = useQuery({
    queryKey: ["management", "master-data", "sections"],
    queryFn: () => fetchSections({ limit: 500 }),
  });
  const loadErrorMessage = resolveDisplayErrorMessage([error]);

  const { data: sitesData } = useQuery({
    queryKey: ["management", "master-data", "sites-options"],
    queryFn: () => fetchSitesList({ active: true }),
  });

  const rows = sectionsData?.data ?? [];
  const sites = sitesData ?? [];

  const createMutation = useMutation({
    mutationFn: createSection,
    onSuccess: () => {
      toast({
        title: "Section created",
        description: "Section record created.",
        variant: "success",
      });
      setFormOpen(false);
      setFormState(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["management", "master-data", "sections"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to create section",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; input: Parameters<typeof updateSection>[1] }) =>
      updateSection(payload.id, payload.input),
    onSuccess: () => {
      toast({
        title: "Section updated",
        description: "Section record updated.",
        variant: "success",
      });
      setFormOpen(false);
      setEditing(null);
      setFormState(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["management", "master-data", "sections"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to update section",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSection,
    onSuccess: () => {
      toast({
        title: "Section record archived",
        description: "Section record archived.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["management", "master-data", "sections"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to archive section",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const columns = useMemo<ColumnDef<SectionSummary>[]>(
    () => [
      {
        id: "name",
        header: "Section",
        accessorKey: "name",
        size: 280,
        minSize: 220,
        maxSize: 420},
      {
        id: "site",
        header: "Site",
        cell: ({ row }) => {
          if (!row.original.site) return "-";
          return `${row.original.site.code} - ${row.original.site.name}`;
        },
        size: 160,
        minSize: 160,
        maxSize: 160},
      {
        id: "reports",
        header: "Shift Reports",
        cell: ({ row }) => row.original._count?.shiftReports ?? 0,
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
                  name: row.original.name,
                  siteId: row.original.siteId,
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
                  if (window.confirm("Confirm archival of this section.")) {
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
    if (!formState.name.trim() || !formState.siteId) {
      toast({
        title: "Incomplete form",
        description: "Section name and site are required.",
        variant: "destructive",
      });
      return;
    }

    const payload = {
      name: formState.name.trim(),
      siteId: formState.siteId,
      isActive: formState.isActive,
    };

    if (editing) {
      updateMutation.mutate({
        id: editing.id,
        input: payload,
      });
      return;
    }

    createMutation.mutate(payload);
  };

  return (
    <MasterDataShell
      activeTab="sections"
      title="Sections"
      description="Section reference data by site."
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
          New Section
        </Button>
      }
    >
      {loadErrorMessage ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load sections</AlertTitle>
          <AlertDescription>{loadErrorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <DataTable
        data={rows}
        columns={columns}
        searchPlaceholder="Search sections"
        searchSubmitLabel="Search"
        pagination={{ enabled: true }}
        emptyState={isLoading ? "Loading section records..." : "No section records available."}
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
            <SheetTitle>{editing ? "Edit Section" : "New Section"}</SheetTitle>
            <SheetDescription>
              {editing
                ? "Update section record details and status."
                : "Create a section record under a site."}
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSave} className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold">Section Name *</label>
              <Input
                value={formState.name}
                onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="North Pit"
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
                  {sites.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.code} - {site.name}
                    </SelectItem>
                  ))}
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
                {editing ? "Save Changes" : "Create Section"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </MasterDataShell>
  );
}
