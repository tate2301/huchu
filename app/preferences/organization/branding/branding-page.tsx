"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button, Empty, Icon } from "@/components/core";
import { BrandingView } from "@/components/management/branding/branding-view";
import { PayAccountsDrawer } from "@/components/management/branding/pay-accounts-drawer";
import { KitPage, OwnsChrome } from "@/components/management/ui";
import { ManagementShell } from "@/components/settings/management-shell";
import { useToast } from "@/components/ui/use-toast";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  BRANDING_TABS,
  changedFields,
  domainVerb,
  findingFor,
  formOf,
  invalidColours,
  payloadOf,
  previewOf,
  tabOfPath,
  type BrandingField,
  type BrandingForm,
  type BrandingResponse,
  type BrandingTab,
  type PaymentAccount,
} from "@/lib/branding/form";
import { productForProfile } from "@/lib/theme/products";

const SETTINGS_KEY = ["branding-settings"] as const;
const ACCOUNTS_KEY = ["branding-payment-accounts"] as const;
const ACCOUNTS_URL = "/api/settings/branding/payment-accounts";

/**
 * Management → Branding: the three tabs over one record, with the quotation
 * beside them. The tabs change the address without leaving the page, so a
 * draft on one tab is still there on the next and Save (Ctrl S) saves all of
 * it; a reload or a bookmark opens the tab in the address.
 */
