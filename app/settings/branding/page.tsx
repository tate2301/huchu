"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeading } from "@/components/layout/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";

type DomainStatus =
  | "PENDING_VERIFICATION"
  | "VERIFIED"
  | "ACTIVE"
  | "FAILED"
  | "DISABLED";

type BrandingSettingsResponse = {
  company: {
    id: string;
    name: string;
    slug: string;
  };
  branding: {
    displayName: string | null;
    primaryColor: string | null;
    secondaryColor: string | null;
    accentColor: string | null;
    fontFamilyKey: string | null;
  } | null;
  effective: {
    displayName: string;
    brandingEnabled: boolean;
    customDomainEnabled: boolean;
    colors: {
      primary: string;
      secondary: string;
      accent: string;
    };
    fontFamilyKey: string;
  };
  domain: {
    hostname: string;
    status: DomainStatus;
    verificationType: string;
    verificationHost: string;
    verificationValue: string;
    lastCheckedAt: string | null;
    verifiedAt: string | null;
    activatedAt: string | null;
  } | null;
  fontOptions: Array<{
    key: string;
    label: string;
    fontFamily: string;
  }>;
};

type BrandingFormState = {
  displayName: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamilyKey: string;
};

const DEFAULT_FORM_STATE: BrandingFormState = {
  displayName: "",
  primaryColor: "#0f8f86",
  secondaryColor: "#dcf4f1",
  accentColor: "#ebf7f5",
  fontFamilyKey: "huchu",
};

function statusVariant(status: DomainStatus) {
  if (status === "ACTIVE") return "default" as const;
  if (status === "FAILED") return "destructive" as const;
  if (status === "PENDING_VERIFICATION") return "secondary" as const;
  return "outline" as const;
}

function statusLabel(status: DomainStatus) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function fetchBrandingSettings(): Promise<BrandingSettingsResponse> {
  const response = await fetch("/api/settings/branding", { method: "GET" });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to load branding settings");
  }
  return response.json();
}

