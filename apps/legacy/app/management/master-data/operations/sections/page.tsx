"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DataTableColumn } from "@corelithzw/react";
import {
  DetailFact,
  MasterDataPage,
} from "@/components/management/master-data/master-data-page";
import { Badge } from "@corelithzw/ui/components/badge";
import { Button } from "@corelithzw/ui/components/button";
import { Input } from "@corelithzw/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@corelithzw/ui/components/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@corelithzw/ui/components/sheet";
import { useToast } from "@corelithzw/ui/components/use-toast";
import {
  createSection,
  deleteSection,
  fetchSections,
  fetchSitesList,
  type SectionSummary,
  updateSection,
} from "@/lib/api";
import { getApiErrorMessage, resolveDisplayErrorMessage } from "@corelithzw/platform/api-client";

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

  const sites = sitesData ?? [];

  const [search, setSearch] = useState("");
  const rows = useMemo(() => {
    const all = sectionsData?.data ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (row) =>
        row.name.toLowerCase().includes(needle) ||
        (row.site
          ? `${row.site.code} ${row.site.name}`.toLowerCase().includes(needle)
          : false),
    );
  }, [sectionsData, search]);

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

  // No actions column: a row is picked, and what can be done to it lives in
  // the detail pane.
  const columns = useMemo<DataTableColumn<SectionSummary>[]>(
    () => [
      { key: "name", header: "Section", sortable: true },
      {
        key: "site",
        header: "Site",
        width: 160,
        render: (row) => {
          if (!row.site) return "-";
          return `${row.site.code} - ${row.site.name}`;
        },
      },
      {
        key: "reports",
        header: "Shift Reports",
        width: 160,
        render: (row) => row._count?.shiftReports ?? 0,
      },
      {
        key: "status",
        header: "Status",
        width: 120,
        render: (row) => (
          <Badge variant={row.isActive ? "secondary" : "outline"}>
            {row.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
      },
    ],
    [],
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
    <MasterDataPage<SectionSummary>
      title="Sections"
      description="Operational areas within each site that shift reports are filed against."
      createLabel="New section"
      onCreate={() => {
        setEditing(null);
        setFormState({ ...emptyForm, siteId: sites[0]?.id ?? "" });
        setFormOpen(true);
      }}
      columns={columns}
      data={rows}
      rowKey={(row) => row.id}
      isLoading={isLoading}
      error={loadErrorMessage}
      emptyLabel="No section records available."
      search={
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search sections"
          aria-label="Search sections"
          className="h-9 w-full sm:w-64"
        />
      }
      renderDetail={(row, close) => (
        <div className="space-y-4">
          <div className="space-y-3">
            <DetailFact label="Section">{row.name}</DetailFact>
            <DetailFact label="Site">
              {row.site ? `${row.site.code} - ${row.site.name}` : "-"}
            </DetailFact>
            <DetailFact label="Shift reports">
              {row._count?.shiftReports ?? 0}
            </DetailFact>
            <DetailFact label="Status">
              {row.isActive ? "Active" : "Inactive"}
            </DetailFact>
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setEditing(row);
                setFormState({
                  name: row.name,
                  siteId: row.siteId,
                  isActive: row.isActive,
                });
                setFormOpen(true);
              }}
            >
              Edit
            </Button>
            {row.isActive ? (
              <Button
                size="sm"
                variant="outline"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (window.confirm("Confirm archival of this section.")) {
                    deleteMutation.mutate(row.id, { onSuccess: close });
                  }
                }}
              >
                Archive
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={updateMutation.isPending}
                onClick={() =>
                  updateMutation.mutate({ id: row.id, input: { isActive: true } })
                }
              >
                Set Active
              </Button>
            )}
          </div>
        </div>
      )}
    >

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
    </MasterDataPage>
  );
}