export function BrandingPage({ initialTab }: { initialTab: BrandingTab }) {
  const { toast } = useToast();
  const client = useQueryClient();
  const { data: session } = useSession();
  const [tab, setTab] = React.useState<BrandingTab>(initialTab);
  const [draft, setDraft] = React.useState<BrandingForm | null>(null);
  const [typedDomain, setTypedDomain] = React.useState<string | null>(null);
  const [accountsOpen, setAccountsOpen] = React.useState(false);

  React.useEffect(() => {
    const sync = () => setTab((current) => tabOfPath(window.location.pathname, current));
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const changeTab = (next: BrandingTab) => {
    setTab(next);
    const href = BRANDING_TABS.find((item) => item.value === next)?.href;
    if (href && window.location.pathname !== href) window.history.pushState(null, "", href);
  };

  const settings = useQuery({ queryKey: SETTINGS_KEY, queryFn: () => fetchJson<BrandingResponse>("/api/settings/branding") });
  const accounts = useQuery({
    queryKey: ACCOUNTS_KEY,
    queryFn: () => fetchJson<{ accounts: PaymentAccount[] }>(ACCOUNTS_URL),
    enabled: settings.isSuccess,
  });

  const data = settings.data;
  const saved = React.useMemo(() => (data ? formOf(data) : null), [data]);
  const form = draft ?? saved;
  const changed = saved && form ? changedFields(saved, form) : [];
  const dirty = changed.length > 0;

  const set = (field: BrandingField, value: string) => setDraft((current) => ({ ...(current ?? (saved as BrandingForm)), [field]: value }));

  const save = useMutation({
    mutationFn: (next: BrandingForm) => fetchJson("/api/settings/branding", { method: "PUT", body: JSON.stringify(payloadOf(next)) }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: SETTINGS_KEY });
      setDraft(null);
      toast({ title: "Branding saved", description: "New documents print with it from now on.", variant: "success" });
    },
    onError: (error) => toast({ title: "Branding was not saved", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const onSave = () => {
    if (!form || !dirty) return;
    const bad = invalidColours(form);
    if (bad.length) {
      toast({ title: "Branding was not saved", description: "A colour is a # and six letters or digits, like #CF3D1D.", variant: "destructive" });
      return;
    }
    save.mutate(form);
  };

  const domainSave = useMutation({
    mutationFn: (hostname: string) => fetchJson("/api/settings/branding/domain", { method: "POST", body: JSON.stringify({ hostname }) }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: SETTINGS_KEY });
      setTypedDomain(null);
      toast({ title: "Domain saved", description: "Add the DNS record shown, then check it here.", variant: "success" });
    },
    onError: (error) => toast({ title: "The domain was not saved", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const domainCheck = useMutation({
    mutationFn: (hostname: string) =>
      fetchJson<{ verified?: boolean; message?: string }>("/api/settings/branding/domain/verify", {
        method: "POST",
        body: JSON.stringify({ hostname }),
      }),
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: SETTINGS_KEY });
      setTypedDomain(null);
      toast({
        title: result?.verified ? "Domain verified" : "Not found yet",
        description: result?.message ?? (result?.verified ? "People can sign in there now." : "The record was not found. DNS can take a few minutes; check again then."),
        variant: result?.verified ? "success" : "default",
      });
    },
    onError: (error) => toast({ title: "The domain was not checked", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const accountWrite = useMutation({
    mutationFn: async (writes: Array<{ id: string; showOnDocuments?: boolean; documentPosition?: number }>) => {
      for (const { id, ...patch } of writes) {
        await fetchJson(`${ACCOUNTS_URL}/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      }
    },
    onSettled: () => client.invalidateQueries({ queryKey: ACCOUNTS_KEY }),
    onError: (error) => toast({ title: "The account did not change", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  let body: React.ReactNode;
  if (data && form) {
    const accountList = accounts.data?.accounts ?? [];
    const fontKey =
      form.fontFamilyKey === "huchu" && productForProfile((session?.user as { workspaceProfile?: string } | undefined)?.workspaceProfile) === "corelith"
        ? "inter"
        : form.fontFamilyKey;
    const fontFamily = data.fontOptions.find((option) => option.key === fontKey)?.fontFamily ?? null;
    const typed = typedDomain ?? data.domain?.hostname ?? "";
    body = (
      <BrandingView
        tab={tab}
        onTab={changeTab}
        data={data}
        form={form}
        set={set}
        finding={findingFor(tab, form, { companyName: data.company.name, hasRecord: Boolean(data.branding), accounts: accountList })}
        preview={previewOf(form, { companyName: data.company.name, accounts: accountList, fontFamily })}
        dirty={dirty}
        saving={save.isPending}
        onSave={onSave}
        onDiscard={() => {
          setDraft(null);
          setTypedDomain(null);
        }}
        problem={settings.isError ? `Branding did not refresh: ${getApiErrorMessage(settings.error)}. What you type is kept.` : null}
        domain={{
          typed,
          onType: setTypedDomain,
          verb: domainVerb({ enabled: data.effective.customDomainEnabled, typed, saved: data.domain }),
          busy: domainSave.isPending || domainCheck.isPending,
          onSave: () => domainSave.mutate(typed.trim()),
          onCheck: () => data.domain && domainCheck.mutate(data.domain.hostname),
        }}
        accounts={{ list: accountList, onOpen: () => setAccountsOpen(true) }}
      />
    );
  } else if (settings.isError) {
    const refused = settings.error instanceof ApiError && settings.error.status === 403;
    body = (
      <KitPage title="Branding" mark={<Icon name="brand" />}>
        <Empty
          icon={refused ? "lock" : "warn"}
          title={refused ? "Only the workspace’s owner changes its branding" : "Branding did not load"}
          action={
            refused ? null : (
              <Button icon="history" onClick={() => void settings.refetch()}>
                Try again
              </Button>
            )
          }
        >
          {refused ? getApiErrorMessage(settings.error) : getApiErrorMessage(settings.error, "Check the connection and try again.")}
        </Empty>
      </KitPage>
    );
  } else {
    body = (
      <KitPage title="Branding" mark={<Icon name="brand" />} flush>
        <div aria-busy="true" aria-label="Loading branding" style={{ display: "flex", flex: 1, minHeight: 0 }}>
          <div className="kbody" style={{ padding: "12px 24px", gap: 16 }}>
            <div className="skeleton" style={{ height: 36, width: 420, maxWidth: "100%" }} />
            <div className="skeleton" style={{ height: 56, maxWidth: 720 }} />
            {[0, 1, 2, 3, 4].map((row) => (
              <div key={row} className="skeleton" style={{ height: 40, maxWidth: 820 }} />
            ))}
          </div>
        </div>
      </KitPage>
    );
  }

  return (
    <ManagementShell>
      <OwnsChrome>
        {body}
        <PayAccountsDrawer
          open={accountsOpen}
          onOpenChange={setAccountsOpen}
          accounts={accounts.data?.accounts ?? []}
          loading={accounts.isLoading}
          failed={accounts.isError}
          busy={accountWrite.isPending}
          onShow={(id, shown) => accountWrite.mutate([{ id, showOnDocuments: shown }])}
          onOrder={(ordered) =>
            accountWrite.mutate(
              ordered
                .map((account, index) => ({ id: account.id, documentPosition: index, was: account.documentPosition }))
                .filter((write) => write.was !== write.documentPosition)
                .map(({ id, documentPosition }) => ({ id, documentPosition })),
            )
          }
        />
      </OwnsChrome>
    </ManagementShell>
  );
}