export default function BrandingSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formDraft, setFormDraft] = useState<BrandingFormState | null>(null);
  const [domainInputDraft, setDomainInputDraft] = useState<string | null>(null);

  const settingsQuery = useQuery({
    queryKey: ["branding-settings"],
    queryFn: fetchBrandingSettings,
  });

  const settings = settingsQuery.data;
  const currentDomain = settings?.domain ?? null;
  const customDomainEnabled = settings?.effective.customDomainEnabled ?? false;

  const baseForm = useMemo<BrandingFormState>(() => {
    if (!settings) {
      return DEFAULT_FORM_STATE;
    }
    return {
      displayName: settings.branding?.displayName ?? "",
      primaryColor: settings.branding?.primaryColor ?? settings.effective.colors.primary,
      secondaryColor: settings.branding?.secondaryColor ?? settings.effective.colors.secondary,
      accentColor: settings.branding?.accentColor ?? settings.effective.colors.accent,
      fontFamilyKey: settings.branding?.fontFamilyKey ?? settings.effective.fontFamilyKey,
    };
  }, [settings]);

  const form = formDraft ?? baseForm;
  const domainInput = domainInputDraft ?? settings?.domain?.hostname ?? "";

  const saveBrandingMutation = useMutation({
    mutationFn: async (payload: BrandingFormState) => {
      const response = await fetch("/api/settings/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: payload.displayName.trim() ? payload.displayName.trim() : null,
          primaryColor: payload.primaryColor,
          secondaryColor: payload.secondaryColor,
          accentColor: payload.accentColor,
          fontFamilyKey: payload.fontFamilyKey,
        }),
      });

      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "Failed to save branding settings");
      }
      return body;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["branding-settings"] });
      setFormDraft(null);
      toast({
        title: "Branding updated",
        description: "Branding settings have been saved.",
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Unable to save branding",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const submitDomainMutation = useMutation({
    mutationFn: async (hostname: string) => {
      const response = await fetch("/api/settings/branding/domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostname }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "Failed to save custom domain");
      }
      return body;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["branding-settings"] });
      setDomainInputDraft(null);
      toast({
        title: "Domain saved",
        description: "DNS verification details were generated for your domain.",
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Unable to save domain",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const verifyDomainMutation = useMutation({
    mutationFn: async (hostname: string) => {
      const response = await fetch("/api/settings/branding/domain/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostname }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string; verified?: boolean; message?: string }
        | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "Failed to verify custom domain");
      }
      return body;
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["branding-settings"] });
      setDomainInputDraft(null);
      toast({
        title: result?.verified ? "Domain verified" : "Verification pending",
        description:
          result?.message ??
          (result?.verified
            ? "Domain is active."
            : "TXT record was not found yet. Try again in a few minutes."),
        variant: result?.verified ? "success" : "default",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Unable to verify domain",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const fontOptions = settings?.fontOptions ?? [];

  const effectivePreview = useMemo(
    () => ({
      displayName: form.displayName.trim() || settings?.company?.name || "Company",
      primaryColor: form.primaryColor,
      secondaryColor: form.secondaryColor,
      accentColor: form.accentColor,
    }),
    [form, settings?.company?.name],
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeading
        title="Branding"
        description="Customize your tenant identity, colors, typography, and custom domain."
      />

      {settingsQuery.isLoading ? (
        <Card>
          <CardContent className="py-10 text-sm text-muted-foreground">
            Loading branding settings...
          </CardContent>
        </Card>
      ) : settingsQuery.error ? (
        <Card>
          <CardContent className="py-10 text-sm text-destructive">
            {(settingsQuery.error as Error).message}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Brand Identity</CardTitle>
              <CardDescription>
                These settings apply across login and your workspace experience.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-semibold" htmlFor="display-name">
                    Display Name
                  </label>
                  <Input
                    id="display-name"
                    placeholder={settings?.company.name ?? "Company Name"}
                    value={form.displayName}
                    onChange={(event) =>
                      setFormDraft((prev) => ({
                        ...(prev ?? form),
                        displayName: event.target.value,
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty to use your company name.
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold" htmlFor="font-family">
                    Primary Font
                  </label>
                  <Select
                    value={form.fontFamilyKey}
                    onValueChange={(value) =>
                      setFormDraft((prev) => ({
                        ...(prev ?? form),
                        fontFamilyKey: value,
                      }))
                    }
                  >
                    <SelectTrigger id="font-family">
                      <SelectValue placeholder="Select font" />
                    </SelectTrigger>
                    <SelectContent>
                      {fontOptions.map((option) => (
                        <SelectItem key={option.key} value={option.key}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {[
                  { id: "primary-color", key: "primaryColor", label: "Primary", value: form.primaryColor },
                  { id: "secondary-color", key: "secondaryColor", label: "Secondary", value: form.secondaryColor },
                  { id: "accent-color", key: "accentColor", label: "Accent", value: form.accentColor },
                ].map((colorField) => (
                  <div key={colorField.id} className="space-y-2">
                    <label className="text-sm font-semibold" htmlFor={colorField.id}>
                      {colorField.label} Color
                    </label>
                    <div className="flex items-center gap-3">
                      <Input
                        id={colorField.id}
                        type="color"
                        className="h-10 w-14 p-1"
                        value={colorField.value}
                        onChange={(event) =>
                          setFormDraft((prev) => ({
                            ...(prev ?? form),
                            [colorField.key]: event.target.value,
                          }))
                        }
                      />
                      <Input
                        value={colorField.value}
                        onChange={(event) =>
                          setFormDraft((prev) => ({
                            ...(prev ?? form),
                            [colorField.key]: event.target.value,
                          }))
                        }
                        placeholder="#000000"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border bg-muted/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Live Preview
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <div
                    className="h-9 w-9 rounded-md"
                    style={{ backgroundColor: effectivePreview.primaryColor }}
                  />
                  <div>
                    <p className="text-sm font-semibold">{effectivePreview.displayName}</p>
                    <p className="text-xs text-muted-foreground">
                      Primary {effectivePreview.primaryColor} · Secondary {effectivePreview.secondaryColor} · Accent{" "}
                      {effectivePreview.accentColor}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end">
                <Button
                  type="button"
                  onClick={() => saveBrandingMutation.mutate(formDraft ?? form)}
                  disabled={saveBrandingMutation.isPending}
                >
                  {saveBrandingMutation.isPending ? "Saving..." : "Save Branding"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Custom Domain</CardTitle>
              <CardDescription>
                Connect your own domain and verify ownership using a DNS TXT record.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-[1fr_auto_auto] md:items-end">
                <div className="space-y-2">
                  <label className="text-sm font-semibold" htmlFor="custom-domain">
                    Domain Hostname
                  </label>
                  <Input
                    id="custom-domain"
                    placeholder="portal.example.com"
                    value={domainInput}
                    onChange={(event) => setDomainInputDraft(event.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => submitDomainMutation.mutate(domainInput)}
                  disabled={
                    !customDomainEnabled ||
                    submitDomainMutation.isPending ||
                    !domainInput.trim()
                  }
                >
                  {submitDomainMutation.isPending ? "Saving..." : "Save Domain"}
                </Button>
                <Button
                  type="button"
                  onClick={() =>
                    verifyDomainMutation.mutate(currentDomain?.hostname ?? domainInput)
                  }
                  disabled={
                    !customDomainEnabled ||
                    verifyDomainMutation.isPending ||
                    !(currentDomain?.hostname || domainInput.trim())
                  }
                >
                  {verifyDomainMutation.isPending ? "Verifying..." : "Verify DNS"}
                </Button>
              </div>

              {!customDomainEnabled ? (
                <p className="text-sm text-muted-foreground">
                  Enable the custom domain add-on to connect a branded domain.
                </p>
              ) : null}

              {currentDomain ? (
                <div className="space-y-3 rounded-lg border p-4">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{currentDomain.hostname}</p>
                    <Badge variant={statusVariant(currentDomain.status)}>
                      {statusLabel(currentDomain.status)}
                    </Badge>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        DNS TXT Host
                      </p>
                      <p className="mt-1 font-mono text-sm">{currentDomain.verificationHost}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        DNS TXT Value
                      </p>
                      <p className="mt-1 font-mono text-sm">{currentDomain.verificationValue}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Add the TXT record above in your DNS provider, then click <span className="font-semibold">Verify DNS</span>.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No custom domain configured yet.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
