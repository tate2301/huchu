"use client";

import type { ComponentType, ReactNode } from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  FormField,
  FormPage,
  HeaderAction,
  SectionAction,
  SectionHeading,
} from "@/components/management/ui";
import { PreferencesShell } from "@/components/preferences/preferences-shell";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import {
  AlertTriangle,
  Badge as BrandMark,
  Buildings,
  Certificate,
  CheckCircle,
  FileText,
  Gavel,
  Globe,
  Palette,
  Pencil,
  Phone,
  Policy,
  Save,
  SlidersHorizontal,
  Tag,
} from "@/lib/icons";
import { cn } from "@/lib/utils";

import { AssetField } from "./asset-field";
import styles from "./branding.module.css";
import { BrandingTabs, type BrandingSection } from "./branding-tabs";
import { ColorField } from "./color-field";
import { PaymentAccounts } from "./payment-accounts";

export type { BrandingSection };

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
  privacyPolicyUrl: string | null;
  termsUrl: string | null;
  bankName: string | null;
  bankBranch: string | null;
  bankBranchCode: string | null;
  bankAddress: string | null;
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
  [K in keyof BrandingPayload]: string;
};

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
  privacyPolicyUrl: "",
  termsUrl: "",
  bankName: "",
  bankBranch: "",
  bankBranchCode: "",
  bankAddress: "",
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

/*
  The four document format fields.

  `BrandingFinance.dc.html` draws them as pickers with worked examples rather
  than as the free-text boxes they were — "Date Format (e.g. yyyy-MM-dd)" in a
  placeholder is rule 1's helper text with extra steps. The stored value stays
  a string of at most 40 characters, exactly as `/api/settings/branding`
  validates it, and anything already saved that is not on a list is offered
  back as its own option so choosing nothing cannot quietly rewrite it.

  Date and time keep format strings, which is the vocabulary the old
  placeholders established. Number and currency have never had one — nothing
  in the repo reads either column yet — so the sample itself is the value,
  which is at least self-describing to whoever writes the renderer.
*/
const DATE_FORMATS = [
  { value: "dd MMM yyyy", label: "31 Dec 2026" },
  { value: "yyyy-MM-dd", label: "2026-12-31" },
  { value: "dd/MM/yyyy", label: "31/12/2026" },
];

const TIME_FORMATS = [
  { value: "HH:mm", label: "24 hour" },
  { value: "h:mm a", label: "12 hour" },
];

const NUMBER_FORMATS = [
  { value: "1 234 567.89", label: "1 234 567.89" },
  { value: "1,234,567.89", label: "1,234,567.89" },
];

const CURRENCY_MODES = [
  { value: "USD 1 234.00", label: "USD 1 234.00" },
  { value: "$1 234.00", label: "$1 234.00" },
  { value: "1 234.00 USD", label: "1 234.00 USD" },
];

function withCurrent(
  options: Array<{ value: string; label: string }>,
  current: string,
) {
  const value = current.trim();
  if (!value || options.some((option) => option.value === value)) return options;
  return [...options, { value, label: value }];
}

const DOMAIN_TONE: Record<DomainStatus, "success" | "warn" | "danger" | "neutral"> = {
  ACTIVE: "success",
  VERIFIED: "success",
  PENDING_VERIFICATION: "warn",
  FAILED: "danger",
  DISABLED: "neutral",
};

const DOMAIN_LABEL: Record<DomainStatus, string> = {
  ACTIVE: "Active",
  VERIFIED: "Verified",
  PENDING_VERIFICATION: "Pending",
  FAILED: "Failed",
  DISABLED: "Disabled",
};

/**
 * The form column's width, and so the width every section heading aligns to.
 *
 * `FormPage` defaults to 560 and the three boards draw 560; naming it keeps
 * the headings from drifting away from the fields under them if that ever
 * changes.
 */
const FORM_WIDTH = 560;

function toValue(value: string | null | undefined) {
  return value ?? "";
}

