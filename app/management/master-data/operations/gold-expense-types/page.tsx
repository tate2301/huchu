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
import { useToast } from "@/components/ui/use-toast";
import {
  createGoldExpenseType,
  deleteGoldExpenseType,
  fetchGoldExpenseTypes,
  type GoldExpenseType,
  updateGoldExpenseType,
} from "@/lib/api";
import { getApiErrorMessage, resolveDisplayErrorMessage } from "@/lib/api-client";
import {
  Archive,
  Coins,
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
  NoRecord,
  StatusSelect,
} from "../_components/register-fields";

const SETTLEMENT_TYPES_KEY = [
  "management",
  "master-data",
  "gold-expense-types",
] as const;

const FULL_LOG_HREF = "/reports/audit-trails";

/**
 * Settlement types — `SettlementTypes.dc.html`.
 *
 * The name drift this surface carried is settled here in the only direction
 * that costs nothing: the rail said "Settlement types", the board says
 * "Settlement types", the page said "Gold expense types". The list heading now
 * reads the way the rail entry you pressed reads. The route, the API, the
 * `GoldExpenseType` type and the query key are all untouched — renaming those
 * is a data change, and this is not one.
 */
export default function GoldExpenseTypesManagementPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: SETTLEMENT_TYPES_KEY,
    queryFn: () => fetchGoldExpenseTypes({ active: "all" }),
  });
  const loadErrorMessage = resolveDisplayErrorMessage([error]);

  const all = useMemo(() => data ?? [], [data]);
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((row) => row.name.toLowerCase().includes(needle));
  }, [all, search]);

  const selected: GoldExpenseType | null =
    all.find((row) => row.id === selectedId) ?? rows[0] ?? null;

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [...SETTLEMENT_TYPES_KEY] });

  const createMutation = useMutation({
    mutationFn: createGoldExpenseType,
    onSuccess: (created) => {
      toast({ title: "Settlement type created", variant: "success" });
      setCreating(false);
      setDraftName("");
      setSelectedId(created.id);
      invalidate();
    },
    onError: (err) => {
      toast({
        title: "Unable to create settlement type",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      input: Parameters<typeof updateGoldExpenseType>[1];
    }) => updateGoldExpenseType(payload.id, payload.input),
    onSuccess: () => {
      toast({ title: "Settlement type updated", variant: "success" });
      invalidate();
    },
    onError: (err) => {
      toast({
        title: "Unable to update settlement type",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteGoldExpenseType,
    onSuccess: () => {
      toast({ title: "Settlement type retired", variant: "success" });
      invalidate();
    },
    onError: (err) => {
      toast({
        title: "Unable to retire settlement type",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const patch = (
    id: string,
    input: Parameters<typeof updateGoldExpenseType>[1],
  ) => updateMutation.mutate({ id, input });

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
    <ManagementShell railCounts={{ "gold-expense-types": all.length }}>
      <RegisterLayout
        hasSelection={Boolean(selected)}
        list={
          <ListColumn
            title="Settlement types"
            noun="settlement type"
            count={all.length}
            state={listState}
            // The board's column counts settlements booked against the type.
            // Nothing this page reads returns that, and a header naming a
            // figure the rows cannot show is worse than the board's picture.
            //
            // Status takes the column instead. The list is loaded with
            // `active: "all"`, so a retired type sits in it looking exactly
            // like a live one unless this column says otherwise — rule 6's
            // list column, carrying the state on every row. `sortOrder` was
            // the other candidate and only restates each row's position,
            // since the rows arrive ordered by it.
            columns={{ row: "Settlement type", value: "Status" }}
            search={{ value: search, onChange: setSearch, placeholder: "Name" }}
            onNew={() => {
              setDraftName("");
              setCreating(true);
            }}
            onRetry={() => void refetch()}
          >
            {rows.map((row) => (
              <ListRow
                key={row.id}
                name={row.name}
                value={
                  <StatusDot
                    tone={row.isActive ? "success" : "neutral"}
                    label={row.isActive ? "Active" : "Retired"}
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
              title={selected.name}
              icon={Coins}
              onRename={(name) => patch(selected.id, { name })}
              renameLabel="Rename the settlement type"
              badge={
                <StatusBadge
                  context="header"
                  tone={selected.isActive ? "success" : "neutral"}
                >
                  Retired
                </StatusBadge>
              }
              action={
                selected.isActive ? (
                  <HeaderAction
                    icon={Archive}
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      void dsConfirm({
                        title: `Retire ${selected.name}?`,
                        description:
                          "Settlements already booked against it keep it. It stops being offered on new payouts until it is set active again.",
                        confirmLabel: "Retire the type",
                        variant: "warning",
                      }).then((confirmed) => {
                        if (confirmed) deleteMutation.mutate(selected.id);
                      });
                    }}
                  >
                    Retire
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
                    active={selected.isActive}
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
                ? "Loading settlement types"
                : search.trim()
                  ? "No settlement type matches that search."
                  : "No settlement type to show yet."
            }
          />
        )}

        <CreateSheet
          open={creating}
          onOpenChange={setCreating}
          title="New settlement type"
          submitLabel="Create settlement type"
          busy={createMutation.isPending}
          onSubmit={(event) => {
            event.preventDefault();
            if (!draftName.trim()) {
              toast({
                title: "Incomplete form",
                description: "A name is required.",
                variant: "destructive",
              });
              return;
            }
            createMutation.mutate({ name: draftName.trim(), isActive: true });
          }}
        >
          <CreateField label="Name">
            {(id) => (
              <Input
                id={id}
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="Transport levy"
                className={DETAIL_CONTROL_CLASS}
              />
            )}
          </CreateField>
        </CreateSheet>
      </RegisterLayout>
    </ManagementShell>
  );
}
