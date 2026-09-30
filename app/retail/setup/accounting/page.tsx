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
  StatusBadge,
} from "@/components/management/ui";
import { FactRowsSkeleton, LoadFailure } from "@/components/preferences/organization/form-parts";
import { SHOP_SETUP_KEY, ShopSettingsShell } from "@/components/retail/shop-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import {
  fetchAccountingReadiness,
  fetchTenderMappings,
  runSeedPack,
  type AccountingSeedPackResult,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { Scale } from "@/lib/icons";
import { tenderLabel } from "@/lib/retail/words";

const TENDERS = ["CASH", "CARD", "MOBILE_MONEY", "TRANSFER", "VOUCHER"] as const;

/** Where each failing check is fixed. */
const FIX: Record<string, { label: string; href: string }> = {
  accounts: { label: "Open the chart of accounts", href: "/accounting/chart-of-accounts" },
  periods: { label: "Open a period", href: "/accounting/periods" },
  "retained-earnings": { label: "Set it in posting rules", href: "/accounting/posting-rules?view=seed" },
  "default-tax": { label: "Choose a tax code", href: "/accounting/tax" },
  "default-bank": { label: "Add a bank account", href: "/accounting/banking" },
  rules: { label: "Open posting rules", href: "/accounting/posting-rules" },
  "fx-rates": { label: "Add exchange rates", href: "/accounting/currency" },
};

/**
 * Posting — whether a sale can reach the ledger without somebody posting it
 * by hand, and the one verb that makes it so.
 *
 * Settings → Shop. It was "Accounting setup": three tiles, a list of checks
 * with a subtitle explaining that each had to pass, a table of tenders with a
 * subtitle explaining why, the seed pack as a card with a paragraph of what it
 * provisions, and a card of links onward. The checks and the tenders are two
 * lists of facts now; the seed pack is "Set up the accounts", in a dialog.
 */
export default function RetailPostingPage() {
  const queryClient = useQueryClient();
  const [settingUp, setSettingUp] = useState(false);

  const readiness = useQuery({
    queryKey: ["accounting", "setup-readiness"],
    queryFn: fetchAccountingReadiness,
  });
  const mappings = useQuery({
    queryKey: ["accounting", "tender-mappings"],
    queryFn: fetchTenderMappings,
  });

  const checks = readiness.data?.checks ?? [];
  const failing = checks.filter((check) => !check.ready).length;

  return (
    <ShopSettingsShell>
      <FormPage
        title="Posting"
        icon={Scale}
        badge={failing > 0 ? <StatusBadge tone="warn">{`${failing} to fix`}</StatusBadge> : null}
        action={
          <HeaderAction icon={Scale} onClick={() => setSettingUp(true)}>
            Set up the accounts
          </HeaderAction>
        }
      >
        <SectionHeading variant="form" count={checks.length}>
          Checks
        </SectionHeading>
        {readiness.isLoading ? (
          <FactRowsSkeleton rows={6} />
        ) : readiness.isError ? (
          <LoadFailure
            message={`The checks would not load. ${getApiErrorMessage(readiness.error)}`}
            onRetry={() => void readiness.refetch()}
          />
        ) : (
          <FactList
            maxWidth={null}
            labelWidth={220}
            items={checks.map((check) => {
              const fix = FIX[check.id];
              return {
                id: check.id,
                label: check.label,
                value: check.ready ? "Ready" : (fix?.label ?? "Set up the accounts"),
                tone: check.ready ? ("muted" as const) : ("warn" as const),
                href: check.ready ? undefined : fix?.href,
              };
            })}
          />
        )}

        <SectionHeading variant="form">Tenders</SectionHeading>
        {mappings.isLoading ? (
          <FactRowsSkeleton rows={5} />
        ) : (
          <FactList
            maxWidth={null}
            labelWidth={220}
            items={TENDERS.map((tender) => {
              const mapping = (mappings.data ?? []).find(
                (entry) => entry.tenderType === tender && entry.isActive,
              );
              return {
                id: tender,
                label: tenderLabel(tender),
                value: mapping?.clearingAccount
                  ? `${mapping.clearingAccount.code} ${mapping.clearingAccount.name}`
                  : "No account",
                tone: mapping ? ("default" as const) : ("warn" as const),
              };
            })}
          />
        )}
      </FormPage>

      <SetUpAccountsDialog
        open={settingUp}
        onOpenChange={setSettingUp}
        onApplied={() => {
          void queryClient.invalidateQueries({ queryKey: ["accounting"] });
          void queryClient.invalidateQueries({ queryKey: SHOP_SETUP_KEY });
        }}
      />
    </ShopSettingsShell>
  );
}

