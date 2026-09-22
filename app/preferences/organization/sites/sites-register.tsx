"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ActivityTrail,
  HeaderAction,
  ListColumn,
  ListRow,
  RecordHeader,
  RecordList,
  RegisterLayout,
  SectionHeading,
  StatusBadge,
  type ListColumnState,
} from "@/components/management/ui";
import { PreferencesShell } from "@/components/preferences/preferences-shell";
import { dsConfirm } from "@/components/ui/ds-confirm";
import { Input } from "@/components/ui/input";
import { SelectItem } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { useReservedId } from "@/hooks/use-reserved-id";
import {
  createSite,
  deleteSite,
  fetchSections,
  fetchSitesList,
  type Site,
  updateSite,
} from "@/lib/api";
import { getApiErrorMessage, resolveDisplayErrorMessage } from "@/lib/api-client";
import {
  Archive,
  ListBullets,
  MapPin,
  RefreshCcw,
  SlidersHorizontal,
} from "@/lib/icons";

import {
  CommitInput,
  CreateField,
  CreateSheet,
  DETAIL_CONTROL_CLASS,
  DetailGrid,
  DetailRow,
  DetailSelect,
  NoRecord,
  StatusSelect,
} from "@/app/management/master-data/operations/_components/register-fields";

const SITES_KEY = ["preferences", "organization", "sites"] as const;

const FULL_LOG_HREF = "/reports/audit-trails";

/**
 * One muted line, on the record's 470px measure.
 *
 * A named column header over an empty list is the board with a hole in it: the
 * heading has already said "Sections here, 0", and a "Section / Shift reports"
 * rule under it with nothing between the rules says the list is broken rather
 * than empty. Both the empty case and the still-loading one get this line
 * instead, which is the same answer `job-grades` reached for its roster.
 */
function SectionNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[13px] font-normal leading-[1.5] text-[#5E6573]"
      style={{ maxWidth: 470 }}
    >
      {children}
    </p>
  );
}

const MEASUREMENT_UNITS = [
  { value: "tonnes", label: "Tonnes" },
  { value: "trips", label: "Trips" },
  { value: "wheelbarrows", label: "Wheelbarrows" },
] as const;

type MeasurementUnit = (typeof MEASUREMENT_UNITS)[number]["value"];

/**
 * Sites — `Sites.dc.html`.
 *
 * One component behind two routes: `/preferences/organization/sites` is where
 * it lives, and `/management/master-data/operations/sites` has redirected here
 * since before this refactor. The rail's Sites entry points at the preferences
 * href and is gated by `canViewPreferenceItem`, so the surface reaches the same
 * screen from either side of the old split.
 *
 * It sits in the register the whole surface now uses rather than in the
 * `DsDataTable` + drawer it used to: a table of six rows whose edit control
 * opened a drawer holding the same five fields was three places to look at one
 * record. The query key, the three mutations, `useReservedId` and the server
 * gate on the route are all exactly as they were.
 */
