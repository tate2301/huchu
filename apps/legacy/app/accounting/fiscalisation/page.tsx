"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { BandChip, type BandChipTone } from "@/components/accounting/band-chip";
import type { BadgeTone } from "@/components/accounting/report-table";
import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { Button } from "@corelithzw/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@corelithzw/ui/components/card";
import { AccountingListView as DataTable } from "@/components/accounting/listview/accounting-list-view";
import {
  FISCAL_DAY_FLEET_KEY,
  FiscalDayConsole,
  ZIMRA_MAX_OPEN_HOURS,
  fetchFiscalDayFleet,
  hoursOpen,
} from "@/components/accounting/fiscalisation/fiscal-day-console";
import { Input } from "@corelithzw/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { TimeAgo } from "@corelithzw/ui/components/time-ago";
import { VerticalDataViews } from "@corelithzw/ui/components/vertical-data-views";
import { useToast } from "@corelithzw/ui/components/use-toast";
import {
  type FiscalReceiptRecord,
  fetchFiscalReceipts,
  fetchFiscalisationConfig,
} from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { cn } from "@corelithzw/ui/lib/utils";

type FiscalisationView = "fiscal-days" | "config" | "receipts";

type FiscalisationFormState = {
  providerKey: string;
  apiBaseUrl: string;
  authType: string;
  username: string;
  password: string;
  apiToken: string;
  deviceId: string;
  timeoutMs: string;
  retryPolicyJson: string;
  certificateRef: string;
  webhookSecretRef: string;
  metadataJson: string;
  legalName: string;
  tradingName: string;
  vatNumber: string;
  taxNumber: string;
  address: string;
  phone: string;
  email: string;
};

/** The three values FDMS accepts. A free-text box here is a support ticket:
 *  the request fails at the provider, hours later, with a 401. */
const AUTH_TYPES = ["BEARER", "BASIC", "TOKEN"] as const;

/**
 * ZIMRA's four statuses, in the words the receipt list uses.
 *
 * Mapped rather than printed raw for two reasons. `SUCCESS` is not what a
 * fiscal receipt gets — ZIMRA *accepts* it — and the four states carry three
 * different meanings for a supervisor: accepted is done, queued is the system
 * working, rejected needs a person. Collapsing the last two into one neutral
 * chip, which is what a two-variant badge did, hid the only row that needed
 * anybody's attention.
 */
const RECEIPT_STATUS: Record<FiscalReceiptRecord["status"], { label: string; tone: BadgeTone }> = {
  SUCCESS: { label: "Accepted", tone: "ok" },
  PENDING: { label: "Queued", tone: "warn" },
  FAILED: { label: "Rejected", tone: "bad" },
  VOIDED: { label: "Voided", tone: "mute" },
};

/**
 * One receipt, flattened for the list.
 *
 * The status is carried as `statusLabel`/`statusTone` rather than `status` on
 * purpose: `AccountingListView` groups by any field it recognises when no
 * `groupBy` is passed, and `status` is the first name it looks for. The design
 * draws this as one flat, newest-first list — the order the API returns — so
 * the model deliberately has no field for the list to group on.
 */
type FiscalReceiptRow = {
  id: string;
  receiptNo: string;
  fiscalNo: string;
  invoiceNo: string;
  issued: string;
  signed: string;
  statusLabel: string;
  statusTone: BadgeTone;
};

/** "15 Aug 14:22", or an em dash where there is no timestamp yet. A blank cell
 *  reads as a rendering fault; a zero date reads as a claim. */
function stamp(value?: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : format(parsed, "d MMM HH:mm");
}

/** A field and its label, as the artboards draw the accounting forms. */
function Field({
  label,
  required,
  hint,
  wide,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  /** Spans both columns — an address, a URL, a secret reference. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0", wide && "sm:col-span-2")}>
      <label className="mb-1.5 flex items-baseline gap-1 text-sm font-semibold text-[var(--text-muted)]">
        <span>{label}</span>
        {required ? (
          <span aria-hidden="true" style={{ color: "var(--tone-danger)" }}>
            *
          </span>
        ) : null}
      </label>
      {children}
      {hint ? <p className="acct-caption mt-1">{hint}</p> : null}
    </div>
  );
}

/**
 * A pointer to a secret, not the secret.
 *
 * Drawn dashed and read-only because that is what it is: the value in the
 * database is the *name* of an environment entry, and typing over it by
 * accident silently unhooks signing from its certificate. Changing it is a
 * deliberate act, so it takes a deliberate click.
 */
function SecretRefField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
}) {
  const [editing, setEditing] = useState(false);

  // An unset reference has nothing to protect and no value to show, so it
  // opens as a plain input rather than an empty dashed box with a Change link.
  if (editing || !value) {
    return <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />;
  }

  return (
    <div className="flex h-[30px] items-center justify-between gap-2 rounded-[6px] border border-dashed border-[var(--border-strong)] bg-[var(--canvas)] px-2.5">
      <span className="truncate font-mono text-sm text-[var(--text-muted)]">{value}</span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="shrink-0 text-sm font-semibold text-[var(--brand-strong)] hover:underline"
      >
        Change
      </button>
    </div>
  );
}

