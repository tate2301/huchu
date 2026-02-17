"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AccountingShell } from "@/components/accounting/accounting-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { NumericCell } from "@/components/ui/numeric-cell";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { useToast } from "@/components/ui/use-toast";
import {
  type FiscalReceiptRecord,
  fetchFiscalReceipts,
  fetchFiscalisationConfig,
} from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

type FiscalisationFormState = {
  providerKey: string;
  apiBaseUrl: string;
  username: string;
  password: string;
  apiToken: string;
  deviceId: string;
  metadataJson: string;
  legalName: string;
  tradingName: string;
  vatNumber: string;
  taxNumber: string;
  address: string;
  phone: string;
  email: string;
};

export default function FiscalisationPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeView, setActiveView] = useState<"config" | "receipts">("config");
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

  const baseFormState = useMemo<FiscalisationFormState>(
    () => ({
      providerKey: configData?.provider?.providerKey ?? "ZIMRA_FDMS",
      apiBaseUrl: configData?.provider?.apiBaseUrl ?? "",
      username: configData?.provider?.username ?? "",
      password: configData?.provider?.password ?? "",
      apiToken: configData?.provider?.apiToken ?? "",
      deviceId: configData?.provider?.deviceId ?? "",
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

  const receipts = useMemo(() => receiptsData?.data ?? [], [receiptsData]);
  const hasActiveProvider = Boolean(configData?.provider?.isActive);

  const columns = useMemo<ColumnDef<FiscalReceiptRecord>[]>(
    () => [
      {
        id: "invoice",
        header: "Invoice",
        cell: ({ row }) => (
          <div>
            <div className="font-mono">{row.original.invoice?.invoiceNumber ?? "-"}</div>
            <div className="text-xs text-muted-foreground">{row.original.providerKey ?? ""}</div>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.original.status === "SUCCESS" ? "secondary" : "outline"}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        id: "fiscal",
        header: "Fiscal Number",
        cell: ({ row }) => <span className="font-mono">{row.original.fiscalNumber ?? "-"}</span>,
      },
      {
        id: "created",
        header: "Created",
        cell: ({ row }) => (
          <NumericCell align="left">
            {format(new Date(row.original.createdAt), "yyyy-MM-dd")}
          </NumericCell>
        ),
      },
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
      username: formState.username.trim() || undefined,
      password: formState.password.trim() || undefined,
      apiToken: formState.apiToken.trim() || undefined,
      deviceId: formState.deviceId.trim() || undefined,
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
      title="ZIMRA Fiscalisation"
      description="Configure FDMS provider settings and track fiscal receipts."
    >
      {(configError || receiptsError) ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load fiscalisation data</AlertTitle>
          <AlertDescription>{getApiErrorMessage(configError || receiptsError)}</AlertDescription>
        </Alert>
      ) : null}

      <VerticalDataViews
        items={[
          { id: "config", label: "Configuration" },
          { id: "receipts", label: "Receipts", count: receipts.length },
        ]}
        value={activeView}
        onValueChange={(value) => setActiveView(value as "config" | "receipts")}
        railLabel="Fiscalisation Views"
      >
        <div className={activeView === "config" ? "space-y-4" : "hidden"}>
          <Card>
            <CardHeader>
              <CardTitle>Provider Configuration</CardTitle>
              <CardDescription>
                Store FDMS credentials, device identifiers, and supplier registration details.
              </CardDescription>
            </CardHeader>
            <div className="px-6 pb-6">
              <form onSubmit={handleSaveConfig} className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-semibold mb-2">Provider Key *</label>
                    <Input
                      value={formState.providerKey}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, providerKey: event.target.value }))
                      }
                      placeholder="ZIMRA_FDMS"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2">API Base URL</label>
                    <Input
                      value={formState.apiBaseUrl}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, apiBaseUrl: event.target.value }))
                      }
                      placeholder="https://fdms-api"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-semibold mb-2">Username</label>
                    <Input
                      value={formState.username}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, username: event.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2">Password</label>
                    <Input
                      type="password"
                      value={formState.password}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, password: event.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-semibold mb-2">API Token</label>
                    <Input
                      value={formState.apiToken}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, apiToken: event.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2">Device ID</label>
                    <Input
                      value={formState.deviceId}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, deviceId: event.target.value }))
                      }
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Metadata JSON</label>
                  <Input
                    value={formState.metadataJson}
                    onChange={(event) =>
                      setDraft((prev) => ({ ...prev, metadataJson: event.target.value }))
                    }
                    placeholder='{"branch":"Harare"}'
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-semibold mb-2">Supplier Legal Name</label>
                    <Input
                      value={formState.legalName}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, legalName: event.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2">Trading Name</label>
                    <Input
                      value={formState.tradingName}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, tradingName: event.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-semibold mb-2">VAT Number</label>
                    <Input
                      value={formState.vatNumber}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, vatNumber: event.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2">Tax Number</label>
                    <Input
                      value={formState.taxNumber}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, taxNumber: event.target.value }))
                      }
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Address</label>
                  <Input
                    value={formState.address}
                    onChange={(event) =>
                      setDraft((prev) => ({ ...prev, address: event.target.value }))
                    }
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-semibold mb-2">Phone</label>
                    <Input
                      value={formState.phone}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, phone: event.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2">Email</label>
                    <Input
                      value={formState.email}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, email: event.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button type="submit" className="flex-1" disabled={saveConfigMutation.isPending}>
                    Save Configuration
                  </Button>
                </div>
              </form>
            </div>
          </Card>

          {hasActiveProvider ? (
            <Card>
              <CardHeader>
                <CardTitle>Issue Fiscal Receipt</CardTitle>
                <CardDescription>
                  Submit an invoice ID to trigger fiscal receipt issuance.
                </CardDescription>
              </CardHeader>
              <div className="px-6 pb-6">
                <form onSubmit={handleIssueReceipt} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold mb-2">Invoice ID</label>
                    <Input
                      value={invoiceId}
                      onChange={(event) => setInvoiceId(event.target.value)}
                      placeholder="Invoice UUID"
                    />
                  </div>
                  <Button type="submit" disabled={issueMutation.isPending}>
                    Issue Receipt
                  </Button>
                </form>
              </div>
            </Card>
          ) : null}
        </div>

        <div className={activeView === "receipts" ? "space-y-3" : "hidden"}>
          <DataTable
            data={receipts}
            columns={columns}
            searchPlaceholder="Search fiscal receipts"
            searchSubmitLabel="Search"
            pagination={{ enabled: true }}
            emptyState={isLoading ? "Loading receipts..." : "No fiscal receipts found."}
          />
        </div>
      </VerticalDataViews>
    </AccountingShell>
  );
}
