"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";

import { Button, Empty, Icon } from "@/components/core";
import { BrandWhereView } from "@/components/management/branding/where-view";
import { KitPage, OwnsChrome } from "@/components/management/ui";
import { ManagementShell } from "@/components/settings/management-shell";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { formOf, previewOf, type BrandingResponse, type PaymentAccount } from "@/lib/branding/form";
import { productForProfile } from "@/lib/theme/products";

/** Branding → Where it shows, on the workspace's saved brand. */
export function BrandWherePage() {
  const { data: session } = useSession();
  const settings = useQuery({ queryKey: ["branding-settings"], queryFn: () => fetchJson<BrandingResponse>("/api/settings/branding") });
  const accounts = useQuery({
    queryKey: ["branding-payment-accounts"],
    queryFn: () => fetchJson<{ accounts: PaymentAccount[] }>("/api/settings/branding/payment-accounts"),
    enabled: settings.isSuccess,
  });

  let body: React.ReactNode;
  if (settings.data) {
    const data = settings.data;
    const form = formOf(data);
    const corelith = productForProfile((session?.user as { workspaceProfile?: string } | undefined)?.workspaceProfile) === "corelith";
    const fontKey = form.fontFamilyKey === "huchu" && corelith ? "inter" : form.fontFamilyKey;
    const preview = previewOf(form, {
      companyName: data.company.name,
      accounts: accounts.data?.accounts ?? [],
      fontFamily: data.fontOptions.find((option) => option.key === fontKey)?.fontFamily ?? null,
    });
    body = <BrandWhereView preview={preview} email={form.email.trim() || null} />;
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
          {getApiErrorMessage(settings.error, "Check the connection and try again.")}
        </Empty>
      </KitPage>
    );
  } else {
    body = (
      <KitPage title="Branding" mark={<Icon name="brand" />}>
        <div aria-busy="true" aria-label="Loading branding" style={{ display: "grid", gap: 16 }}>
          <div className="skeleton" style={{ height: 32, maxWidth: 640 }} />
          <div className="skeleton" style={{ height: 48, maxWidth: 760 }} />
          <div className="skeleton" style={{ height: 280 }} />
        </div>
      </KitPage>
    );
  }

  return (
    <ManagementShell>
      <OwnsChrome>{body}</OwnsChrome>
    </ManagementShell>
  );
}