/** One line of the queue breakdown: a tone dot, what it counts, the figure. */
function QueueLine({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone: "ok" | "warn" | "bad" | "mute";
}) {
  const dot = {
    ok: "var(--tone-success)",
    warn: "var(--tone-warn)",
    bad: "var(--tone-danger)",
    mute: "var(--gray-400)",
  }[tone];
  const ink = {
    ok: "var(--badge-ok-fg)",
    warn: "var(--badge-warn-fg)",
    bad: "var(--badge-bad-fg)",
    mute: "var(--text-muted)",
  }[tone];

  return (
    <div className="flex min-h-[27px] items-center gap-2.5">
      <span aria-hidden="true" className="size-[7px] shrink-0 rounded-full" style={{ background: dot }} />
      <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-muted)]">{label}</span>
      <span className="shrink-0 font-mono text-sm font-bold tabular-nums" style={{ color: ink }}>
        {value}
      </span>
    </div>
  );
}

export default function FiscalisationPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // FD-7.1 — fiscal days lead. A supervisor opens this page during a shift to
  // answer "is every till trading, and will every day close?"; provider
  // credentials are a once-a-year task and no longer the landing view.
  const [activeView, setActiveView] = useState<FiscalisationView>("fiscal-days");
  const [invoiceId, setInvoiceId] = useState("");
  const [draft, setDraft] = useState<Partial<FiscalisationFormState>>({});

  const { data: configData, error: configError } = useQuery({
    queryKey: ["accounting", "fiscalisation", "config"],
    queryFn: fetchFiscalisationConfig,
  });

  const { data: receiptsData, isLoading, error: receiptsError } = useQuery({
    queryKey: ["accounting", "fiscalisation", "receipts"],
    queryFn: () => fetchFiscalReceipts({ limit: 200 }),
  });

  /*
    The same fleet the console reads, under the same key.

    The "Day" chip belongs in the band, which means it has to survive the
    console being unmounted — and the console is unmounted whenever the reader
    is on Configuration or Receipts, which is exactly when a day quietly going
    past 24 hours needs saying. Sharing the query key means this costs one
    fetch, not two: react-query hands both observers the same cache entry.
  */
  const { data: fleet } = useQuery({
    queryKey: FISCAL_DAY_FLEET_KEY,
    queryFn: fetchFiscalDayFleet,
  });

  const baseFormState = useMemo<FiscalisationFormState>(
    () => ({
      providerKey: configData?.provider?.providerKey ?? "ZIMRA_FDMS",
      apiBaseUrl: configData?.provider?.apiBaseUrl ?? "",
      authType: configData?.provider?.authType ?? "",
      username: configData?.provider?.username ?? "",
      password: configData?.provider?.password ?? "",
      apiToken: configData?.provider?.apiToken ?? "",
      deviceId: configData?.provider?.deviceId ?? "",
      timeoutMs: configData?.provider?.timeoutMs ? String(configData.provider.timeoutMs) : "",
      retryPolicyJson: configData?.provider?.retryPolicyJson ?? "",
      certificateRef: configData?.provider?.certificateRef ?? "",
      webhookSecretRef: configData?.provider?.webhookSecretRef ?? "",
      metadataJson: configData?.provider?.metadataJson ?? "",
      legalName: configData?.settings?.legalName ?? "",
      tradingName: configData?.settings?.tradingName ?? "",
      vatNumber: configData?.settings?.vatNumber ?? "",
      taxNumber: configData?.settings?.taxNumber ?? "",
      address: configData?.settings?.address ?? "",
      phone: configData?.settings?.phone ?? "",
      email: configData?.settings?.email ?? "",
    }),
    [configData],
  );

  const formState = useMemo(() => ({ ...baseFormState, ...draft }), [baseFormState, draft]);
  const isDirty = Object.keys(draft).length > 0;
  const setField = (field: keyof FiscalisationFormState, value: string) =>
    setDraft((prev) => ({ ...prev, [field]: value }));

  const receipts = useMemo(() => receiptsData?.data ?? [], [receiptsData]);

  /**
   * What is waiting on ZIMRA, for the band and the queue panel.
   *
   * Pending and failed are separated because they need different things from
   * a supervisor. A pending receipt is the system working — it wants patience.
   * A failed one is stuck and needs a replay, which is why it gets the danger
   * tone and only appears when there is at least one.
   */
  const receiptCounts = useMemo(() => {
    const today = new Date().toDateString();
    const blocking = receipts.filter(
      (receipt) => receipt.status === "PENDING" || receipt.status === "FAILED",
    );
    return {
      pending: receipts.filter((receipt) => receipt.status === "PENDING").length,
      failed: receipts.filter((receipt) => receipt.status === "FAILED").length,
      // Signed, not merely created: the date that matters is when ZIMRA put a
      // number on it, which is `issuedAt` where the provider returned one.
      signedToday: receipts.filter((receipt) => {
        if (receipt.status !== "SUCCESS") return false;
        const signedAt = receipt.issuedAt ?? receipt.lastSyncedAt;
        return Boolean(signedAt) && new Date(signedAt as string).toDateString() === today;
      }).length,
      oldestQueuedAt: blocking.reduce<string | null>(
        (oldest, receipt) =>
          !oldest || new Date(receipt.createdAt) < new Date(oldest) ? receipt.createdAt : oldest,
        null,
      ),
    };
  }, [receipts]);

  /**
   * How long the oldest open day has been open, for the band.
   *
   * The fleet has many devices and the band has room for one figure, so it
   * carries the worst one — the day closest to breaching ZIMRA's 24 hours is
   * the day somebody has to go and close. A tenant with devices but no open
   * day is its own kind of bad: no till on it can fiscalise a sale.
   */
  const dayChip = useMemo<{ value: string; tone: BandChipTone } | null>(() => {
    const devices = fleet?.devices ?? [];
    if (devices.length === 0) return null;

    const openedAt = devices
      .map((device) => device.activeDay?.openedAt)
      .filter((value): value is string => Boolean(value))
      .sort()[0];
    if (!openedAt) return { value: "none open", tone: "bad" };

    const hours = hoursOpen(openedAt);
    return { value: `${hours}h open`, tone: hours >= ZIMRA_MAX_OPEN_HOURS ? "bad" : "ok" };
  }, [fleet]);

  const hasActiveProvider = Boolean(configData?.provider?.isActive);

  const receiptRows = useMemo<FiscalReceiptRow[]>(
    () =>
      receipts.map((receipt) => {
        const status = RECEIPT_STATUS[receipt.status];
        return {
          id: receipt.id,
          receiptNo: receipt.receiptNumber ?? "—",
          fiscalNo: receipt.fiscalNumber ?? "—",
          invoiceNo: receipt.invoice?.invoiceNumber ?? "—",
          issued: stamp(receipt.createdAt),
          signed: stamp(receipt.lastSyncedAt),
          statusLabel: status?.label ?? receipt.status,
          statusTone: status?.tone ?? "mute",
        };
      }),
    [receipts],
  );

  const columns = useMemo<ColumnDef<FiscalReceiptRow>[]>(
    () => [
      {
        id: "receipt",
        header: "Receipt",
        cell: ({ row }) => <span className="font-mono">{row.original.receiptNo}</span>,
        size: 140,
        minSize: 120,
        maxSize: 180},
      {
        id: "fiscal",
        header: "Fiscal no.",
        cell: ({ row }) => (
          <span className="font-mono text-[var(--text-muted)]">{row.original.fiscalNo}</span>
        ),
        size: 112,
        minSize: 112,
        maxSize: 112},
      {
        id: "invoice",
        header: "Invoice",
        cell: ({ row }) => <span className="font-semibold">{row.original.invoiceNo}</span>,
        size: 220,
        minSize: 160,
        maxSize: 420},
      {
        id: "issued",
        header: "Issued",
        cell: ({ row }) => (
          <span className="font-mono text-[var(--text-muted)]">{row.original.issued}</span>
        ),
        size: 130,
        minSize: 130,
        maxSize: 130},
      {
        id: "signed",
        header: "Signed",
        cell: ({ row }) => (
          <div className="text-right font-mono text-[var(--text-muted)]">{row.original.signed}</div>
        ),
        size: 130,
        minSize: 130,
        maxSize: 130},
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <div className="flex justify-end">
            <span className="acct-badge" data-tone={row.original.statusTone}>
              {row.original.statusLabel}
            </span>
          </div>
        ),
        size: 120,
        minSize: 120,
        maxSize: 120},
    ],
    [],
  );

  const saveConfigMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      fetchJson("/api/accounting/fiscalisation/config", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: "Fiscalisation config saved",
        description: "Provider settings updated successfully.",
        variant: "success",
      });
      setDraft({});
      queryClient.invalidateQueries({ queryKey: ["accounting", "fiscalisation", "config"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to save config",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  const issueMutation = useMutation({
    mutationFn: async (payload: { invoiceId: string }) =>
      fetchJson("/api/accounting/fiscalisation/issue", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: "Fiscal receipt requested",
        description: "Receipt queued with the fiscalisation provider.",
        variant: "success",
      });
      setInvoiceId("");
      queryClient.invalidateQueries({ queryKey: ["accounting", "fiscalisation", "receipts"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to issue receipt",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });
  const replayMutation = useMutation({
    mutationFn: async () =>
      fetchJson("/api/accounting/fiscalisation/replay", {
        method: "POST",
      }),
    onSuccess: () => {
      toast({
        title: "Replay triggered",
        description: "Eligible pending/failed receipts are re-queued.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["accounting", "fiscalisation", "receipts"] });
    },
    onError: (err) => {
      toast({
        title: "Unable to replay receipts",
        description: getApiErrorMessage(err),
        variant: "destructive",
      });
    },
  });
  const handleSaveConfig = (event: React.FormEvent) => {
    event.preventDefault();

    if (!formState.providerKey.trim()) {
      toast({
        title: "Missing provider key",
        description: "Provider key is required.",
        variant: "destructive",
      });
      return;
    }

    saveConfigMutation.mutate({
      providerKey: formState.providerKey.trim(),
      apiBaseUrl: formState.apiBaseUrl.trim() || undefined,
      authType: formState.authType.trim() || undefined,
      username: formState.username.trim() || undefined,
      password: formState.password.trim() || undefined,
      apiToken: formState.apiToken.trim() || undefined,
      deviceId: formState.deviceId.trim() || undefined,
      timeoutMs: formState.timeoutMs.trim() ? Number(formState.timeoutMs) : undefined,
      retryPolicyJson: formState.retryPolicyJson.trim() || undefined,
      certificateRef: formState.certificateRef.trim() || undefined,
      webhookSecretRef: formState.webhookSecretRef.trim() || undefined,
      metadataJson: formState.metadataJson.trim() || undefined,
      supplier: {
        legalName: formState.legalName.trim() || undefined,
        tradingName: formState.tradingName.trim() || undefined,
        vatNumber: formState.vatNumber.trim() || undefined,
        taxNumber: formState.taxNumber.trim() || undefined,
        address: formState.address.trim() || undefined,
        phone: formState.phone.trim() || undefined,
        email: formState.email.trim() || undefined,
      },
    });
  };

  const handleIssueReceipt = (event: React.FormEvent) => {
    event.preventDefault();
    if (!invoiceId.trim()) {
      toast({
        title: "Missing invoice",
        description: "Provide a sales invoice ID to issue a fiscal receipt.",
        variant: "destructive",
      });
      return;
    }
    issueMutation.mutate({ invoiceId: invoiceId.trim() });
  };

  return (
    <AccountingShell
      activeTab="fiscalisation"
      title="Fiscalisation"
      description="ZIMRA FDMS — the device, its credentials, and the open fiscal day"
      bandSlot={
        <>
          <BandChip
            label="Queued"
            value={String(receiptCounts.pending)}
            tone={receiptCounts.pending > 0 ? "warn" : "ok"}
          />
          {receiptCounts.failed > 0 ? (
            <BandChip label="Failed" value={String(receiptCounts.failed)} tone="bad" />
          ) : null}
          {dayChip ? <BandChip label="Day" value={dayChip.value} tone={dayChip.tone} /> : null}
        </>
      }
    >
      {(configError || receiptsError) ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load fiscalisation data</AlertTitle>
          <AlertDescription>{getApiErrorMessage(configError || receiptsError)}</AlertDescription>
        </Alert>
      ) : null}

      <VerticalDataViews
        items={[
          { id: "fiscal-days", label: "Fiscal Days" },
          { id: "config", label: "Configuration" },
          { id: "receipts", label: "Receipts", count: receipts.length },
        ]}
        value={activeView}
        onValueChange={(value) => setActiveView(value as FiscalisationView)}
        railLabel="Fiscalisation Views"
      >
        {/* Mounted only while selected, unlike the two views below: this one
            polls every 30s, and a hidden panel quietly refetching the whole
            fleet is load nobody asked for. */}
        {activeView === "fiscal-days" ? <FiscalDayConsole /> : null}

        <div className={activeView === "config" ? undefined : "hidden"}>
          {/*
            Four panels, not one column of thirteen fields.

            The questions are answered by different people out of different
            documents: the URL and timeout come from an integrator, the
            credentials from ZIMRA's onboarding pack, the device and supplier
            details off the registration certificate. Separately bordered, each
            one can be filled in and checked on its own.
          */}
          <form onSubmit={handleSaveConfig}>
            <div className="grid grid-cols-1 items-start gap-2.5 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Connection</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Provider key" required wide>
                    <Input
                      value={formState.providerKey}
                      onChange={(event) => setField("providerKey", event.target.value)}
                      placeholder="ZIMRA_FDMS"
                      className="font-mono"
                      required
                    />
                  </Field>
                  <Field label="API base URL" wide>
                    <Input
                      value={formState.apiBaseUrl}
                      onChange={(event) => setField("apiBaseUrl", event.target.value)}
                      placeholder="https://fdms-api.zimra.co.zw"
                      className="font-mono"
                    />
                  </Field>
                  <Field label="Auth type">
                    <Select
                      value={formState.authType || undefined}
                      onValueChange={(value) => setField("authType", value)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select auth type" />
                      </SelectTrigger>
                      <SelectContent>
                        {AUTH_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Timeout" hint="milliseconds, per request">
                    <Input
                      type="number"
                      min="1000"
                      value={formState.timeoutMs}
                      onChange={(event) => setField("timeoutMs", event.target.value)}
                      placeholder="20000"
                    />
                  </Field>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Credentials</CardTitle>
                  <span className="acct-caption ml-auto">never shown in full</span>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Username">
                    <Input
                      value={formState.username}
                      onChange={(event) => setField("username", event.target.value)}
                      className="font-mono"
                    />
                  </Field>
                  <Field label="Password">
                    <Input
                      type="password"
                      value={formState.password}
                      onChange={(event) => setField("password", event.target.value)}
                    />
                  </Field>
                  <Field label="API token" wide hint="used when auth type is TOKEN">
                    <Input
                      type="password"
                      value={formState.apiToken}
                      onChange={(event) => setField("apiToken", event.target.value)}
                    />
                  </Field>
                  <Field
                    label="Certificate ref"
                    wide
                    hint="a pointer to the secret store — the bundle itself is never held in the database"
                  >
                    <SecretRefField
                      value={formState.certificateRef}
                      onChange={(value) => setField("certificateRef", value)}
                      placeholder="env:FDMS_CERT_BUNDLE_JSON"
                    />
                  </Field>
                  <Field label="Webhook secret ref" wide hint="verifies callbacks from ZIMRA">
                    <SecretRefField
                      value={formState.webhookSecretRef}
                      onChange={(value) => setField("webhookSecretRef", value)}
                      placeholder="env:FDMS_WEBHOOK_SECRET"
                    />
                  </Field>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Device and supplier</CardTitle>
                  <span className="acct-caption ml-auto">as registered with ZIMRA</span>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Device ID" hint="one configuration is one ZIMRA device">
                    <Input
                      value={formState.deviceId}
                      onChange={(event) => setField("deviceId", event.target.value)}
                      className="font-mono"
                      placeholder="FDMS-04412"
                    />
                  </Field>
                  <Field label="Trading name">
                    <Input
                      value={formState.tradingName}
                      onChange={(event) => setField("tradingName", event.target.value)}
                    />
                  </Field>
                  <Field label="Supplier legal name" wide>
                    <Input
                      value={formState.legalName}
                      onChange={(event) => setField("legalName", event.target.value)}
                    />
                  </Field>
                  <Field label="VAT number">
                    <Input
                      value={formState.vatNumber}
                      onChange={(event) => setField("vatNumber", event.target.value)}
                      className="font-mono"
                    />
                  </Field>
                  <Field label="Tax number">
                    <Input
                      value={formState.taxNumber}
                      onChange={(event) => setField("taxNumber", event.target.value)}
                      className="font-mono"
                    />
                  </Field>
                  <Field label="Address" wide>
                    <Input
                      value={formState.address}
                      onChange={(event) => setField("address", event.target.value)}
                    />
                  </Field>
                  <Field label="Phone">
                    <Input
                      value={formState.phone}
                      onChange={(event) => setField("phone", event.target.value)}
                    />
                  </Field>
                  <Field label="Email">
                    <Input
                      value={formState.email}
                      onChange={(event) => setField("email", event.target.value)}
                    />
                  </Field>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Advanced</CardTitle>
                  <span className="acct-caption ml-auto">JSON, validated on save</span>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-3">
                  <Field
                    label="Retry policy JSON"
                    hint="how long to wait between retries when FDMS is unreachable"
                  >
                    <Input
                      value={formState.retryPolicyJson}
                      onChange={(event) => setField("retryPolicyJson", event.target.value)}
                      placeholder='{"baseDelayMs":300000,"maxDelayMs":86400000}'
                      className="font-mono"
                    />
                  </Field>
                  <Field
                    label="Metadata JSON"
                    hint="sent with every receipt; use it to tag the branch or till"
                  >
                    <Input
                      value={formState.metadataJson}
                      onChange={(event) => setField("metadataJson", event.target.value)}
                      placeholder='{"branch":"Harare"}'
                      className="font-mono"
                    />
                  </Field>
                </CardContent>
              </Card>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-[10px] border border-[var(--border)] bg-[var(--surface-base)] px-[13px] py-2.5">
              <Button type="submit" disabled={saveConfigMutation.isPending}>
                Save configuration
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDraft({})}
                disabled={!isDirty || saveConfigMutation.isPending}
              >
                Revert
              </Button>
            </div>
          </form>
        </div>

        {/*
          The list, and what you do to it.

          Issuing a receipt and clearing the queue are both actions on this
          list, so they sit beside it rather than behind another tab — and
          pinned, because the reason to issue or retry is usually a row you can
          still see.
        */}
        <div
          className={
            activeView === "receipts"
              ? "grid min-w-0 items-start gap-2.5 xl:grid-cols-[minmax(0,1fr)_360px]"
              : "hidden"
          }
        >
          <DataTable
            data={receiptRows}
            columns={columns}
            rowKey="id"
            searchPlaceholder="Receipt or invoice"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={isLoading ? "Loading receipts..." : "No fiscal receipts found."}
          />

          <div className="flex flex-col gap-2.5 xl:sticky xl:top-[calc(var(--stack-top,0px)+0.75rem)]">
            <Card>
              <CardHeader>
                <CardTitle>Issue a fiscal receipt</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleIssueReceipt} className="space-y-3">
                  <Field label="Sales invoice" required hint="the invoice's UUID, not its number">
                    <Input
                      value={invoiceId}
                      onChange={(event) => setInvoiceId(event.target.value)}
                      placeholder="Invoice UUID"
                      className="font-mono"
                    />
                  </Field>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={issueMutation.isPending || !hasActiveProvider}
                  >
                    Issue receipt
                  </Button>
                  {!hasActiveProvider ? (
                    <p className="acct-caption">
                      No provider is active — nothing can be signed until one is saved and enabled
                      under Configuration.
                    </p>
                  ) : null}
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Queue</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <QueueLine label="Waiting to sign" value={receiptCounts.pending} tone="warn" />
                <QueueLine label="Rejected, needs a fix" value={receiptCounts.failed} tone="bad" />
                <QueueLine label="Signed today" value={receiptCounts.signedToday} tone="ok" />
                <QueueLine
                  label="Oldest in queue"
                  value={
                    receiptCounts.oldestQueuedAt ? (
                      <TimeAgo value={receiptCounts.oldestQueuedAt} />
                    ) : (
                      "—"
                    )
                  }
                  tone={receiptCounts.oldestQueuedAt ? "bad" : "mute"}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2.5 w-full"
                  onClick={() => replayMutation.mutate()}
                  disabled={
                    replayMutation.isPending ||
                    receiptCounts.pending + receiptCounts.failed === 0
                  }
                >
                  Retry queued and rejected
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </VerticalDataViews>
    </AccountingShell>
  );
}
