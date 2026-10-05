"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import {
  FactList,
  FormField,
  FormPage,
  HeaderAction,
  SectionHeading,
  SectionAction,
  StatusBadge,
} from "@/components/management/ui";
import { FactRowsSkeleton, LoadFailure } from "@/components/preferences/organization/form-parts";
import {
  FISCAL_DAY_FLEET_KEY,
  fetchFiscalDayFleet,
} from "@/components/accounting/fiscalisation/fiscal-day-console";
import { ShopSettingsShell } from "@/components/retail/shop-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { ReceiptLong, ShieldCheck } from "@/lib/icons";
import { formatRetailDateTime } from "@/lib/retail/words";

/** The key a shop's one device is saved under when it has none yet. */
const DEVICE_KEY = "ZIMRA_FDMS";
const CONFIG_KEY = ["accounting", "fiscalisation", "config"] as const;

type Provider = {
  id: string;
  providerKey: string;
  apiBaseUrl: string | null;
  deviceId: string | null;
  certificateRef: string | null;
};

type Settings = {
  legalName: string | null;
  tradingName: string | null;
  vatNumber: string | null;
  taxNumber: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
};

type ConfigResponse = { provider: Provider | null; settings: Settings | null };

type Form = {
  apiBaseUrl: string;
  deviceId: string;
  legalName: string;
  tradingName: string;
  vatNumber: string;
  taxNumber: string;
  address: string;
  phone: string;
  email: string;
};

function formFrom(config: ConfigResponse | undefined): Form {
  const provider = config?.provider;
  const settings = config?.settings;
  return {
    apiBaseUrl: provider?.apiBaseUrl ?? "",
    deviceId: provider?.deviceId ?? "",
    legalName: settings?.legalName ?? "",
    tradingName: settings?.tradingName ?? "",
    vatNumber: settings?.vatNumber ?? "",
    taxNumber: settings?.taxNumber ?? "",
    address: settings?.address ?? "",
    phone: settings?.phone ?? "",
    email: settings?.email ?? "",
  };
}

const FIELDS: Array<{ key: keyof Form; label: string; mono?: boolean }> = [
  { key: "legalName", label: "Legal name" },
  { key: "tradingName", label: "Trading name" },
  { key: "vatNumber", label: "VAT number", mono: true },
  { key: "taxNumber", label: "TIN", mono: true },
  { key: "address", label: "Address" },
  { key: "phone", label: "Phone", mono: true },
  { key: "email", label: "Email" },
];

/**
 * Fiscal device — the ZIMRA device the till's receipts are signed on.
 *
 * Settings → Shop. A shop set this up on the accounting module's
 * Fiscalisation page: twenty fields in four cards ("Provider key", "Auth
 * type", "Retry policy JSON", "Webhook secret ref"), with the fiscal day on a
 * second tab and no way to register the device at all. What a shop actually
 * does is here, in the order it does it: say where FDMS is and which device
 * this is, say who is selling, register the device with its activation key,
 * and open the day. The accounting page keeps the full configuration for
 * anyone who needs the rest.
 */