function toNullable(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function formatCheckedAt(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

async function fetchBrandingSettings(): Promise<BrandingSettingsResponse> {
  const response = await fetch("/api/settings/branding", { method: "GET" });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to load branding settings");
  }
  return response.json();
}

/**
 * The company's brand: what it is called, what it looks like, and what every
 * generated document says at the top and the bottom of the page.
 *
 * Boards: `BrandingIdentity.dc.html`, `BrandingAssets.dc.html`,
 * `BrandingFinance.dc.html` — one form page, three sections of one record,
 * with the sections as a tab row under the title line rather than the 280px
 * third-level rail this used to draw inside the surface's own rail.
 *
 * Presentation only. The query key stays `["branding-settings"]`, the three
 * mutations still hit `/api/settings/branding` and its two domain routes
 * unchanged, and the route's `requirePreferencesAccess("branding")` gate is
 * untouched.
 */
export function BrandingSettingsSection({ section }: { section: BrandingSection }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
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
    const branding = settings.branding;
    return {
      ...DEFAULT_FORM_STATE,
      displayName: toValue(branding?.displayName),
      primaryColor: branding?.primaryColor ?? settings.effective.colors.primary,
      secondaryColor: branding?.secondaryColor ?? settings.effective.colors.secondary,
      accentColor: branding?.accentColor ?? settings.effective.colors.accent,
      fontFamilyKey: branding?.fontFamilyKey ?? settings.effective.fontFamilyKey,
      logoUrl: toValue(branding?.logoUrl),
      secondaryLogoUrl: toValue(branding?.secondaryLogoUrl),
      signatureUrl: toValue(branding?.signatureUrl),
      stampUrl: toValue(branding?.stampUrl),
      legalName: toValue(branding?.legalName),
      tradingName: toValue(branding?.tradingName),
      registrationNumber: toValue(branding?.registrationNumber),
      vatNumber: toValue(branding?.vatNumber),
      taxNumber: toValue(branding?.taxNumber),
      email: toValue(branding?.email),
      phone: toValue(branding?.phone),
      website: toValue(branding?.website),
      physicalAddress: toValue(branding?.physicalAddress),
      postalAddress: toValue(branding?.postalAddress),
      privacyPolicyUrl: toValue(branding?.privacyPolicyUrl),
      termsUrl: toValue(branding?.termsUrl),
      bankName: toValue(branding?.bankName),
      bankBranch: toValue(branding?.bankBranch),
      bankBranchCode: toValue(branding?.bankBranchCode),
      bankAddress: toValue(branding?.bankAddress),
      bankAccountName: toValue(branding?.bankAccountName),
      bankAccountNumber: toValue(branding?.bankAccountNumber),
      bankSwiftCode: toValue(branding?.bankSwiftCode),
      bankIban: toValue(branding?.bankIban),
      defaultFooterText: toValue(branding?.defaultFooterText),
      legalDisclaimer: toValue(branding?.legalDisclaimer),
      paymentTerms: toValue(branding?.paymentTerms),
      documentLocale: toValue(branding?.documentLocale),
      dateFormat: toValue(branding?.dateFormat),
      timeFormat: toValue(branding?.timeFormat),
      numberFormat: toValue(branding?.numberFormat),
      currencyDisplayMode: toValue(branding?.currencyDisplayMode),
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
          privacyPolicyUrl: toNullable(payload.privacyPolicyUrl),
          termsUrl: toNullable(payload.termsUrl),
          bankName: toNullable(payload.bankName),
          bankBranch: toNullable(payload.bankBranch),
          bankBranchCode: toNullable(payload.bankBranchCode),
          bankAddress: toNullable(payload.bankAddress),
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
  /*
    Rule 13: a refresh that fails does not blank a form that already loaded.
    React Query keeps `data` and sets `error` when a refetch fails, so the
    failure is the whole screen only when there is nothing behind it —
    otherwise it is a line above the fields the tenant is still editing, and
    Save still reaches the values they typed.
  */
  const loadError = settingsQuery.error as Error | null;
  const ready = Boolean(settings);

  /*
    Rule 2 and rule 9 together: the domain section carries one verb, and which
    one it is depends on where the domain has got to. A typed hostname that is
    not the saved one needs saving; a saved one that is not yet live needs
    checking; a live one needs nothing, so nothing is drawn. Without the
    add-on there is no verb at all rather than two disabled ones.
  */
  const domainVerb = (() => {
    if (!customDomainEnabled) return null;
    const typed = domainInput.trim();
    if (typed && typed !== (currentDomain?.hostname ?? "")) {
      return (
        <SectionAction
          icon={Save}
          disabled={submitDomainMutation.isPending}
          onClick={() => submitDomainMutation.mutate(typed)}
        >
          {submitDomainMutation.isPending ? "Saving" : "Save domain"}
        </SectionAction>
      );
    }
    if (
      currentDomain &&
      currentDomain.status !== "ACTIVE" &&
      currentDomain.status !== "VERIFIED"
    ) {
      return (
        <SectionAction
          icon={CheckCircle}
          disabled={verifyDomainMutation.isPending}
          onClick={() => verifyDomainMutation.mutate(currentDomain.hostname)}
        >
          {verifyDomainMutation.isPending ? "Checking" : "Check DNS"}
        </SectionAction>
      );
    }
    return null;
  })();

  const checkedAt = formatCheckedAt(currentDomain?.lastCheckedAt ?? null);

  /*
    Cancel abandons the page, not half of it. The domain is its own draft
    because it saves through its own route on its own verb, but it is typed in
    the same column as everything else — leaving a typed hostname sitting there
    after Cancel would put the page back in a state the tenant had just said
    they did not want.
  */
  const discard = () => {
    setFormDraft(null);
    setDomainInputDraft(null);
  };

  /* The overflow verb appears once there is anything at all to throw away. */
  const canDiscard = formDraft !== null || domainInputDraft !== null;

  return (
    <PreferencesShell>
      <FormPage
        title="Branding"
        width={FORM_WIDTH}
        className={styles.page}
        action={
          <HeaderAction onClick={() => router.push("/preferences/organization/templates")}>
            Preview a document
          </HeaderAction>
        }
        overflow={
          canDiscard ? (
            <DropdownMenuItem onSelect={discard}>Discard changes</DropdownMenuItem>
          ) : undefined
        }
        busy={saveBrandingMutation.isPending || !ready}
        onCancel={discard}
        onSubmit={(event) => {
          event.preventDefault();
          saveBrandingMutation.mutate(form);
        }}
      >
        <BrandingTabs section={section} />

        {settingsQuery.isLoading ? (
          <LoadingFields />
        ) : !settings ? (
          <p className={styles.failure} role="alert">
            <AlertTriangle />
            {loadError?.message ?? "Couldn’t load branding"}
          </p>
        ) : (
          <>
            {loadError ? (
              <p className={styles.failure} role="alert">
                <AlertTriangle />
                {loadError.message}
              </p>
            ) : null}

            {section === "identity" ? (
              <>
                <Heading icon={Tag} tone="brand">
                  Name
                </Heading>
                <FormField label="Display name">
                  {(id) => (
                    <Input
                      id={id}
                      placeholder={settings?.company.name ?? ""}
                      value={form.displayName}
                      onChange={(event) => setField("displayName", event.target.value)}
                    />
                  )}
                </FormField>

                <Heading icon={Palette} tone="brand">
                  Palette
                </Heading>
                <ColorField
                  label="Primary"
                  swatchLabel="Pick the primary colour"
                  fallback={DEFAULT_FORM_STATE.primaryColor}
                  value={form.primaryColor}
                  onChange={(next) => setField("primaryColor", next)}
                />
                <ColorField
                  label="Secondary"
                  swatchLabel="Pick the secondary colour"
                  fallback={DEFAULT_FORM_STATE.secondaryColor}
                  value={form.secondaryColor}
                  onChange={(next) => setField("secondaryColor", next)}
                />
                <ColorField
                  label="Accent"
                  swatchLabel="Pick the accent colour"
                  fallback={DEFAULT_FORM_STATE.accentColor}
                  value={form.accentColor}
                  onChange={(next) => setField("accentColor", next)}
                />

                <Heading icon={FileText}>Type</Heading>
                <FormField label="Font">
                  {(id) => (
                    <Select
                      value={form.fontFamilyKey || undefined}
                      onValueChange={(value) => setField("fontFamilyKey", value)}
                    >
                      <SelectTrigger id={id}>
                        <SelectValue placeholder="Choose a font" />
                      </SelectTrigger>
                      <SelectContent>
                        {fontOptions.map((option) => (
                          <SelectItem key={option.key} value={option.key}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FormField>

                <Heading icon={Globe} tone="ok" action={domainVerb}>
                  Domain
                </Heading>
                <FormField label="Custom domain">
                  {(id) => (
                    <Input
                      id={id}
                      placeholder="portal.example.com"
                      value={domainInput}
                      onChange={(event) => setDomainInputDraft(event.target.value)}
                    />
                  )}
                </FormField>

                {currentDomain ? (
                  <>
                    <p className={styles.statusRow}>
                      <span
                        className={styles.pill}
                        data-tone={DOMAIN_TONE[currentDomain.status]}
                      >
                        {DOMAIN_LABEL[currentDomain.status]}
                      </span>
                      <span className={styles.statusMeta}>
                        {currentDomain.verificationType}
                        {checkedAt ? ` · checked ${checkedAt}` : ""}
                      </span>
                    </p>

                    {/* The record the tenant has to go and create. Drawn only
                        while it is still needed — once the domain is live it
                        is a fact about the past. */}
                    {currentDomain.status === "ACTIVE" ||
                    currentDomain.status === "VERIFIED" ? null : (
                      <div className={styles.dns}>
                        <span className={styles.dnsRow}>
                          <span className={styles.dnsLabel}>Type</span>
                          <span className={styles.dnsValue}>
                            {currentDomain.verificationType}
                          </span>
                        </span>
                        <span className={styles.dnsRow}>
                          <span className={styles.dnsLabel}>Host</span>
                          <span className={styles.dnsValue}>
                            {currentDomain.verificationHost}
                          </span>
                        </span>
                        <span className={styles.dnsRow}>
                          <span className={styles.dnsLabel}>Value</span>
                          <span className={styles.dnsValue}>
                            {currentDomain.verificationValue}
                          </span>
                        </span>
                      </div>
                    )}
                  </>
                ) : null}

                <Heading icon={Gavel}>Registration</Heading>
                <FormField label="Legal name">
                  {(id) => (
                    <Input
                      id={id}
                      value={form.legalName}
                      onChange={(event) => setField("legalName", event.target.value)}
                    />
                  )}
                </FormField>
                <FormField label="Trading name">
                  {(id) => (
                    <Input
                      id={id}
                      value={form.tradingName}
                      onChange={(event) => setField("tradingName", event.target.value)}
                    />
                  )}
                </FormField>
                <div className={styles.pair}>
                  <FormField label="Registration number">
                    {(id) => (
                      <Input
                        id={id}
                        className={styles.mono}
                        value={form.registrationNumber}
                        onChange={(event) =>
                          setField("registrationNumber", event.target.value)
                        }
                      />
                    )}
                  </FormField>
                  <FormField label="Tax number">
                    {(id) => (
                      <Input
                        id={id}
                        className={styles.mono}
                        value={form.taxNumber}
                        onChange={(event) => setField("taxNumber", event.target.value)}
                      />
                    )}
                  </FormField>
                  <FormField label="VAT number">
                    {(id) => (
                      <Input
                        id={id}
                        className={styles.mono}
                        value={form.vatNumber}
                        onChange={(event) => setField("vatNumber", event.target.value)}
                      />
                    )}
                  </FormField>
                </div>
              </>
            ) : null}

            {section === "assets" ? (
              <>
                <Heading icon={BrandMark} tone="brand">
                  Logos
                </Heading>
                <AssetField
                  label="Logo"
                  icon={BrandMark}
                  removeLabel="Remove the logo"
                  addressLabel="Logo address"
                  value={form.logoUrl}
                  onChange={(next) => setField("logoUrl", next)}
                />
                <AssetField
                  label="Secondary logo"
                  icon={BrandMark}
                  removeLabel="Remove the secondary logo"
                  addressLabel="Secondary logo address"
                  value={form.secondaryLogoUrl}
                  onChange={(next) => setField("secondaryLogoUrl", next)}
                />

                <Heading icon={Pencil}>Signing</Heading>
                <AssetField
                  label="Signature"
                  icon={Pencil}
                  removeLabel="Remove the signature"
                  addressLabel="Signature address"
                  value={form.signatureUrl}
                  onChange={(next) => setField("signatureUrl", next)}
                />
                <AssetField
                  label="Stamp"
                  icon={Certificate}
                  removeLabel="Remove the stamp"
                  addressLabel="Stamp address"
                  value={form.stampUrl}
                  onChange={(next) => setField("stampUrl", next)}
                />

                <Heading icon={Phone} tone="ok">
                  Contact
                </Heading>
                <FormField label="Email">
                  {(id) => (
                    <Input
                      id={id}
                      type="email"
                      value={form.email}
                      onChange={(event) => setField("email", event.target.value)}
                    />
                  )}
                </FormField>
                <FormField label="Phone">
                  {(id) => (
                    <Input
                      id={id}
                      className={styles.mono}
                      value={form.phone}
                      onChange={(event) => setField("phone", event.target.value)}
                    />
                  )}
                </FormField>
                <FormField label="Website">
                  {(id) => (
                    <Input
                      id={id}
                      value={form.website}
                      onChange={(event) => setField("website", event.target.value)}
                    />
                  )}
                </FormField>
                <FormField label="Physical address">
                  {(id) => (
                    <Input
                      id={id}
                      value={form.physicalAddress}
                      onChange={(event) => setField("physicalAddress", event.target.value)}
                    />
                  )}
                </FormField>
                <FormField label="Postal address">
                  {(id) => (
                    <LongInput
                      id={id}
                      value={form.postalAddress}
                      onChange={(next) => setField("postalAddress", next)}
                    />
                  )}
                </FormField>
              </>
            ) : null}

            {section === "finance" ? (
              <>
                <Heading icon={Buildings} tone="brand">
                  Bank
                </Heading>
                <FormField label="Bank">
                  {(id) => (
                    <Input
                      id={id}
                      value={form.bankName}
                      onChange={(event) => setField("bankName", event.target.value)}
                    />
                  )}
                </FormField>
                <div className={styles.pair}>
                  <FormField label="Branch">
                    {(id) => (
                      <Input
                        id={id}
                        value={form.bankBranch}
                        onChange={(event) => setField("bankBranch", event.target.value)}
                      />
                    )}
                  </FormField>
                  <FormField label="Branch code">
                    {(id) => (
                      <Input
                        id={id}
                        className={styles.mono}
                        value={form.bankBranchCode}
                        onChange={(event) => setField("bankBranchCode", event.target.value)}
                      />
                    )}
                  </FormField>
                  <FormField label="Account name">
                    {(id) => (
                      <Input
                        id={id}
                        value={form.bankAccountName}
                        onChange={(event) => setField("bankAccountName", event.target.value)}
                      />
                    )}
                  </FormField>
                  <FormField label="Account number">
                    {(id) => (
                      <Input
                        id={id}
                        className={styles.mono}
                        value={form.bankAccountNumber}
                        onChange={(event) =>
                          setField("bankAccountNumber", event.target.value)
                        }
                      />
                    )}
                  </FormField>
                  <FormField label="SWIFT">
                    {(id) => (
                      <Input
                        id={id}
                        className={styles.mono}
                        value={form.bankSwiftCode}
                        onChange={(event) => setField("bankSwiftCode", event.target.value)}
                      />
                    )}
                  </FormField>
                  <FormField label="IBAN">
                    {(id) => (
                      <Input
                        id={id}
                        className={styles.mono}
                        value={form.bankIban}
                        onChange={(event) => setField("bankIban", event.target.value)}
                      />
                    )}
                  </FormField>
                </div>
                <FormField label="Bank address">
                  {(id) => (
                    <Input
                      id={id}
                      value={form.bankAddress}
                      onChange={(event) => setField("bankAddress", event.target.value)}
                    />
                  )}
                </FormField>

                <PaymentAccounts maxWidth={FORM_WIDTH} />

                <Heading icon={SlidersHorizontal}>Document defaults</Heading>
                <FormField label="Payment terms">
                  {(id) => (
                    <LongInput
                      id={id}
                      value={form.paymentTerms}
                      onChange={(next) => setField("paymentTerms", next)}
                    />
                  )}
                </FormField>
                <FormField label="Footer line">
                  {(id) => (
                    <LongInput
                      id={id}
                      value={form.defaultFooterText}
                      onChange={(next) => setField("defaultFooterText", next)}
                    />
                  )}
                </FormField>
                <div className={styles.pair}>
                  <FormatField
                    label="Date format"
                    options={DATE_FORMATS}
                    value={form.dateFormat}
                    onChange={(next) => setField("dateFormat", next)}
                  />
                  <FormatField
                    label="Time format"
                    options={TIME_FORMATS}
                    value={form.timeFormat}
                    onChange={(next) => setField("timeFormat", next)}
                  />
                  <FormatField
                    label="Number format"
                    options={NUMBER_FORMATS}
                    value={form.numberFormat}
                    onChange={(next) => setField("numberFormat", next)}
                  />
                  <FormatField
                    label="Currency shown as"
                    options={CURRENCY_MODES}
                    value={form.currencyDisplayMode}
                    onChange={(next) => setField("currencyDisplayMode", next)}
                  />
                </div>
                <FormField label="Document locale">
                  {(id) => (
                    <Input
                      id={id}
                      className={styles.mono}
                      placeholder="en-ZW"
                      value={form.documentLocale}
                      onChange={(event) => setField("documentLocale", event.target.value)}
                    />
                  )}
                </FormField>

                <Heading icon={Policy}>Legal</Heading>
                <FormField label="Disclaimer">
                  {(id) => (
                    <Textarea
                      id={id}
                      rows={3}
                      value={form.legalDisclaimer}
                      onChange={(event) => setField("legalDisclaimer", event.target.value)}
                    />
                  )}
                </FormField>
                <FormField label="Privacy policy">
                  {(id) => (
                    <Input
                      id={id}
                      type="url"
                      placeholder="https://"
                      value={form.privacyPolicyUrl}
                      onChange={(event) => setField("privacyPolicyUrl", event.target.value)}
                    />
                  )}
                </FormField>
                <FormField label="Terms and conditions">
                  {(id) => (
                    <Input
                      id={id}
                      type="url"
                      placeholder="https://"
                      value={form.termsUrl}
                      onChange={(event) => setField("termsUrl", event.target.value)}
                    />
                  )}
                </FormField>
              </>
            ) : null}
          </>
        )}
      </FormPage>
    </PreferencesShell>
  );
}

/**
 * The shared section heading at this page's measure.
 *
 * `SectionHeading` caps itself at 470px so a register's section verb lands on
 * its list's right edge; a form column is 560 wide and has no list, so the cap
 * is lifted to the column's own width. Through the prop, not the stylesheet:
 * the shared component writes `max-width` as an inline style, which no rule in
 * a cascade layer can outrank. The boards' 14px of air under the row is
 * restored in `branding.module.css`, where the reasoning sits beside the
 * selector.
 *
 * `tone="ok"` is this page's own: the shared prop is `brand | neutral`, and
 * the boards draw Domain, Contact and the accounts list with a green tile.
 */
function Heading({
  icon,
  tone = "neutral",
  action,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  tone?: "brand" | "neutral" | "ok";
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <SectionHeading
      icon={icon}
      variant="form"
      maxWidth={FORM_WIDTH}
      tone={tone === "brand" ? "brand" : "neutral"}
      action={action}
      className={cn(styles.heading, tone === "ok" && styles.headingOk)}
    >
      {children}
    </SectionHeading>
  );
}

/**
 * A 36px box that grows into a textarea for a value that already has a line
 * break in it.
 *
 * The boards draw payment terms, the footer line and the postal address as
 * single-line fields, and for almost every tenant that is what they are. But
 * an `<input>` runs the HTML value sanitization algorithm, which strips CR and
 * LF — so rendering a stored two-line footer in one would delete the break the
 * next time anything saved, silently and without anyone touching the field.
 */
function LongInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
}) {
  if (value.includes("\n")) {
    return (
      <Textarea
        id={id}
        rows={2}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  return <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} />;
}

/** One of the four document format pickers. */
function FormatField({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <FormField label={label}>
      {(id) => (
        <Select value={value || undefined} onValueChange={onChange}>
          <SelectTrigger id={id}>
            <SelectValue placeholder="Choose" />
          </SelectTrigger>
          <SelectContent>
            {withCurrent(options, value).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );
}

/** Four field-shaped bars while the record loads. */
function LoadingFields() {
  return (
    <div className={styles.skeleton} role="status" aria-label="Loading branding">
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className={styles.skeletonField}>
          <span className={styles.skeletonLabel} />
          <span className={styles.skeletonControl} />
        </div>
      ))}
    </div>
  );
}
