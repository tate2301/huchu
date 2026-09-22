"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ActivityTrail,
  HeaderAction,
  ListColumn,
  ListRow,
  RecordHeader,
  RegisterLayout,
  SectionHeading,
  StatusBadge,
  StatusDot,
  type ListColumnState,
} from "@/components/management/ui";
import { ManagementShell } from "@/components/settings/management-shell";
import { dsConfirm } from "@/components/ui/ds-confirm";
import { Input } from "@/components/ui/input";
import { SelectItem } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { useReservedId } from "@/hooks/use-reserved-id";
import {
  createDowntimeCode,
  deleteDowntimeCode,
  fetchDowntimeCodes,
  fetchSitesList,
  type DowntimeCode,
  updateDowntimeCode,
} from "@/lib/api";
import { getApiErrorMessage, resolveDisplayErrorMessage } from "@/lib/api-client";
import {
  Archive,
  RefreshCcw,
  SlidersHorizontal,
  Warning,
} from "@/lib/icons";

import {
  CommitInput,
  CreateField,
  CreateSheet,
  DETAIL_CONTROL_CLASS,
  DetailGrid,
  DetailRow,
  DetailSelect,
  DetailValue,
  NoRecord,
  StatusSelect,
} from "../_components/register-fields";

const DOWNTIME_KEY = ["management", "master-data", "downtime-codes"] as const;

/**
 * A code that belongs to every site rather than to one.
 *
 * Radix's `Select` treats `""` as "no value chosen", so a genuinely global code
 * needs a token of its own — otherwise the control reads as unanswered on a row
 * that has in fact been answered.
 */
const GLOBAL_SENTINEL = "__global__";

const FULL_LOG_HREF = "/reports/audit-trails";

/**
 * Downtime codes — `DowntimeCodes.dc.html`.
 *
 * Presentation only: the two query keys, `useReservedId`, all three mutations
 * and the `maintenance.breakdowns` gating are exactly as they were.
 */
