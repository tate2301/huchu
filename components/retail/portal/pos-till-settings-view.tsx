"use client";

/**
 * What this till is set to, and what the person standing at it may do.
 *
 * S-7.6, contract surface 15 in `docs/retail/pos-production-readiness-2026-08-17.md`.
 * The endpoint at `pos/till-settings` shipped without this screen; the stock-take
 * called that out as the one place where "reuse the back office" produced
 * nothing usable, because a cashier on a tablet cannot open `/retail/manage/**`
 * and should not be able to.
 *
 * ── It reads. It does not write. ───────────────────────────────────────────
 *
 * Every group here is a rule the cashier is already operating under, so
 * withholding it is theatre — but `retail.setup` is not a cashier grant and
 * there is no PUT handler on this endpoint at all. So the screen shows where
 * each setting lives rather than pretending to a control it does not have.
 * `lib/retail/till-settings.ts` carries the full reasoning.
 *
 * The one thing a cashier *can* change from the till is their own unlock PIN,
 * which is a credential rather than a setting and lives at `pos/pin`.
 */

import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "@/lib/api-client";
import {
  Check,
  Coins,
  Info,
  Lock,
  Percent,
  Receipt,
  Shield,
  Storefront,
  X,
} from "@/lib/icons";
import type { TillCapability } from "@/lib/retail/till-settings";
import { tenderLabel } from "@/lib/retail/words";
import { cn } from "@/lib/utils";

import {
  PosEmptyState,
  PosPanel,
  PosPanelHeader,
  PosStatusPill,
} from "./pos-primitives";

type ShelfTaxRate = { taxPercent: string; productCount: number };

type TillSettings = {
  identity: {
    companyName: string | null;
    branchName: string | null;
    branchCode: string | null;
    branchLocation: string | null;
    registerName: string | null;
    registerCode: string | null;
    shiftNo: string | null;
    shiftOpenedAt: string | null;
  };
  money: {
    baseCurrency: string;
    priceListName: string | null;
    priceListCurrency: string;
    taxInclusive: boolean | null;
    shelfTax: {
      standardRatePercent: string | null;
      mixed: boolean;
      rates: ShelfTaxRate[];
      productCount: number;
    };
  };
  rules: {
    discountsNeedApproval: boolean;
    refundRequiresReason: boolean;
    voidRequiresReason: boolean;
    requireSupervisorForRefunds: boolean;
    splitTenderEnabled: boolean;
    requiredReferenceTenders: string[];
    minReferenceLength: number;
  };
  receipt: {
    displayName: string | null;
    legalName: string | null;
    vatNumber: string | null;
    registrationNumber: string | null;
    phone: string | null;
    physicalAddress: string | null;
    footerText: string | null;
  };
  capabilities: TillCapability[];
  canEdit: boolean;
};

/** A label and its value, or an honest dash. */
function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--edge-subtle)] py-2 last:border-b-0">
      <span className="shrink-0 text-xs font-medium text-[var(--text-muted)]">{label}</span>
      <span
        className={cn(
          "min-w-0 truncate text-right text-sm font-semibold",
          value ? "text-[var(--text-strong)]" : "text-[var(--text-muted)]",
        )}
      >
        {value ?? "Not set"}
      </span>
    </div>
  );
}

/**
 * A rule stated as what happens, not as a toggle position.
 *
 * "Reason required" tells a cashier what the till will ask them for. "Refund
 * requires reason: On" makes them translate a switch into a consequence while a
 * customer waits.
 */