/**
 * The Zimbabwe retail seed pack: the chart of accounts, tax codes, currencies,
 * posting rules and tender accounts a till's sales post against. Safe to run
 * again — it only adds what is missing — so Preview is there to see what that
 * is, not to protect anything.
 */
function SetUpAccountsDialog({
  open,
  onOpenChange,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied: () => void;
}) {
  const { toast } = useToast();
  const [zwg, setZwg] = useState("");
  const [zar, setZar] = useState("");
  const [result, setResult] = useState<AccountingSeedPackResult | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const run = useMutation({
    mutationFn: (mode: "DRY_RUN" | "APPLY") => {
      const rates: Record<string, number> = {};
      if (zwg.trim()) rates.ZWG = Number(zwg);
      if (zar.trim()) rates.ZAR = Number(zar);
      return runSeedPack({ mode, fxRates: Object.keys(rates).length > 0 ? rates : undefined });
    },
    onSuccess: (data, mode) => {
      setResult(data);
      setErrors([]);
      if (mode === "APPLY") {
        toast({ title: "Accounts set up", variant: "success" });
        onApplied();
      }
    },
    onError: (error) => setErrors([`The accounts were not set up: ${getApiErrorMessage(error)}`]),
  });

  return (
    <RecordDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setResult(null);
      }}
      title="Set up the accounts"
      size="md"
      errors={errors}
      onSubmit={(event) => {
        event.preventDefault();
        run.mutate("APPLY");
      }}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={run.isPending}
            onClick={() => run.mutate("DRY_RUN")}
          >
            Preview
          </Button>
          <Button type="submit" disabled={run.isPending}>
            Set up the accounts
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="ZWG to the US dollar">
          {(id) => (
            <Input id={id} inputMode="decimal" className="font-mono" value={zwg} onChange={(event) => setZwg(event.target.value)} placeholder="27.50" />
          )}
        </FormField>
        <FormField label="Rand to the US dollar">
          {(id) => (
            <Input id={id} inputMode="decimal" className="font-mono" value={zar} onChange={(event) => setZar(event.target.value)} placeholder="18.50" />
          )}
        </FormField>
      </div>

      {result ? (
        <>
          <SectionHeading variant="form" maxWidth={9999}>
            {result.mode === "DRY_RUN" ? "Would add" : "Added"}
          </SectionHeading>
          <FactList
            maxWidth={null}
            align="end"
            items={[
              { label: "Accounts", value: String(result.createdAccounts), mono: true },
              { label: "Tax codes", value: String(result.createdTaxCodes), mono: true },
              { label: "Currencies", value: String(result.createdCurrencyDefinitions), mono: true },
              { label: "Tender accounts", value: String(result.createdTenderMappings), mono: true },
              { label: "Posting rules", value: String(result.createdPostingRules), mono: true },
              { label: "Periods", value: String(result.createdPeriods), mono: true },
              ...(result.preview.missingFxQuotes.length > 0
                ? [
                    {
                      label: "No rate for",
                      value: result.preview.missingFxQuotes.join(", "),
                      tone: "warn" as const,
                    },
                  ]
                : []),
            ]}
          />
        </>
      ) : null}
    </RecordDialog>
  );
}