export default function DowntimeCodesManagementPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draftDescription, setDraftDescription] = useState("");
  const [draftSiteId, setDraftSiteId] = useState("");

  const { reservedId, isReserving, error: reserveError } = useReservedId({
    entity: "DOWNTIME_CODE",
    siteId: draftSiteId || undefined,
    enabled: creating && Boolean(draftSiteId),
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: DOWNTIME_KEY,
    queryFn: () => fetchDowntimeCodes({ active: "all" }),
  });
  const loadErrorMessage = resolveDisplayErrorMessage([error]);

  const { data: sitesData } = useQuery({
    queryKey: ["management", "master-data", "sites-options", "downtime"],
    queryFn: () => fetchSitesList({ active: true }),
  });
  const sites = useMemo(() => sitesData ?? [], [sitesData]);

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

  const selected: DowntimeCode | null =
    all.find((row) => row.id === selectedId) ?? rows[0] ?? null;

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [...DOWNTIME_KEY] });

  const createMutation = useMutation({
    mutationFn: createDowntimeCode,
    onSuccess: (created) => {
      toast({ title: "Downtime code created", variant: "success" });
      setCreating(false);
      setDraftDescription("");
      setSelectedId(created.id);
      invalidate();
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
    mutationFn: (payload: {
      id: string;
      input: Parameters<typeof updateDowntimeCode>[1];
    }) => updateDowntimeCode(payload.id, payload.input),
    onSuccess: () => {
      toast({ title: "Downtime code updated", variant: "success" });
      invalidate();
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
      toast({ title: "Downtime code retired", variant: "success" });
      invalidate();
    },
    onError: (err) => {
      toast({
        title: "Unable to retire downtime code",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const patch = (id: string, input: Parameters<typeof updateDowntimeCode>[1]) =>
    updateMutation.mutate({ id, input });

  const listState: ListColumnState = isLoading
    ? "loading"
    : loadErrorMessage
      ? "failed"
      : rows.length
        ? "ready"
        : search.trim()
          ? "no-matches"
          : "empty";

  return (
    <ManagementShell railCounts={{ "downtime-codes": all.length }}>
      <RegisterLayout
        hasSelection={Boolean(selected)}
        list={
          <ListColumn
            title="Downtime codes"
            noun="downtime code"
            count={all.length}
            state={listState}
            // The board's "Entries" column counts downtime events, and no
            // route on this page reads that figure — `/api/downtime-codes`
            // selects no `_count`, and adding one is data fetching.
            //
            // Status is what goes there instead. This list is loaded with
            // `active: "all"`, so retired codes sit in it looking exactly like
            // live ones, and rule 6 wants the one column people scan down to
            // carry the state every row is in. `sortOrder` was the other
            // candidate and is the wrong one: the rows arrive ordered by it,
            // so a column of it would only restate each row's position.
            columns={{ row: "Downtime code", value: "Status" }}
            search={{
              value: search,
              onChange: setSearch,
              placeholder: "Code or name",
            }}
            onNew={() => {
              setDraftDescription("");
              setDraftSiteId(sites[0]?.id ?? "");
              setCreating(true);
            }}
            onRetry={() => void refetch()}
          >
            {rows.map((row) => (
              <ListRow
                key={row.id}
                code={row.code}
                name={row.description}
                value={
                  <StatusDot
                    tone={row.isActive === false ? "neutral" : "success"}
                    label={row.isActive === false ? "Retired" : "Active"}
                  />
                }
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
              title={selected.description}
              icon={Warning}
              onRename={(description) => patch(selected.id, { description })}
              renameLabel="Rename the downtime code"
              badge={
                <StatusBadge
                  context="header"
                  tone={selected.isActive === false ? "neutral" : "success"}
                >
                  Retired
                </StatusBadge>
              }
              action={
                selected.isActive === false ? (
                  <HeaderAction
                    icon={RefreshCcw}
                    disabled={updateMutation.isPending}
                    onClick={() => patch(selected.id, { isActive: true })}
                  >
                    Set active
                  </HeaderAction>
                ) : (
                  <HeaderAction
                    icon={Archive}
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      void dsConfirm({
                        title: `Retire ${selected.description}?`,
                        description:
                          "Downtime already logged against it keeps it. It stops being offered on new shift reports until it is set active again.",
                        confirmLabel: "Retire the code",
                        variant: "warning",
                      }).then((confirmed) => {
                        if (confirmed) deleteMutation.mutate(selected.id);
                      });
                    }}
                  >
                    Retire
                  </HeaderAction>
                )
              }
            />

            <SectionHeading icon={SlidersHorizontal} tone="brand">
              Details
            </SectionHeading>
            <DetailGrid>
              {/*
                Drawn as a fact, not as a control, because it is not one.
                `PATCH /api/downtime-codes/[id]` answers 400 "Downtime code is
                immutable and cannot be changed" to any body carrying `code`,
                and the code itself is reserved through `useReservedId` at
                creation. The board draws an input here; an input whose every
                commit is a rejected write is worse than the board's picture.
              */}
              <DetailRow label="Code">
                <DetailValue mono>{selected.code}</DetailValue>
              </DetailRow>
              <DetailRow label="Site">
                {(id) => (
                  <DetailSelect
                    id={id}
                    value={selected.siteId ?? GLOBAL_SENTINEL}
                    onValueChange={(next) =>
                      patch(selected.id, {
                        siteId: next === GLOBAL_SENTINEL ? null : next,
                      })
                    }
                  >
                    <SelectItem value={GLOBAL_SENTINEL}>Every site</SelectItem>
                    {sites.map((site) => (
                      <SelectItem key={site.id} value={site.id}>
                        {site.code} · {site.name}
                      </SelectItem>
                    ))}
                  </DetailSelect>
                )}
              </DetailRow>
              <DetailRow label="Order">
                {(id) => (
                  <CommitInput
                    id={id}
                    mono
                    inputMode="numeric"
                    value={String(selected.sortOrder ?? 0)}
                    onCommit={(next) => {
                      const sortOrder = Number.parseInt(next, 10);
                      if (Number.isNaN(sortOrder)) return;
                      patch(selected.id, { sortOrder });
                    }}
                  />
                )}
              </DetailRow>
              <DetailRow label="Status">
                {(id) => (
                  <StatusSelect
                    id={id}
                    archivedLabel="Retired"
                    active={selected.isActive !== false}
                    onChange={(isActive) => patch(selected.id, { isActive })}
                  />
                )}
              </DetailRow>
            </DetailGrid>

            <ActivityTrail events={[]} fullLogHref={FULL_LOG_HREF} />
          </>
        ) : (
          <NoRecord
            label={
              isLoading
                ? "Loading downtime codes"
                : search.trim()
                  ? "No downtime code matches that search."
                  : "No downtime code to show yet."
            }
          />
        )}

        <CreateSheet
          open={creating}
          onOpenChange={setCreating}
          title="New downtime code"
          submitLabel="Create downtime code"
          busy={createMutation.isPending || isReserving}
          onSubmit={(event) => {
            event.preventDefault();
            if (!draftDescription.trim() || !draftSiteId) {
              toast({
                title: "Incomplete form",
                description: "A name and a site are required.",
                variant: "destructive",
              });
              return;
            }
            createMutation.mutate({
              code: reservedId || undefined,
              description: draftDescription.trim(),
              siteId: draftSiteId,
              isActive: true,
            });
          }}
        >
          <CreateField label="Site">
            {(id) => (
              <DetailSelect
                id={id}
                value={draftSiteId}
                onValueChange={setDraftSiteId}
                placeholder="Pick a site"
              >
                {sites.map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    {site.code} · {site.name}
                  </SelectItem>
                ))}
              </DetailSelect>
            )}
          </CreateField>
          <CreateField label="Code">
            {(id) => (
              <Input
                id={id}
                readOnly
                value={reserveError ? "" : reservedId}
                placeholder={reserveError ?? "Reserved once a site is picked"}
                className={`${DETAIL_CONTROL_CLASS} font-mono`}
              />
            )}
          </CreateField>
          <CreateField label="Name">
            {(id) => (
              <Input
                id={id}
                value={draftDescription}
                onChange={(event) => setDraftDescription(event.target.value)}
                placeholder="Mill liner change"
                className={DETAIL_CONTROL_CLASS}
              />
            )}
          </CreateField>
        </CreateSheet>
      </RegisterLayout>
    </ManagementShell>
  );
}