export function SitesRegister() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [draftName, setDraftName] = React.useState("");
  const [draftLocation, setDraftLocation] = React.useState("");
  const [draftUnit, setDraftUnit] = React.useState<MeasurementUnit>("tonnes");

  const { reservedId, isReserving, error: reserveError } = useReservedId({
    entity: "SITE",
    enabled: creating,
  });

  const sitesQuery = useQuery({
    queryKey: SITES_KEY,
    queryFn: () => fetchSitesList({ active: "all" }),
  });
  const loadErrorMessage = resolveDisplayErrorMessage([sitesQuery.error]);

  /**
   * The sections filed under each site — the board's "Sections here", and the
   * figure its list column counts. One read for the whole page rather than one
   * per selected row: six sites would otherwise be six round trips to show a
   * column, and the register re-selects as you type in the search box.
   */
  const sectionsQuery = useQuery({
    queryKey: [...SITES_KEY, "sections"],
    queryFn: () => fetchSections({ limit: 500 }),
  });

  const sectionsBySite = React.useMemo(() => {
    const grouped = new Map<string, { id: string; name: string; reports: number }[]>();
    for (const section of sectionsQuery.data?.data ?? []) {
      const bucket = grouped.get(section.siteId) ?? [];
      bucket.push({
        id: section.id,
        name: section.name,
        reports: section._count?.shiftReports ?? 0,
      });
      grouped.set(section.siteId, bucket);
    }
    return grouped;
  }, [sectionsQuery.data]);

  const all = React.useMemo(() => sitesQuery.data ?? [], [sitesQuery.data]);
  const rows = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (row) =>
        row.code.toLowerCase().includes(needle) ||
        row.name.toLowerCase().includes(needle) ||
        (row.location ?? "").toLowerCase().includes(needle),
    );
  }, [all, search]);

  const selected: Site | null =
    all.find((row) => row.id === selectedId) ?? rows[0] ?? null;
  const selectedSections = selected ? (sectionsBySite.get(selected.id) ?? []) : [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [...SITES_KEY] });

  const createMutation = useMutation({
    mutationFn: createSite,
    onSuccess: (created) => {
      toast({ title: "Site created", variant: "success" });
      setCreating(false);
      setDraftName("");
      setDraftLocation("");
      setSelectedId(created.id);
      invalidate();
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
      toast({ title: "Site updated", variant: "success" });
      invalidate();
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
      toast({ title: "Site archived", variant: "success" });
      invalidate();
    },
    onError: (error) => {
      toast({
        title: "Unable to archive site",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const patch = (id: string, input: Parameters<typeof updateSite>[1]) =>
    updateMutation.mutate({ id, input });

  const listState: ListColumnState = sitesQuery.isLoading
    ? "loading"
    : loadErrorMessage
      ? "failed"
      : rows.length
        ? "ready"
        : search.trim()
          ? "no-matches"
          : "empty";

  return (
    <PreferencesShell railCounts={{ sites: all.length }}>
      <RegisterLayout
        hasSelection={Boolean(selected)}
        list={
          <ListColumn
            title="Sites"
            noun="site"
            count={all.length}
            state={listState}
            columns={{ row: "Site", value: "Sections" }}
            search={{
              value: search,
              onChange: setSearch,
              placeholder: "Code, name or place",
            }}
            onNew={() => {
              setDraftName("");
              setDraftLocation("");
              setDraftUnit("tonnes");
              setCreating(true);
            }}
            onRetry={() => void sitesQuery.refetch()}
          >
            {rows.map((row) => (
              <ListRow
                key={row.id}
                code={row.code}
                name={row.name}
                value={sectionsBySite.get(row.id)?.length ?? 0}
                selected={row.id === selected?.id}
                onSelect={() => setSelectedId(row.id)}
              />
            ))}
          </ListColumn>
        }
      >
        {selected ? (
          <>
            <RecordHeader
              title={selected.name}
              icon={MapPin}
              onRename={(name) => patch(selected.id, { name })}
              renameLabel="Rename the site"
              badge={
                <StatusBadge
                  context="header"
                  tone={selected.isActive ? "success" : "neutral"}
                >
                  Archived
                </StatusBadge>
              }
              action={
                selected.isActive ? (
                  <HeaderAction
                    icon={Archive}
                    disabled={archiveMutation.isPending}
                    onClick={() => {
                      void dsConfirm({
                        title: `Archive ${selected.name}?`,
                        description:
                          "Records already filed against it keep it. It stops being offered on new ones until it is set active again.",
                        confirmLabel: "Archive the site",
                        variant: "warning",
                      }).then((confirmed) => {
                        if (confirmed) archiveMutation.mutate(selected.id);
                      });
                    }}
                  >
                    Archive
                  </HeaderAction>
                ) : (
                  <HeaderAction
                    icon={RefreshCcw}
                    disabled={updateMutation.isPending}
                    onClick={() => patch(selected.id, { isActive: true })}
                  >
                    Set active
                  </HeaderAction>
                )
              }
            />

            <SectionHeading icon={SlidersHorizontal} tone="brand">
              Details
            </SectionHeading>
            <DetailGrid>
              <DetailRow label="Code">
                {(id) => (
                  <CommitInput
                    id={id}
                    mono
                    value={selected.code}
                    onCommit={(code) => patch(selected.id, { code })}
                  />
                )}
              </DetailRow>
              <DetailRow label="Location">
                {(id) => (
                  <CommitInput
                    id={id}
                    value={selected.location ?? ""}
                    onCommit={(location) =>
                      patch(selected.id, { location: location || null })
                    }
                  />
                )}
              </DetailRow>
              <DetailRow label="Measured in">
                {(id) => (
                  <DetailSelect
                    id={id}
                    value={selected.measurementUnit}
                    onValueChange={(unit) =>
                      patch(selected.id, {
                        measurementUnit: unit as MeasurementUnit,
                      })
                    }
                  >
                    {MEASUREMENT_UNITS.map((unit) => (
                      <SelectItem key={unit.value} value={unit.value}>
                        {unit.label}
                      </SelectItem>
                    ))}
                  </DetailSelect>
                )}
              </DetailRow>
              <DetailRow label="Status">
                {(id) => (
                  <StatusSelect
                    id={id}
                    active={selected.isActive}
                    onChange={(isActive) => patch(selected.id, { isActive })}
                  />
                )}
              </DetailRow>
            </DetailGrid>

            {/*
              The board draws the list glyph here, not the stack one — the
              same glyph `Sections.dc.html` puts on "Downtime codes used
              here". A record's sub-list is marked as a list, whatever it
              happens to hold; the stack belongs to the section record's own
              header, where it stands for the thing rather than the shape.
            */}
            <SectionHeading icon={ListBullets} count={selectedSections.length}>
              Sections here
            </SectionHeading>
            {sectionsQuery.isLoading ? (
              <SectionNote>Loading the sections</SectionNote>
            ) : selectedSections.length > 0 ? (
              <RecordList
                columns={{ row: "Section", value: "Shift reports" }}
                valueWidth={84}
                rows={selectedSections.map((section) => ({
                  id: section.id,
                  name: section.name,
                  value: { kind: "number", value: section.reports },
                }))}
              />
            ) : (
              <SectionNote>No sections are filed under this site yet.</SectionNote>
            )}

            <ActivityTrail events={[]} fullLogHref={FULL_LOG_HREF} />
          </>
        ) : (
          <NoRecord
            label={
              sitesQuery.isLoading
                ? "Loading sites"
                : search.trim()
                  ? "No site matches that search."
                  : "No site to show yet."
            }
          />
        )}

        <CreateSheet
          open={creating}
          onOpenChange={setCreating}
          title="New site"
          submitLabel="Create site"
          busy={createMutation.isPending || isReserving}
          onSubmit={(event) => {
            event.preventDefault();
            if (!draftName.trim()) {
              toast({
                title: "Incomplete form",
                description: "A site name is required.",
                variant: "destructive",
              });
              return;
            }
            createMutation.mutate({
              name: draftName.trim(),
              code: reservedId || undefined,
              location: draftLocation.trim() || undefined,
              measurementUnit: draftUnit,
            });
          }}
        >
          <CreateField label="Code">
            {(id) => (
              <Input
                id={id}
                readOnly
                value={reserveError ? "" : reservedId}
                placeholder={reserveError ?? (isReserving ? "Reserving" : "")}
                className={`${DETAIL_CONTROL_CLASS} font-mono`}
              />
            )}
          </CreateField>
          <CreateField label="Name">
            {(id) => (
              <Input
                id={id}
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="Bindura Mine"
                className={DETAIL_CONTROL_CLASS}
              />
            )}
          </CreateField>
          <CreateField label="Location">
            {(id) => (
              <Input
                id={id}
                value={draftLocation}
                onChange={(event) => setDraftLocation(event.target.value)}
                placeholder="Mashonaland Central"
                className={DETAIL_CONTROL_CLASS}
              />
            )}
          </CreateField>
          <CreateField label="Measured in">
            {(id) => (
              <DetailSelect
                id={id}
                value={draftUnit}
                onValueChange={(unit) => setDraftUnit(unit as MeasurementUnit)}
              >
                {MEASUREMENT_UNITS.map((unit) => (
                  <SelectItem key={unit.value} value={unit.value}>
                    {unit.label}
                  </SelectItem>
                ))}
              </DetailSelect>
            )}
          </CreateField>
        </CreateSheet>
      </RegisterLayout>
    </PreferencesShell>
  );
}
