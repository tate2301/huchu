"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DataTableColumn } from "@corelithzw/react";
import {
  DetailFact,
  MasterDataPage,
} from "@/components/management/master-data/master-data-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { dsConfirm } from "@/components/ui/ds-confirm";
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

  const [search, setSearch] = useState("");
  const all = useMemo(() => data ?? [], [data]);
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (row) =>
        row.code.toLowerCase().includes(needle) ||
        row.description.toLowerCase().includes(needle),
    );
  }, [all, search]);
  const sites = sitesData ?? [];

  const createMutation = useMutation({
    mutationFn: createDowntimeCode,
    onSuccess: () => {
      toast({
        title: "Downtime code created",
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
        title: "Downtime code archived",
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

  const columns = useMemo<DataTableColumn<DowntimeCode>[]>(
    () => [
      {
        key: "code",
        header: "Code",
        width: 112,
        render: (row) => <span className="font-mono">{row.code}</span>,
      },
      { key: "description", header: "Description", sortable: true },
      {
        key: "site",
        header: "Site",
        render: (row) => {
          if (!row.siteId) return "Every site";
          if (!row.site) return "Site not on file";
          return `${row.site.code} · ${row.site.name}`;
        },
      },
      { key: "sortOrder", header: "Sort", sortable: true, width: 100 },
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
    <MasterDataPage<DowntimeCode>
      title="Downtime codes"
      description="why the plant stops — the reasons a shift report can put a stoppage down to"
      createLabel="New downtime code"
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
      total={all.length}
      searchTerm={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search by code or reason"
      emptyLabel="No downtime codes yet"
      detailTitle={(row) => row.description}
      renderDetail={(row, close) => (
        <div className="space-y-4">
          <div className="space-y-3">
            {/* The reason is the pane's own heading and is not repeated here. */}
            <DetailFact label="Code">
              <span className="font-mono tabular-nums">{row.code}</span>
            </DetailFact>
            <DetailFact label="Site">
              {!row.siteId
                ? "Every site"
                : row.site
                  ? `${row.site.code} · ${row.site.name}`
                  : "Site not on file"}
            </DetailFact>
            <DetailFact label="Sort order">
              <span className="font-mono tabular-nums">{row.sortOrder}</span>
            </DetailFact>
            <DetailFact label="Status">
              <Badge variant={row.isActive ? "secondary" : "outline"}>
                {row.isActive ? "Active" : "Inactive"}
              </Badge>
            </DetailFact>
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setEditing(row);
                setFormState({
                  code: row.code,
                  description: row.description,
                  siteId: row.siteId ?? GLOBAL_SENTINEL,
                  sortOrder: String(row.sortOrder),
                  isActive: Boolean(row.isActive),
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
                  void dsConfirm({
                    title: `Archive ${row.code}?`,
                    description:
                      "Shift reports already filed against this reason keep it. It stops being offered on new ones until it is set active again.",
                    confirmLabel: "Archive the code",
                    variant: "warning",
                  }).then((confirmed) => {
                    if (confirmed) deleteMutation.mutate(row.id, { onSuccess: close });
                  });
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
                Set active
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
            <SheetTitle>{editing ? "Edit downtime code" : "New downtime code"}</SheetTitle>
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
              <p className="mt-1 text-sm text-muted-foreground">
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
                    <SelectItem value={GLOBAL_SENTINEL}>Every site</SelectItem>
                  ) : null}
                  {sites.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.code} · {site.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold">Sort order *</label>
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
                {editing ? "Save changes" : "Create downtime code"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </MasterDataPage>
  );
}
