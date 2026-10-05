"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  FactList,
  HeaderAction,
  ListColumn,
  ListRow,
  RecordHeader,
  RegisterLayout,
  SectionHeading,
  StatusBadge,
  type ListColumnState,
} from "@/components/management/ui";
import { SHOP_SETUP_KEY, ShopSettingsShell, useShopSetup } from "@/components/retail/shop-settings";
import { Input } from "@/components/ui/input";
import { SelectItem } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { CashRegister, CheckCircle, SlidersHorizontal } from "@/lib/icons";

import {
  CreateDialog,
  CreateField,
  DETAIL_CONTROL_CLASS,
  DetailSelect,
  NoRecord,
} from "@/app/management/master-data/operations/_components/register-fields";

type SaveTill = {
  defaultSiteId: string;
  defaultRegisterId?: string | null;
  newRegisterName?: string | null;
  makeDefault?: boolean;
};

/**
 * Tills — the machines a shift is opened on, and the one a cashier lands on.
 *
 * Settings → Shop. This was "Operations setup": three tiles, a coverage chart,
 * a donut, a provisioning card and a list of links onward, to do two things —
 * add a till, and say which one is the default. It is a register now, like
 * Sites and Sections: the tills down the left, the one you picked on the right,
 * and those two verbs on it.
 */
export default function RetailTillsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const setup = useShopSetup();
  const snapshot = setup.data;

  const [search, setSearch] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [draftName, setDraftName] = React.useState("");
  const [draftSiteId, setDraftSiteId] = React.useState("");

  const tills = React.useMemo(() => snapshot?.registers ?? [], [snapshot]);
  const sites = React.useMemo(() => (snapshot?.sites ?? []).filter((site) => site.isActive), [snapshot]);
  const defaultId = snapshot?.setupProfile.defaultRegisterId ?? null;

  const rows = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return tills;
    return tills.filter((till) =>
      [till.name, till.code, till.site?.name ?? ""].some((value) => value.toLowerCase().includes(needle)),
    );
  }, [tills, search]);

  const selected = tills.find((till) => till.id === selectedId) ?? rows[0] ?? null;
  const selectedSite = snapshot?.sites.find((site) => site.id === selected?.siteId) ?? null;

  const save = useMutation({
    mutationFn: (body: SaveTill) =>
      fetchJson<{ register: { id: string } }>("/api/v2/retail/setup/operations", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: async (result, body) => {
      toast({
        title: body.newRegisterName ? "Till created" : "Default till saved",
        variant: "success",
      });
      if (body.newRegisterName) {
        setCreating(false);
        setDraftName("");
        setSelectedId(result.register.id);
      }
      await queryClient.invalidateQueries({ queryKey: SHOP_SETUP_KEY });
    },
    onError: (error, body) =>
      toast({
        title: body.newRegisterName ? "That till was not created" : "The default till was not saved",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const state: ListColumnState = setup.isLoading
    ? "loading"
    : setup.isError
      ? "failed"
      : rows.length
        ? "ready"
        : search.trim()
          ? "no-matches"
          : "empty";

  return (
    <ShopSettingsShell>
      <RegisterLayout
        hasSelection={Boolean(selected)}
        list={
          <ListColumn
            title="Tills"
            noun="till"
            count={tills.length}
            state={state}
            columns={{ row: "Till", value: "Site" }}
            search={{ value: search, onChange: setSearch, placeholder: "Name, code or site" }}
            onNew={() => {
              setDraftName("");
              setDraftSiteId(snapshot?.setupProfile.defaultSiteId ?? sites[0]?.id ?? "");
              setCreating(true);
            }}
            onRetry={() => void setup.refetch()}
          >
            {rows.map((till) => (
              <ListRow
                key={till.id}
                name={till.name}
                value={till.site?.code ?? ""}
                selected={till.id === selected?.id}
                onSelect={() => setSelectedId(till.id)}
              />
            ))}
          </ListColumn>
        }
      >
        {selected ? (
          <>
            <RecordHeader
              title={selected.name}
              icon={CashRegister}
              badge={
                selected.isActive ? null : (
                  <StatusBadge tone="neutral" context="header">
                    Inactive
                  </StatusBadge>
                )
              }
              action={
                selected.id === defaultId ? null : (
                  <HeaderAction
                    icon={CheckCircle}
                    disabled={save.isPending}
                    onClick={() =>
                      save.mutate({ defaultSiteId: selected.siteId, defaultRegisterId: selected.id })
                    }
                  >
                    Make default
                  </HeaderAction>
                )
              }
            />

            <SectionHeading icon={SlidersHorizontal} tone="brand">
              Details
            </SectionHeading>
            <FactList
              items={[
                { label: "Code", value: selected.code, mono: true },
                { label: "Site", value: selectedSite?.name ?? "No site" },
                {
                  label: "Default",
                  value: selected.id === defaultId ? "Cashiers land on this till" : "No",
                  tone: selected.id === defaultId ? "default" : "muted",
                },
                {
                  label: "Open shifts",
                  value: String(selectedSite?.openShiftCount ?? 0),
                  mono: true,
                },
              ]}
            />
          </>
        ) : (
          <NoRecord
            label={
              setup.isLoading
                ? "Loading the tills"
                : setup.isError
                  ? `The tills would not load. ${getApiErrorMessage(setup.error)}`
                  : search.trim()
                    ? "No till matches that search."
                    : "No tills yet."
            }
          />
        )}

        <CreateDialog
          open={creating}
          onOpenChange={setCreating}
          title="New till"
          submitLabel="Create till"
          busy={save.isPending}
          onSubmit={(event) => {
            event.preventDefault();
            if (!draftName.trim() || !draftSiteId) {
              toast({
                title: "That till was not created",
                description: draftSiteId ? "Give the till a name." : "Say which site it is at.",
                variant: "destructive",
              });
              return;
            }
            save.mutate({
              defaultSiteId: draftSiteId,
              newRegisterName: draftName.trim(),
              // The first till a shop makes is where its cashiers land.
              makeDefault: !defaultId,
            });
          }}
        >
          <CreateField label="Name">
            {(id) => (
              <Input
                id={id}
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="Front till"
                className={DETAIL_CONTROL_CLASS}
              />
            )}
          </CreateField>
          {sites.length > 1 ? (
            <CreateField label="Site">
              {(id) => (
                <DetailSelect id={id} value={draftSiteId} onValueChange={setDraftSiteId}>
                  {sites.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name}
                    </SelectItem>
                  ))}
                </DetailSelect>
              )}
            </CreateField>
          ) : null}
        </CreateDialog>
      </RegisterLayout>
    </ShopSettingsShell>
  );
}
