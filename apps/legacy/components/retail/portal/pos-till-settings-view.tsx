"use client";

/**
 * What this till is set to, and what the person standing at it may do.
 *
 * S-7.6, contract surface 15 in `docs/retail/pos-production-readiness-2026-08-17.md`.
 * The endpoint at `pos/till-settings` shipped without this screen; the stock-take
 * called that out as the one place where "reuse the back office" produced
 * nothing usable, because a cashier on a tablet cannot open `/retail/setup/**`
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

import { fetchJson } from "@corelithzw/platform/api-client";
import {
  Check,
  Clock,
  Coins,
  Info,
  Lock,
  Percent,
  Printer,
  Receipt,
  Shield,
  Storefront,
  X,
} from "@corelithzw/ui/lib/icons";
import type { TillCapability } from "@/lib/retail/till-settings";
import { cn } from "@corelithzw/ui/lib/utils";

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
        <PosPanelHeader
          eyebrow="This terminal"
          title="Till settings"
          description="How this till is configured, and what you are allowed to do at it."
        />
        {/*
          "Unable to load" deliberately, and not only for the reader: it is the
          phrase `e2e/retail-shots.spec.ts` fails a screenshot run on, so a
          broken settings read shows up as a red test rather than as a tidy
          picture of an empty screen.
        */}
        <PosEmptyState
          icon={Info}
          title={
            settingsQuery.isLoading
              ? "Reading this till's settings"
              : "Unable to load these settings"
          }
          description={
            settingsQuery.isLoading
              ? "One moment."
              : "The till could not read its configuration. It can still sell — the rules below are enforced by the server either way."
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
          eyebrow="This terminal"
          title="Till settings"
          description="Everything here is read-only at the till. The shop manager changes it in the back office; this screen is so you know what the till will do before it does it."
          actions={
            identity.shiftNo ? (
              <PosStatusPill tone="success">
                <Clock className="h-3 w-3" />
                {identity.shiftNo} open
              </PosStatusPill>
            ) : (
              <PosStatusPill tone="warning">No shift open</PosStatusPill>
            )
          }
        />

        <div className="grid gap-x-8 gap-y-0 sm:grid-cols-2">
          <Row label="Shop" value={identity.companyName} />
          <Row label="Branch" value={identity.branchName} />
          <Row label="Branch code" value={identity.branchCode} />
          <Row label="Location" value={identity.branchLocation} />
          <Row label="Register" value={identity.registerName} />
          <Row label="Register code" value={identity.registerCode} />
        </div>
      </PosPanel>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Currency & tax ─────────────────────────────────────────── */}
        <PosPanel>
          <PosPanelHeader
            eyebrow="Currency & tax"
            title="What the shelf price means"
            description="Counted off the shelf, not typed into a settings box."
          />

          <div className="mb-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                <Coins className="h-3.5 w-3.5" />
                Books kept in
              </div>
              <div className="mt-1.5 font-mono text-lg font-black text-[var(--text-strong)]">
                {money.baseCurrency}
              </div>
            </div>
            <div className="rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                <Percent className="h-3.5 w-3.5" />
                Standard rate
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
                ? "No shelf price list exists yet, so the till has nothing to sell from."
                : money.taxInclusive
                  ? "The price on the shelf is what the customer pays. VAT is already inside it, and the receipt breaks it back out."
                  : "The price on the shelf is before VAT. The till adds it at the counter."}
            </p>
          </div>

          <Row label="Selling from" value={money.priceListName} />
          <Row label="Priced in" value={money.priceListCurrency} />
          <Row
            label="Products priced"
            value={tax.productCount === 0 ? null : String(tax.productCount)}
          />

          {tax.mixed ? (
            <div className="mt-3">
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                More than one rate is in use
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
          <PosPanelHeader
            eyebrow="At the counter"
            title="What the till will ask you for"
            description="These are enforced by the server, not by this screen."
          />

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
            when="Voiding a receipt needs a reason typed in."
            otherwise="Voiding a receipt does not need a reason."
          />
          <Rule
            on={rules.splitTenderEnabled}
            when="One sale may be paid with more than one tender."
            otherwise="One sale takes one tender only."
          />

          {rules.requiredReferenceTenders.length > 0 ? (
            <div className="mt-3 rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-3 py-2.5">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                Needs a reference number, at least {rules.minReferenceLength} characters
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {rules.requiredReferenceTenders.map((tender) => (
                  <PosStatusPill key={tender} tone="warning">
                    {tender.replace(/_/g, " ").toLowerCase()}
                  </PosStatusPill>
                ))}
              </div>
            </div>
          ) : null}
        </PosPanel>

        {/* ── Capabilities ───────────────────────────────────────────── */}
        <PosPanel>
          <PosPanelHeader
            eyebrow="Your account"
            title="What you may do"
            description="Read off the same permission matrix the server gates on, so it cannot disagree with what happens when you press the button."
            actions={<Shield className="h-5 w-5 text-[var(--text-muted)]" />}
          />
          {capabilities.map((capability) => (
            <Capability key={capability.id} capability={capability} />
          ))}
        </PosPanel>

        {/* ── Receipt ────────────────────────────────────────────────── */}
        <PosPanel>
          <PosPanelHeader
            eyebrow="Receipt"
            title="What prints on the slip"
            description="Taken from the shop's branding record."
            actions={<Receipt className="h-5 w-5 text-[var(--text-muted)]" />}
          />

          <Row label="Header name" value={receipt.displayName} />
          <Row label="Registered as" value={receipt.legalName} />
          <Row label="VAT number" value={receipt.vatNumber} />
          <Row label="Company number" value={receipt.registrationNumber} />
          <Row label="Phone" value={receipt.phone} />
          <Row label="Address" value={receipt.physicalAddress} />
          <Row label="Footer" value={receipt.footerText} />

          {/*
            The prototype has a "Printer name" field. Nothing in this repository
            stores or reads one: the till prints through the browser's own
            dialog. A box that configured nothing would be a control a cashier
            trusts on the day the receipts stop coming out, so the screen says
            what actually happens instead.
          */}
          <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-3 py-2.5">
            <Printer className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
            <p className="text-xs leading-5 text-[var(--text-muted)]">
              Receipts print through this device&rsquo;s own print dialog — whichever printer the
              tablet is set to. There is no printer to choose here.
            </p>
          </div>
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
              These settings belong to the shop, not to the till, so they are changed once in the
              back office and every register picks them up. Ask the manager for{" "}
              <span className="font-medium text-[var(--text-strong)]">
                Retail → Setup → Operations
              </span>{" "}
              for registers and branches,{" "}
              <span className="font-medium text-[var(--text-strong)]">POS policy</span> for the
              rules above, and{" "}
              <span className="font-medium text-[var(--text-strong)]">Branding</span> for the
              receipt. Your own unlock PIN is yours and is set on the lock screen.
            </p>
          </div>
        </div>
      </PosPanel>
    </div>
  );
}