function Rule({ on, when, otherwise }: { on: boolean; when: string; otherwise: string }) {
  return (
    <div className="flex items-start gap-2.5 border-b border-[var(--edge-subtle)] py-2.5 last:border-b-0">
      <span
        className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
        style={
          on
            ? { background: "var(--pos-status-info-bg)", color: "var(--pos-status-info-text)" }
            : { background: "var(--surface-muted)", color: "var(--text-muted)" }
        }
      >
        {on ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      </span>
      <span className="text-sm leading-5 text-[var(--text-strong)]">{on ? when : otherwise}</span>
    </div>
  );
}

function Capability({ capability }: { capability: TillCapability }) {
  return (
    <div className="flex items-start gap-2.5 border-b border-[var(--edge-subtle)] py-2.5 last:border-b-0">
      <span
        className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
        style={
          capability.allowed
            ? {
                background: "var(--pos-status-success-bg)",
                color: "var(--pos-status-success-text)",
              }
            : { background: "var(--pos-status-warning-bg)", color: "var(--pos-status-warning-text)" }
        }
      >
        {capability.allowed ? <Check className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-medium leading-5 text-[var(--text-strong)]">
          {capability.label}
        </div>
        {!capability.allowed && capability.whenRefused ? (
          <div className="mt-0.5 text-xs leading-5 text-[var(--text-muted)]">
            {capability.whenRefused}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function PosTillSettingsView() {
  const settingsQuery = useQuery({
    queryKey: ["retail-pos-till-settings"],
    queryFn: () => fetchJson<{ data: TillSettings }>("/api/v2/retail/pos/till-settings"),
  });

  const settings = settingsQuery.data?.data ?? null;

  if (!settings) {
    return (
      <PosPanel>
        {/*
          A failed read says so in the load-failure sentence ("would not load"),
          never as a tidy picture of an empty screen.
        */}
        <PosEmptyState
          icon={Info}
          title={
            settingsQuery.isLoading
              ? "Loading the till settings…"
              : "The till settings would not load"
          }
        />
      </PosPanel>
    );
  }

  const { identity, money, rules, receipt, capabilities } = settings;
  const tax = money.shelfTax;

  return (
    <div className="space-y-4">
      {/* ── Identity ─────────────────────────────────────────────────── */}
      <PosPanel>
        <PosPanelHeader
          title="This till"
          actions={
            identity.shiftNo ? null : <PosStatusPill tone="warning">No shift open</PosStatusPill>
          }
        />

        <div className="grid gap-x-8 gap-y-0 sm:grid-cols-2">
          <Row label="Company" value={identity.companyName} />
          <Row label="Site" value={identity.branchName} />
          <Row label="Site code" value={identity.branchCode} />
          <Row label="Address" value={identity.branchLocation} />
          <Row label="Till" value={identity.registerName} />
          <Row label="Till code" value={identity.registerCode} />
        </div>
      </PosPanel>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Currency & tax ─────────────────────────────────────────── */}
        <PosPanel>
          <PosPanelHeader title="Prices and VAT" />

          <div className="mb-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-muted)]">
                <Coins className="h-3.5 w-3.5" />
                Books kept in
              </div>
              <div className="mt-1.5 font-mono text-lg font-black text-[var(--text-strong)]">
                {money.baseCurrency}
              </div>
            </div>
            <div className="rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-muted)]">
                <Percent className="h-3.5 w-3.5" />
                VAT
              </div>
              <div className="mt-1.5 font-mono text-lg font-black text-[var(--text-strong)]">
                {tax.standardRatePercent === null ? "—" : `${tax.standardRatePercent}%`}
              </div>
            </div>
          </div>

          {/*
            The one line on this screen a cashier is most likely to be asked
            about at the counter: is the VAT already in the price on the shelf?
            Null is a third answer, not a false — nothing is priced yet.
          */}
          <div
            className="mb-3 flex items-start gap-2.5 rounded-xl px-3 py-2.5"
            style={{
              background:
                money.taxInclusive === null
                  ? "var(--pos-status-warning-bg)"
                  : "var(--pos-status-info-bg)",
              color:
                money.taxInclusive === null
                  ? "var(--pos-status-warning-text)"
                  : "var(--pos-status-info-text)",
            }}
          >
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-sm font-medium leading-5">
              {money.taxInclusive === null
                ? "No price list yet"
                : money.taxInclusive
                  ? "Prices include VAT"
                  : "Prices exclude VAT; the till adds it"}
            </p>
          </div>

          <Row label="Price list" value={money.priceListName} />
          <Row label="Currency" value={money.priceListCurrency} />
          <Row
            label="Products"
            value={tax.productCount === 0 ? null : String(tax.productCount)}
          />

          {tax.mixed ? (
            <div className="mt-3">
              <div className="mb-1.5 text-xs font-bold text-[var(--text-muted)]">
                VAT rates in use
              </div>
              <div className="flex flex-wrap gap-1.5">
                {tax.rates.map((rate) => (
                  <PosStatusPill key={rate.taxPercent} tone="neutral">
                    {rate.taxPercent}% · {rate.productCount}
                  </PosStatusPill>
                ))}
              </div>
            </div>
          ) : null}
        </PosPanel>

        {/* ── Rules at the counter ───────────────────────────────────── */}
        <PosPanel>
          <PosPanelHeader title="Till rules" />

          <Rule
            on={rules.discountsNeedApproval}
            when="Changing a price or giving a discount needs a manager's password."
            otherwise="You may change a price or give a discount, with a reason."
          />
          <Rule
            on={rules.refundRequiresReason}
            when="A refund needs a reason typed in."
            otherwise="A refund does not need a reason."
          />
          <Rule
            on={rules.requireSupervisorForRefunds}
            when="A refund also needs a supervisor to approve it."
            otherwise="You may complete a refund on your own."
          />
          <Rule
            on={rules.voidRequiresReason}
            when="Voiding a sale needs a reason typed in."
            otherwise="Voiding a sale does not need a reason."
          />
          <Rule
            on={rules.splitTenderEnabled}
            when="One sale may be paid with more than one tender."
            otherwise="One sale takes one tender only."
          />

          {rules.requiredReferenceTenders.length > 0 ? (
            <div className="mt-3 rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-3 py-2.5">
              <div className="text-xs font-bold text-[var(--text-muted)]">
                Needs a reference number, at least {rules.minReferenceLength} characters
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {rules.requiredReferenceTenders.map((tender) => (
                  <PosStatusPill key={tender} tone="warning">
                    {tenderLabel(tender)}
                  </PosStatusPill>
                ))}
              </div>
            </div>
          ) : null}
        </PosPanel>

        {/* ── Capabilities ───────────────────────────────────────────── */}
        <PosPanel>
          <PosPanelHeader
            title="What you may do"
            actions={<Shield className="h-5 w-5 text-[var(--text-muted)]" />}
          />
          {capabilities.map((capability) => (
            <Capability key={capability.id} capability={capability} />
          ))}
        </PosPanel>

        {/* ── Receipt ────────────────────────────────────────────────── */}
        <PosPanel>
          <PosPanelHeader
            title="Receipt"
            actions={<Receipt className="h-5 w-5 text-[var(--text-muted)]" />}
          />

          <Row label="Header name" value={receipt.displayName} />
          <Row label="Registered as" value={receipt.legalName} />
          <Row label="VAT number" value={receipt.vatNumber} />
          <Row label="Company number" value={receipt.registrationNumber} />
          <Row label="Phone" value={receipt.phone} />
          <Row label="Address" value={receipt.physicalAddress} />
          <Row label="Footer" value={receipt.footerText} />

        </PosPanel>
      </div>

      {/* ── Where to change it ───────────────────────────────────────── */}
      <PosPanel>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[var(--text-muted)]">
            <Storefront className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-[var(--text-strong)]">
              Changing any of this
            </h3>
            <p className="mt-1 max-w-[62ch] text-sm leading-6 text-[var(--text-muted)]">
              A manager changes these in the back office under{" "}
              <span className="font-medium text-[var(--text-strong)]">Settings → Shop</span>. Your
              unlock PIN is set on the lock screen.
            </p>
          </div>
        </div>
      </PosPanel>
    </div>
  );
}
