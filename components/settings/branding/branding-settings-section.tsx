"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ManagementShell } from "@/components/settings/management-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

type DomainStatus =
  | "PENDING_VERIFICATION"
  | "VERIFIED"
  | "ACTIVE"
  | "FAILED"
  | "DISABLED";

type BrandingPayload = {
  displayName: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  fontFamilyKey: string | null;
  logoUrl: string | null;
  secondaryLogoUrl: string | null;
  signatureUrl: string | null;
  stampUrl: string | null;
  legalName: string | null;
  tradingName: string | null;
  registrationNumber: string | null;
  vatNumber: string | null;
  taxNumber: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  physicalAddress: string | null;
  postalAddress: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankSwiftCode: string | null;
  bankIban: string | null;
  defaultFooterText: string | null;
  legalDisclaimer: string | null;
  paymentTerms: string | null;
  documentLocale: string | null;
  dateFormat: string | null;
  timeFormat: string | null;
  numberFormat: string | null;
  currencyDisplayMode: string | null;
};

type BrandingSettingsResponse = {
  company: {
    id: string;
    name: string;
    slug: string;
  };
  branding: BrandingPayload | null;
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
  logoUrl: string;
  secondaryLogoUrl: string;
  signatureUrl: string;
  stampUrl: string;
  legalName: string;
  tradingName: string;
  registrationNumber: string;
  vatNumber: string;
  taxNumber: string;
  email: string;
  phone: string;
  website: string;
  physicalAddress: string;
  postalAddress: string;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankSwiftCode: string;
  bankIban: string;
  defaultFooterText: string;
  legalDisclaimer: string;
  paymentTerms: string;
  documentLocale: string;
  dateFormat: string;
  timeFormat: string;
  numberFormat: string;
  currencyDisplayMode: string;
};

export type BrandingSection = "identity" | "assets" | "finance";