export default function RetailFiscalDevicePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Form | null>(null);
  const [registering, setRegistering] = useState(false);

  const config = useQuery({
    queryKey: CONFIG_KEY,
    queryFn: () => fetchJson<ConfigResponse>("/api/accounting/fiscalisation/config"),
  });
  const fleet = useQuery({ queryKey: FISCAL_DAY_FLEET_KEY, queryFn: fetchFiscalDayFleet });

  const provider = config.data?.provider ?? null;
  const form = draft ?? formFrom(config.data);
  const registered = Boolean(provider?.certificateRef);
  const device = fleet.data?.devices.find((entry) => entry.providerConfigId === provider?.id) ?? null;
  const day = device?.activeDay ?? null;

  const set = (key: keyof Form, value: string) => setDraft({ ...form, [key]: value });

  const save = useMutation({
    mutationFn: () =>
      fetchJson("/api/accounting/fiscalisation/config", {
        method: "POST",
        body: JSON.stringify({
          providerKey: provider?.providerKey ?? DEVICE_KEY,
          apiBaseUrl: form.apiBaseUrl.trim() || undefined,
          deviceId: form.deviceId.trim() || undefined,
          supplier: {
            legalName: form.legalName.trim() || undefined,
            tradingName: form.tradingName.trim() || undefined,
            vatNumber: form.vatNumber.trim() || undefined,
            taxNumber: form.taxNumber.trim() || undefined,
            address: form.address.trim() || undefined,
            phone: form.phone.trim() || undefined,
            email: form.email.trim() || undefined,
          },
        }),
      }),
    onSuccess: async () => {
      toast({ title: "Fiscal device saved", variant: "success" });
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: CONFIG_KEY });
      await queryClient.invalidateQueries({ queryKey: FISCAL_DAY_FLEET_KEY });
    },
    onError: (error) =>
      toast({
        title: "The fiscal device was not saved",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const openDay = useMutation({
    mutationFn: () =>
      fetchJson("/api/accounting/fiscalisation/fiscal-days", {
        method: "POST",
        body: JSON.stringify({ providerConfigId: provider?.id }),
      }),
    onSuccess: async () => {
      toast({ title: "Fiscal day opened", variant: "success" });
      await queryClient.invalidateQueries({ queryKey: FISCAL_DAY_FLEET_KEY });
    },
    onError: (error) =>
      toast({
        title: "The fiscal day was not opened",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const closeDay = useMutation({
    mutationFn: () =>
      fetchJson(`/api/accounting/fiscalisation/fiscal-days/${day?.id}`, {
        method: "POST",
        body: JSON.stringify({ action: "close" }),
      }),
    onSuccess: async () => {
      toast({ title: "Fiscal day closed", variant: "success" });
      await queryClient.invalidateQueries({ queryKey: FISCAL_DAY_FLEET_KEY });
    },
    onError: (error) =>
      toast({
        title: "The fiscal day was not closed",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  return (
    <ShopSettingsShell>
      <FormPage
        title="Fiscal device"
        icon={ReceiptLong}
        badge={
          provider && !registered ? <StatusBadge tone="warn">Not registered</StatusBadge> : null
        }
        action={
          provider?.deviceId && !registered ? (
            <HeaderAction icon={ShieldCheck} onClick={() => setRegistering(true)}>
              Register with ZIMRA
            </HeaderAction>
          ) : null
        }
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
        submitLabel="Save fiscal device"
        busy={save.isPending}
        onCancel={draft ? () => setDraft(null) : undefined}
        cancelLabel="Undo changes"
      >
        {config.isLoading ? (
          <FactRowsSkeleton rows={4} />
        ) : config.isError ? (
          <LoadFailure
            message={`The fiscal device would not load. ${getApiErrorMessage(config.error)}`}
            onRetry={() => void config.refetch()}
          />
        ) : (
          <>
            <SectionHeading variant="form">Device</SectionHeading>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Device ID">
                {(id) => (
                  <Input id={id} className="font-mono" value={form.deviceId} onChange={(event) => set("deviceId", event.target.value)} />
                )}
              </FormField>
              <FormField label="FDMS address">
                {(id) => (
                  <Input
                    id={id}
                    className="font-mono"
                    value={form.apiBaseUrl}
                    onChange={(event) => set("apiBaseUrl", event.target.value)}
                    placeholder="https://fdmsapi.zimra.co.zw"
                  />
                )}
              </FormField>
            </div>

            <SectionHeading variant="form">Seller</SectionHeading>
            <div className="grid gap-4 sm:grid-cols-2">
              {FIELDS.map((field) => (
                <FormField key={field.key} label={field.label}>
                  {(id) => (
                    <Input
                      id={id}
                      className={field.mono ? "font-mono" : undefined}
                      value={form[field.key]}
                      onChange={(event) => set(field.key, event.target.value)}
                    />
                  )}
                </FormField>
              ))}
            </div>

            {provider ? (
              <>
                <SectionHeading
                  variant="form"
                  maxWidth={9999}
                  action={
                    day ? (
                      <SectionAction disabled={closeDay.isPending} onClick={() => closeDay.mutate()}>
                        Close the fiscal day
                      </SectionAction>
                    ) : registered ? (
                      <SectionAction disabled={openDay.isPending} onClick={() => openDay.mutate()}>
                        Open the fiscal day
                      </SectionAction>
                    ) : null
                  }
                >
                  Fiscal day
                </SectionHeading>
                {fleet.isLoading ? (
                  <FactRowsSkeleton rows={2} />
                ) : (
                  <FactList
                    maxWidth={null}
                    items={
                      day
                        ? [
                            { label: "Day", value: String(day.fiscalDayNo), mono: true },
                            { label: "Opened", value: formatRetailDateTime(day.openedAt), mono: true },
                            {
                              label: "Receipts",
                              value: `${device?.receiptCounts.accepted ?? 0} fiscalised${
                                device?.receiptCounts.blocking
                                  ? `, ${device.receiptCounts.blocking} waiting`
                                  : ""
                              }`,
                              tone: device?.receiptCounts.blocking ? "warn" : "default",
                            },
                          ]
                        : [
                            {
                              label: "Day",
                              value: registered
                                ? "No fiscal day open — the till cannot fiscalise"
                                : "Register the device first",
                              tone: "warn",
                            },
                            ...(device?.lastClosedDay
                              ? [
                                  {
                                    label: "Last closed",
                                    value: `Day ${device.lastClosedDay.fiscalDayNo}, ${formatRetailDateTime(device.lastClosedDay.closedAt)}`,
                                  },
                                ]
                              : []),
                          ]
                    }
                  />
                )}
              </>
            ) : null}
          </>
        )}
      </FormPage>

      <RegisterDeviceDialog
        open={registering}
        onOpenChange={setRegistering}
        onRegistered={() => {
          void queryClient.invalidateQueries({ queryKey: CONFIG_KEY });
          void queryClient.invalidateQueries({ queryKey: FISCAL_DAY_FLEET_KEY });
        }}
      />
    </ShopSettingsShell>
  );
}

function RegisterDeviceDialog({
  open,
  onOpenChange,
  onRegistered,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRegistered: () => void;
}) {
  const { toast } = useToast();
  const [serialNumber, setSerialNumber] = useState("");
  const [activationKey, setActivationKey] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  const register = useMutation({
    mutationFn: () =>
      fetchJson<{ taxCodesMapped: string[]; taxCodesNotMapped: string[] }>("/api/accounting/fiscalisation/device/register", {
        method: "POST",
        body: JSON.stringify({ serialNumber: serialNumber.trim(), activationKey: activationKey.trim() }),
      }),
    onSuccess: (result) => {
      toast({
        title: "Device registered",
        description: [
          result.taxCodesMapped.length ? `Tax codes matched to ZIMRA: ${result.taxCodesMapped.join(", ")}.` : "",
          result.taxCodesNotMapped.length ? `Not matched: ${result.taxCodesNotMapped.join(", ")}.` : "",
        ]
          .filter(Boolean)
          .join(" "),
        variant: "success",
      });
      setActivationKey("");
      onRegistered();
      onOpenChange(false);
    },
    onError: (error) => setErrors([`The device was not registered: ${getApiErrorMessage(error)}`]),
  });

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Register with ZIMRA"
      size="sm"
      errors={errors}
      onSubmit={(event) => {
        event.preventDefault();
        const problems = [
          ...(serialNumber.trim() ? [] : ["Give the serial number ZIMRA issued the device under."]),
          ...(activationKey.trim() ? [] : ["Give the activation key ZIMRA sent with the device ID."]),
        ];
        setErrors(problems);
        if (problems.length === 0) register.mutate();
      }}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={register.isPending}>
            Register the device
          </Button>
        </>
      }
    >
      <FormField label="Serial number">
        {(id) => (
          <Input id={id} className="font-mono" value={serialNumber} onChange={(event) => setSerialNumber(event.target.value)} autoFocus />
        )}
      </FormField>
      <FormField label="Activation key">
        {(id) => (
          <Input id={id} className="font-mono" value={activationKey} onChange={(event) => setActivationKey(event.target.value)} />
        )}
      </FormField>
    </RecordDialog>
  );
}
