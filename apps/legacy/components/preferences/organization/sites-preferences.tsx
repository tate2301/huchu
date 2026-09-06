"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Drawer,
  Field,
  Input,
  Select,
  Switch,
  type DataTableColumn,
} from "@corelithzw/react";

import { DsDataTable } from "@corelithzw/ui/corelith/ds-data-table";
import { PageActions } from "@corelithzw/ui/layout/page-chrome";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { useReservedId } from "@/hooks/use-reserved-id";
import {
  createSite,
  deleteSite,
  fetchSitesList,
  type Site,
  updateSite,
} from "@/lib/api";
import { getApiErrorMessage, resolveDisplayErrorMessage } from "@corelithzw/platform/api-client";
import { Pencil, Plus, Trash2 } from "@corelithzw/ui/lib/icons";
import { dsConfirm } from "@corelithzw/ui/components/ds-confirm";

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

function paginateRows<T>(rows: T[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

export function SitesPreferences() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState("");
  const [submittedSearch, setSubmittedSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Site | null>(null);
  const [formState, setFormState] = React.useState<SiteFormState>(emptyForm);
  const {
    reservedId,
    isReserving,
    error: reserveError,
  } = useReservedId({
    entity: "SITE",
    enabled: formOpen && !editing,
  });
  const resolvedCode = editing ? formState.code : reservedId;

  const sitesQuery = useQuery({
    queryKey: ["preferences", "organization", "sites"],
    queryFn: () => fetchSitesList({ active: "all" }),
  });
  const loadErrorMessage = resolveDisplayErrorMessage([sitesQuery.error]);

  const createMutation = useMutation({
    mutationFn: createSite,
    onSuccess: () => {
      toast({
        title: "Site created",
        description: "Site record was created.",
        variant: "success",
      });
      closeForm();
      queryClient.invalidateQueries({ queryKey: ["preferences", "organization", "sites"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to create site",
        description: getApiErrorMessage(error),
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
        description: "Site record was updated.",
        variant: "success",
      });
      closeForm();
      queryClient.invalidateQueries({ queryKey: ["preferences", "organization", "sites"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to update site",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: deleteSite,
    onSuccess: () => {
      toast({
        title: "Site archived",
        description: "Site record was removed from active lists.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["preferences", "organization", "sites"] });
    },
    onError: (error) => {
      toast({
        title: "Unable to archive site",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
    setFormState(emptyForm);
  }

  function openCreateForm() {
    setEditing(null);
    setFormState(emptyForm);
    setFormOpen(true);
  }

  function openEditForm(site: Site) {
    setEditing(site);
    setFormState({
      name: site.name,
      code: site.code,
      location: site.location ?? "",
      measurementUnit: site.measurementUnit as SiteFormState["measurementUnit"],
      isActive: site.isActive,
    });
    setFormOpen(true);
  }

  async function archiveSite(site: Site) {
    const confirmed = await dsConfirm({
      title: "Archive site",
      description: `Archive ${site.name}. This removes it from active operational defaults.`,
      variant: "warning",
      confirmLabel: "Archive",
    });
    if (confirmed) archiveMutation.mutate(site.id);
  }

  const filteredRows = React.useMemo(() => {
    const rows = sitesQuery.data ?? [];
    const query = submittedSearch.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((site) =>
      [site.name, site.code, site.location ?? "", site.measurementUnit]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [sitesQuery.data, submittedSearch]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pageRows = paginateRows(filteredRows, Math.min(page, pageCount), pageSize);

  React.useEffect(() => {
    setPage(1);
  }, [pageSize, submittedSearch]);

  const columns: DataTableColumn<Site>[] = [
      {
        key: "code",
        header: "Code",
        width: "8rem",
        render: (row) => <span className="t-mono">{row.code}</span>,
      },
      {
        key: "name",
        header: "Name",
        render: (row) => row.name,
      },
      {
        key: "location",
        header: "Location",
        render: (row) => row.location || "-",
      },
      {
        key: "unit",
        header: "Measurement unit",
        render: (row) => row.measurementUnit,
      },
      {
        key: "status",
        header: "Status",
        width: "8rem",
        render: (row) => (
          <Badge tone={row.isActive ? "success" : "outline"}>
            {row.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
      },
      {
        key: "actions",
        header: "Actions",
        width: "14rem",
        render: (row) => (
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              startIcon={<Pencil className="size-4" aria-hidden="true" />}
              aria-label={`Edit ${row.name}`}
              onClick={() => openEditForm(row)}
            />
            {row.isActive ? (
              <Button
                type="button"
                variant="ghost"
                tone="danger"
                size="sm"
                startIcon={<Trash2 className="size-4" aria-hidden="true" />}
                aria-label={`Archive ${row.name}`}
                loading={archiveMutation.isPending}
                onClick={() => archiveSite(row)}
              />
            ) : (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={updateMutation.isPending}
                onClick={() =>
                  updateMutation.mutate({ id: row.id, input: { isActive: true } })
                }
              >
                Set active
              </Button>
            )}
          </div>
        ),
      },
  ];

  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!formState.name.trim()) return;
    if (!editing && !resolvedCode.trim()) return;

    const payload = {
      name: formState.name.trim(),
      location: formState.location.trim() ? formState.location.trim() : null,
      measurementUnit: formState.measurementUnit,
      isActive: formState.isActive,
    };

    if (editing) {
      updateMutation.mutate({ id: editing.id, input: payload });
      return;
    }

    createMutation.mutate({
      code: resolvedCode.trim(),
      name: payload.name,
      location: formState.location.trim() || undefined,
      measurementUnit: payload.measurementUnit,
    });
  }

  return (
    <>
      {/* The page's one verb, in the app bar — where every other module puts
          it. In the table's controls row it sat below the title, the
          description and the search box. */}
      <PageActions>
        <Button
          type="button"
          variant="primary"
          size="sm"
          startIcon={<Plus className="size-4" aria-hidden="true" />}
          onClick={openCreateForm}
        >
          New site
        </Button>
      </PageActions>

      <DsDataTable
        ariaLabel="Sites"
        rows={pageRows}
        columns={columns}
        getRowId={(row) => row.id}
        searchValue={search}
        searchPlaceholder="Search sites"
        onSearchChange={setSearch}
        onSearchSubmit={() => setSubmittedSearch(search)}
        isLoading={sitesQuery.isLoading}
        loadingLabel="Fetching sites"
        error={loadErrorMessage}
        errorTitle="Unable to load sites"
        emptyTitle="No sites found"
        emptyDescription="Create operational sites to use them in reports and workflows."
        page={Math.min(page, pageCount)}
        pageCount={pageCount}
        pageSize={pageSize}
        pageSizeOptions={[10, 25, 50]}
        total={filteredRows.length}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      <Drawer
        open={formOpen}
        onClose={closeForm}
        title={editing ? "Edit site" : "New site"}
        description={
          editing
            ? "Update site details and active status."
            : "Create a site record for reporting and operational forms."
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={closeForm}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="site-preferences-form"
              loading={createMutation.isPending || updateMutation.isPending}
              disabled={!editing && (isReserving || !resolvedCode)}
            >
              {editing ? "Save changes" : "Create site"}
            </Button>
          </div>
        }
      >
        <form id="site-preferences-form" className="space-y-4" onSubmit={handleSave}>
          <Field label="Name" required>
            <Input
              value={formState.name}
              onChange={(event) =>
                setFormState((current) => ({ ...current, name: event.target.value }))
              }
              required
            />
          </Field>
          <Field
            label="Code"
            description={
              editing
                ? "Site code cannot be changed."
                : reserveError ?? "Code is generated automatically and cannot be edited."
            }
            required
          >
            <Input
              value={resolvedCode}
              readOnly
              placeholder={isReserving ? "Reserving code" : "Auto-generated"}
              required
            />
          </Field>
          <Field label="Location">
            <Input
              value={formState.location}
              onChange={(event) =>
                setFormState((current) => ({ ...current, location: event.target.value }))
              }
              placeholder="District or coordinates"
            />
          </Field>
          <Field label="Measurement unit">
            <Select
              value={formState.measurementUnit}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  measurementUnit: event.target.value as SiteFormState["measurementUnit"],
                }))
              }
            >
              <option value="tonnes">tonnes</option>
              <option value="trips">trips</option>
              <option value="wheelbarrows">wheelbarrows</option>
            </Select>
          </Field>
          <div className="settings-row">
            <div>
              <div className="t-label-sm">Active</div>
              <p className="t-caption t-muted">Inactive sites stay on historical records.</p>
            </div>
            <Switch
              aria-label="Site active status"
              checked={formState.isActive}
              onChange={(event) =>
                setFormState((current) => ({ ...current, isActive: event.target.checked }))
              }
            />
          </div>
        </form>
      </Drawer>
    </>
  );
}