const DEFAULT_FORM_STATE: BrandingFormState = {
  displayName: "",
  primaryColor: "#0f8f86",
  secondaryColor: "#dcf4f1",
  accentColor: "#ebf7f5",
  fontFamilyKey: "huchu",
  logoUrl: "",
  secondaryLogoUrl: "",
  signatureUrl: "",
  stampUrl: "",
  legalName: "",
  tradingName: "",
  registrationNumber: "",
  vatNumber: "",
  taxNumber: "",
  email: "",
  phone: "",
  website: "",
  physicalAddress: "",
  postalAddress: "",
  bankName: "",
  bankAccountName: "",
  bankAccountNumber: "",
  bankSwiftCode: "",
  bankIban: "",
  defaultFooterText: "",
  legalDisclaimer: "",
  paymentTerms: "",
  documentLocale: "",
  dateFormat: "",
  timeFormat: "",
  numberFormat: "",
  currencyDisplayMode: "",
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

function toValue(value: string | null | undefined) {
  return value ?? "";
}

function toNullable(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

async function fetchBrandingSettings(): Promise<BrandingSettingsResponse> {
  const response = await fetch("/api/settings/branding", { method: "GET" });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to load branding settings");
  }
  return response.json();
}

export function BrandingSettingsSection({ section }: { section: BrandingSection }) {
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
    if (!settings) return DEFAULT_FORM_STATE;
    return {
      displayName: toValue(settings.branding?.displayName),
      primaryColor: settings.branding?.primaryColor ?? settings.effective.colors.primary,
      secondaryColor: settings.branding?.secondaryColor ?? settings.effective.colors.secondary,
      accentColor: settings.branding?.accentColor ?? settings.effective.colors.accent,
      fontFamilyKey: settings.branding?.fontFamilyKey ?? settings.effective.fontFamilyKey,
      logoUrl: toValue(settings.branding?.logoUrl),
      secondaryLogoUrl: toValue(settings.branding?.secondaryLogoUrl),
      signatureUrl: toValue(settings.branding?.signatureUrl),
      stampUrl: toValue(settings.branding?.stampUrl),
      legalName: toValue(settings.branding?.legalName),
      tradingName: toValue(settings.branding?.tradingName),
      registrationNumber: toValue(settings.branding?.registrationNumber),
      vatNumber: toValue(settings.branding?.vatNumber),
      taxNumber: toValue(settings.branding?.taxNumber),
      email: toValue(settings.branding?.email),
      phone: toValue(settings.branding?.phone),
      website: toValue(settings.branding?.website),
      physicalAddress: toValue(settings.branding?.physicalAddress),
      postalAddress: toValue(settings.branding?.postalAddress),
      bankName: toValue(settings.branding?.bankName),
      bankAccountName: toValue(settings.branding?.bankAccountName),
      bankAccountNumber: toValue(settings.branding?.bankAccountNumber),
      bankSwiftCode: toValue(settings.branding?.bankSwiftCode),
      bankIban: toValue(settings.branding?.bankIban),
      defaultFooterText: toValue(settings.branding?.defaultFooterText),
      legalDisclaimer: toValue(settings.branding?.legalDisclaimer),
      paymentTerms: toValue(settings.branding?.paymentTerms),
      documentLocale: toValue(settings.branding?.documentLocale),
      dateFormat: toValue(settings.branding?.dateFormat),
      timeFormat: toValue(settings.branding?.timeFormat),
      numberFormat: toValue(settings.branding?.numberFormat),
      currencyDisplayMode: toValue(settings.branding?.currencyDisplayMode),
    };
  }, [settings]);

  const form = formDraft ?? baseForm;
  const domainInput = domainInputDraft ?? settings?.domain?.hostname ?? "";

  const setField = <K extends keyof BrandingFormState>(field: K, value: BrandingFormState[K]) => {
    setFormDraft((prev) => ({
      ...(prev ?? form),
      [field]: value,
    }));
  };

  const saveBrandingMutation = useMutation({
    mutationFn: async (payload: BrandingFormState) => {
      const response = await fetch("/api/settings/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: toNullable(payload.displayName),
          primaryColor: payload.primaryColor,
          secondaryColor: payload.secondaryColor,
          accentColor: payload.accentColor,
          fontFamilyKey: payload.fontFamilyKey,
          logoUrl: toNullable(payload.logoUrl),
          secondaryLogoUrl: toNullable(payload.secondaryLogoUrl),
          signatureUrl: toNullable(payload.signatureUrl),
          stampUrl: toNullable(payload.stampUrl),
          legalName: toNullable(payload.legalName),
          tradingName: toNullable(payload.tradingName),
          registrationNumber: toNullable(payload.registrationNumber),
          vatNumber: toNullable(payload.vatNumber),
          taxNumber: toNullable(payload.taxNumber),
          email: toNullable(payload.email),
          phone: toNullable(payload.phone),
          website: toNullable(payload.website),
          physicalAddress: toNullable(payload.physicalAddress),
          postalAddress: toNullable(payload.postalAddress),
          bankName: toNullable(payload.bankName),
          bankAccountName: toNullable(payload.bankAccountName),
          bankAccountNumber: toNullable(payload.bankAccountNumber),
          bankSwiftCode: toNullable(payload.bankSwiftCode),
          bankIban: toNullable(payload.bankIban),
          defaultFooterText: toNullable(payload.defaultFooterText),
          legalDisclaimer: toNullable(payload.legalDisclaimer),
          paymentTerms: toNullable(payload.paymentTerms),
          documentLocale: toNullable(payload.documentLocale),
          dateFormat: toNullable(payload.dateFormat),
          timeFormat: toNullable(payload.timeFormat),
          numberFormat: toNullable(payload.numberFormat),
          currencyDisplayMode: toNullable(payload.currencyDisplayMode),
        }),
      });

      const body = (await response.json().catch(() => null)) as { error?: string } | null;
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
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Failed to save custom domain");
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
      if (!response.ok) throw new Error(body?.error ?? "Failed to verify custom domain");
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

  const sectionMeta = {
    identity: {
      title: "Brand Identity",
      description: "Control company identity, theme palette, and custom domain setup.",
    },
    assets: {
      title: "Brand Assets",
      description: "Manage logos, signatures, and contact details for generated documents.",
    },
    finance: {
      title: "Finance & Defaults",
      description: "Define legal, banking, and document defaults used across templates.",
    },
  }[section];

  const hasLoadError = Boolean(settingsQuery.error);

  return (
    <ManagementShell
      area="branding"
      title={sectionMeta.title}
      description={sectionMeta.description}
      actions={
        <Button
          type="button"
          onClick={() => saveBrandingMutation.mutate(formDraft ?? form)}
          disabled={saveBrandingMutation.isPending || settingsQuery.isLoading || hasLoadError}
        >
          {saveBrandingMutation.isPending ? "Saving..." : "Save Changes"}
        </Button>
      }
    >
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
          {section === "identity" ? (
            <Card>
            <CardHeader>
              <CardTitle>Identity and Theme</CardTitle>
              <CardDescription>
                Core company identity and the color/typography palette used on generated documents.
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
                    onChange={(event) => setField("displayName", event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold" htmlFor="font-family">
                    Primary Font
                  </label>
                  <Select
                    value={form.fontFamilyKey}
                    onValueChange={(value) => setField("fontFamilyKey", value)}
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
                          setField(
                            colorField.key as "primaryColor" | "secondaryColor" | "accentColor",
                            event.target.value,
                          )
                        }
                      />
                      <Input
                        value={colorField.value}
                        onChange={(event) =>
                          setField(
                            colorField.key as "primaryColor" | "secondaryColor" | "accentColor",
                            event.target.value,
                          )
                        }
                        placeholder="#000000"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  placeholder="Legal Name"
                  value={form.legalName}
                  onChange={(event) => setField("legalName", event.target.value)}
                />
                <Input
                  placeholder="Trading Name"
                  value={form.tradingName}
                  onChange={(event) => setField("tradingName", event.target.value)}
                />
                <Input
                  placeholder="Registration Number"
                  value={form.registrationNumber}
                  onChange={(event) => setField("registrationNumber", event.target.value)}
                />
                <Input
                  placeholder="Tax Number"
                  value={form.taxNumber}
                  onChange={(event) => setField("taxNumber", event.target.value)}
                />
                <Input
                  placeholder="VAT Number"
                  value={form.vatNumber}
                  onChange={(event) => setField("vatNumber", event.target.value)}
                />
              </div>

              <div className="rounded-lg border bg-muted/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Live Preview
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-md" style={{ backgroundColor: effectivePreview.primaryColor }} />
                  <div>
                    <p className="text-sm font-semibold">{effectivePreview.displayName}</p>
                    <p className="text-xs text-muted-foreground">
                      Primary {effectivePreview.primaryColor} | Secondary {effectivePreview.secondaryColor} | Accent{" "}
                      {effectivePreview.accentColor}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
            </Card>
          ) : null}

          {section === "assets" ? (
            <Card>
            <CardHeader>
              <CardTitle>Brand Assets and Contact</CardTitle>
              <CardDescription>
                Asset and contact fields used by templates for headers, signatures, and contact blocks.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Input placeholder="Logo URL" value={form.logoUrl} onChange={(event) => setField("logoUrl", event.target.value)} />
                <Input
                  placeholder="Secondary Logo URL"
                  value={form.secondaryLogoUrl}
                  onChange={(event) => setField("secondaryLogoUrl", event.target.value)}
                />
                <Input
                  placeholder="Signature URL"
                  value={form.signatureUrl}
                  onChange={(event) => setField("signatureUrl", event.target.value)}
                />
                <Input placeholder="Stamp URL" value={form.stampUrl} onChange={(event) => setField("stampUrl", event.target.value)} />
                <Input placeholder="Email" value={form.email} onChange={(event) => setField("email", event.target.value)} />
                <Input placeholder="Phone" value={form.phone} onChange={(event) => setField("phone", event.target.value)} />
                <Input placeholder="Website" value={form.website} onChange={(event) => setField("website", event.target.value)} />
                <Input
                  placeholder="Physical Address"
                  value={form.physicalAddress}
                  onChange={(event) => setField("physicalAddress", event.target.value)}
                />
              </div>
              <Textarea
                placeholder="Postal Address"
                value={form.postalAddress}
                onChange={(event) => setField("postalAddress", event.target.value)}
              />
            </CardContent>
            </Card>
          ) : null}

          {section === "finance" ? (
            <Card>
            <CardHeader>
              <CardTitle>Finance and Document Defaults</CardTitle>
              <CardDescription>
                Bank, payment, legal, and localization values used by invoice/report templates.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Input placeholder="Bank Name" value={form.bankName} onChange={(event) => setField("bankName", event.target.value)} />
                <Input
                  placeholder="Bank Account Name"
                  value={form.bankAccountName}
                  onChange={(event) => setField("bankAccountName", event.target.value)}
                />
                <Input
                  placeholder="Bank Account Number"
                  value={form.bankAccountNumber}
                  onChange={(event) => setField("bankAccountNumber", event.target.value)}
                />
                <Input
                  placeholder="SWIFT Code"
                  value={form.bankSwiftCode}
                  onChange={(event) => setField("bankSwiftCode", event.target.value)}
                />
                <Input placeholder="IBAN" value={form.bankIban} onChange={(event) => setField("bankIban", event.target.value)} />
                <Input
                  placeholder="Document Locale (e.g. en-US)"
                  value={form.documentLocale}
                  onChange={(event) => setField("documentLocale", event.target.value)}
                />
                <Input
                  placeholder="Date Format (e.g. yyyy-MM-dd)"
                  value={form.dateFormat}
                  onChange={(event) => setField("dateFormat", event.target.value)}
                />
                <Input
                  placeholder="Time Format (e.g. HH:mm)"
                  value={form.timeFormat}
                  onChange={(event) => setField("timeFormat", event.target.value)}
                />
                <Input
                  placeholder="Number Format"
                  value={form.numberFormat}
                  onChange={(event) => setField("numberFormat", event.target.value)}
                />
                <Input
                  placeholder="Currency Display Mode"
                  value={form.currencyDisplayMode}
                  onChange={(event) => setField("currencyDisplayMode", event.target.value)}
                />
              </div>
              <Textarea
                placeholder="Default Footer Text"
                value={form.defaultFooterText}
                onChange={(event) => setField("defaultFooterText", event.target.value)}
              />
              <Textarea
                placeholder="Legal Disclaimer"
                value={form.legalDisclaimer}
                onChange={(event) => setField("legalDisclaimer", event.target.value)}
              />
              <Textarea
                placeholder="Payment Terms"
                value={form.paymentTerms}
                onChange={(event) => setField("paymentTerms", event.target.value)}
              />
            </CardContent>
            </Card>
          ) : null}

          {section === "identity" ? (
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
                  disabled={!customDomainEnabled || submitDomainMutation.isPending || !domainInput.trim()}
                >
                  {submitDomainMutation.isPending ? "Saving..." : "Save Domain"}
                </Button>
                <Button
                  type="button"
                  onClick={() => verifyDomainMutation.mutate(currentDomain?.hostname ?? domainInput)}
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
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No custom domain configured yet.
                </p>
              )}
            </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </ManagementShell>
  );
}

