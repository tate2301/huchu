"use client";

/**
 * The finance overview: money in and out, and where it stands.
 *
 * For somebody who runs the money without being an accountant, so it speaks
 * in the words they use — money in, money out, owed to us, floats not
 * accounted for — and never in account codes or debits and credits.
 *
 * Top to bottom it answers the questions in the order they get asked. What
 * needs me? How much came in and went out? Where does it stand right now?
 * And then, by project or by person, where exactly — each row opening onto
 * the requisitions behind it.
 *
 * Everything on the page follows the filters, which live in the URL, so
 * "Tendai's money last month" is a link somebody can send.
 */

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { Alert, EmptyState, Skeleton, StatHero } from "@corelithzw/react";
import { MetricTile } from "@/components/accounting/hubs/metric-tile";
import { ReportTable, amt, dim, node, total, type ReportRow } from "@/components/accounting/report-table";
import { FILTER_ANY, ViewToolbar, ViewToolbarFilter } from "@/components/records/view-toolbar";
import { DateRangeFilter, describeDayRange } from "@/components/ui/date-range-filter";
import { SectionTab, SectionTabs } from "@/components/ui/section-tabs";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { ChevronRight, Coins, Receipt, Wallet, Work } from "@/lib/icons";
import { cn } from "@/lib/utils";

import {
  REQUISITION_STATUS_LABELS,
  formatMoney,
  payable,
  todayKey,
  type RequisitionRow,
} from "./money";

type NeedsActionKind = "awaiting-approval" | "not-receipted" | "no-receipt" | "over-budget";

type ProjectStanding = {
  project: { id: string; name: string; projectNo: string; status: string };
  budget: string | null;
  committed: string;
  spent: string;
  received: string;
  remaining: string | null;
  overBudget: boolean;
  requisitions: RequisitionRow[];
};

type PersonStanding = {
  person: { id: string; name: string | null };
  requested: string;
  approved: string;
  floatHeld: string;
  spent: string;
  unreceipted: string;
  requisitions: RequisitionRow[];
};

type FinanceResponse = {
  period: { from: string; to: string };
  currency: string;
  currencies: string[];
  needsAction: Array<{ kind: NeedsActionKind; count: number; amount: string | null }>;
  moneyIn: { total: string; receipts: number };
  moneyOut: { total: string; requisitions: string; direct: string };
  owedToUs: { total: string; invoices: number };
  floatsOut: { total: string; requisitions: number };
  committedUnpaid: { total: string; requisitions: number };
  byProject: ProjectStanding[];
  byPerson: PersonStanding[];
};

/** The query keys the page reads from its URL and hands to the API as they are. */
const SCOPE_KEYS = ["from", "to", "project", "person", "currency"] as const;

/** The project filter's word for "money that belongs to no project". */
const NO_PROJECT = "none";

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

function sum(values: Array<string | null>): number {
  return values.reduce<number>((total, value) => total + (value === null ? 0 : Number(value)), 0);
}

export function FinanceContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // `by`, not `view`: the app bar reads `view` as the name of the page.
  const view = searchParams.get("by") === "person" ? "person" : "project";
  const chosen = (key: (typeof SCOPE_KEYS)[number]) => searchParams.get(key) ?? FILTER_ANY;

  const apiQuery = useMemo(() => {
    const params = new URLSearchParams();
    for (const key of SCOPE_KEYS) {
      const value = searchParams.get(key);
      if (value) params.set(key, value);
    }
    return params.toString();
  }, [searchParams]);

  const financeQuery = useQuery({
    queryKey: ["crm", "finance", apiQuery],
    queryFn: () => fetchJson<FinanceResponse>(`/api/v2/crm/finance${apiQuery ? `?${apiQuery}` : ""}`),
    placeholderData: (previous) => previous,
  });

  const projectsQuery = useQuery({
    queryKey: ["crm", "projects", "finance-filter"],
    queryFn: () =>
      fetchJson<{ data: Array<{ id: string; name: string }> }>("/api/v2/crm/projects?costs=false&limit=100"),
    staleTime: 5 * 60_000,
  });

  const teamQuery = useQuery({
    queryKey: ["crm", "team"],
    queryFn: () =>
      fetchJson<{ data: Array<{ id: string; name: string | null }> }>("/api/v2/crm/team"),
    staleTime: 5 * 60_000,
  });

  const projectOptions = useMemo(
    () =>
      new Map<string, string>([
        [NO_PROJECT, "Not for a project"],
        ...(projectsQuery.data?.data ?? []).map((project): [string, string] => [project.id, project.name]),
      ]),
    [projectsQuery.data],
  );
  const personOptions = useMemo(
    () =>
      new Map(
        (teamQuery.data?.data ?? []).map((member): [string, string] => [member.id, member.name ?? "Unnamed"]),
      ),
    [teamQuery.data],
  );

  // Every change is a new URL, and the page it describes.
  const setParams = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === FILTER_ANY) next.delete(key);
      else next.set(key, value);
    }
    const rendered = next.toString();
    router.replace(rendered ? `${pathname}?${rendered}` : pathname, { scroll: false });
  };
  const viewHref = (next: "project" | "person") => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "project") params.delete("by");
    else params.set("by", next);
    const rendered = params.toString();
    return rendered ? `${pathname}?${rendered}` : pathname;
  };

  const data = financeQuery.data;

  if (financeQuery.error instanceof ApiError && financeQuery.error.status === 403) {
    return (
      <EmptyState
        title="This page is for whoever looks after the money"
        body="It shows everybody's requisitions, floats and spend. Ask an administrator for “See everybody's money” if you need it."
      />
    );
  }

  const period = data?.period ?? { from: searchParams.get("from"), to: searchParams.get("to") };
  const periodLabel = describeDayRange({ from: period.from, to: period.to }, "This month");
  const scopeLabel = [
    periodLabel,
    chosen("project") === FILTER_ANY ? "all projects" : projectOptions.get(chosen("project")) ?? "one project",
    chosen("person") === FILTER_ANY ? "everyone" : personOptions.get(chosen("person")) ?? "one person",
  ].join(" · ");

  // The same scope, handed to the lists the figures come from.
  const listScope = new URLSearchParams();
  if (data) {
    listScope.set("from", data.period.from);
    listScope.set("to", data.period.to);
  }
  if (chosen("project") !== FILTER_ANY) listScope.set("project", chosen("project"));
  if (chosen("person") !== FILTER_ANY) listScope.set("person", chosen("person"));

  return (
    <div className="space-y-6">
      {financeQuery.error ? (
        <Alert tone="danger" title="The finance overview would not load">
          {getApiErrorMessage(financeQuery.error)}
        </Alert>
      ) : null}

      {data ? (
        <NeedsActionStrip data={data} listScope={listScope} />
      ) : (
        <Skeleton height={92} aria-busy="true" />
      )}

      {/* Two figures of equal weight, side by side: what came in and what
          went out, for the period the filters below are set to. */}
      <section aria-label="Money in and out" className="grid gap-3 md:grid-cols-2">
        {data ? (
          <>
            <StatHero
              label="Money in"
              value={<span className="font-mono tabular-nums">{formatMoney(data.moneyIn.total, data.currency)}</span>}
              subtitle={`${plural(data.moneyIn.receipts, "customer payment", "customer payments")} · ${scopeLabel}`}
            />
            <StatHero
              label="Money out"
              value={<span className="font-mono tabular-nums">{formatMoney(data.moneyOut.total, data.currency)}</span>}
              subtitle={
                <>
                  <span className="font-mono">{formatMoney(data.moneyOut.requisitions, data.currency)}</span> paid out on
                  requisitions ·{" "}
                  <Link
                    href={`/crm/cost-tracker?type=SPENT&requisition=none&${listScope.toString()}`}
                    className="underline decoration-[var(--border)] underline-offset-2 hover:decoration-current"
                  >
                    <span className="font-mono">{formatMoney(data.moneyOut.direct, data.currency)}</span> spent directly
                  </Link>
                </>
              }
            />
          </>
        ) : (
          <>
            <Skeleton height={132} />
            <Skeleton height={132} />
          </>
        )}
      </section>

      {/* Where it stands right now. Not the period's: "floats we had out last
          March" is not a question anybody asks. */}
      <section aria-label="Where the money stands now" className="grid gap-3 sm:grid-cols-3">
        {data ? (
          <>
            <MetricTile
              title="Owed to us"
              value={Number(data.owedToUs.total)}
              valueLabel={formatMoney(data.owedToUs.total, data.currency)}
              delta={plural(data.owedToUs.invoices, "open invoice", "open invoices")}
              detail="right now"
              tone="neutral"
              icon={Coins}
              href="/crm/invoices"
            />
            <MetricTile
              title="Floats not accounted for"
              value={Number(data.floatsOut.total)}
              valueLabel={formatMoney(data.floatsOut.total, data.currency)}
              delta={plural(data.floatsOut.requisitions, "requisition", "requisitions")}
              detail="paid out, not yet accounted for"
              tone={data.floatsOut.requisitions > 0 ? "warn" : "neutral"}
              icon={Wallet}
              href="/crm/requisitions?queue=OUTSTANDING"
            />
            <MetricTile
              title="Committed, not yet paid"
              value={Number(data.committedUnpaid.total)}
              valueLabel={formatMoney(data.committedUnpaid.total, data.currency)}
              delta={plural(data.committedUnpaid.requisitions, "requisition", "requisitions")}
              detail="approved, waiting to be paid"
              tone="neutral"
              icon={Wallet}
              href="/crm/requisitions?queue=APPROVED"
            />
          </>
        ) : (
          <>
            <Skeleton height={92} />
            <Skeleton height={92} />
            <Skeleton height={92} />
          </>
        )}
      </section>

      <section aria-label="Where the money went" className="space-y-3">
        {/* Tabs on their own row, filters on the row below: which way to
            break the money down, and which money, are two questions. */}
        <SectionTabs label="Break the money down">
          <SectionTab to={viewHref("project")} active={view === "project"}>
            By project
          </SectionTab>
          <SectionTab to={viewHref("person")} active={view === "person"}>
            By person
          </SectionTab>
        </SectionTabs>

        <ViewToolbar
          filterCount={
            [chosen("project"), chosen("person"), chosen("currency")].filter((value) => value !== FILTER_ANY)
              .length + (searchParams.get("from") || searchParams.get("to") ? 1 : 0)
          }
          start={
            <>
              <DateRangeFilter
                label="Period"
                anyLabel="This month"
                value={{ from: searchParams.get("from") ?? data?.period.from ?? null, to: searchParams.get("to") ?? data?.period.to ?? null }}
                max={todayKey()}
                onChange={(next) => setParams({ from: next.from, to: next.to })}
              />
              <ViewToolbarFilter
                label="Project"
                value={chosen("project")}
                anyLabel="All projects"
                options={projectOptions}
                onChange={(next) => setParams({ project: next })}
              />
              <ViewToolbarFilter
                label="Person"
                value={chosen("person")}
                anyLabel="Everyone"
                options={personOptions}
                onChange={(next) => setParams({ person: next })}
              />
              {/* Only when there is more than one: a total of dollars and
                  ZiG is not a figure, so the page adds up one at a time. */}
              {data && data.currencies.length > 1 ? (
                <ViewToolbarFilter
                  label="Currency"
                  value={chosen("currency")}
                  anyLabel={data.currency}
                  options={new Map(data.currencies.map((currency): [string, string] => [currency, currency]))}
                  onChange={(next) => setParams({ currency: next })}
                />
              ) : null}
            </>
          }
        />

        {!data ? (
          <div className="space-y-1.5" aria-busy="true">
            <Skeleton height={36} />
            <Skeleton height={36} />
            <Skeleton height={36} />
          </div>
        ) : view === "project" ? (
          <ProjectBreakdown rows={data.byProject} currency={data.currency} />
        ) : (
          <PersonBreakdown rows={data.byPerson} currency={data.currency} listScope={listScope} />
        )}
      </section>
    </div>
  );
}

/**
 * What needs somebody, at most four things, each linking to the list that
 * holds it. Only the ones with something in them are drawn.
 */
function NeedsActionStrip({ data, listScope }: { data: FinanceResponse; listScope: URLSearchParams }) {
  const tiles = data.needsAction
    .filter((item) => item.count > 0)
    .map((item) => {
      const amount = item.amount === null ? null : formatMoney(item.amount, data.currency);
      switch (item.kind) {
        case "awaiting-approval":
          return (
            <MetricTile
              key={item.kind}
              title="Waiting for approval"
              value={item.count}
              valueLabel={String(item.count)}
              delta={amount ? `${amount} asked for` : undefined}
              detail={item.count === 1 ? "requisition" : "requisitions"}
              tone="warn"
              icon={Wallet}
              href="/crm/requisitions?queue=AWAITING_DECISION"
            />
          );
        case "not-receipted":
          return (
            <MetricTile
              key={item.kind}
              title="Cash not receipted"
              value={Number(item.amount)}
              valueLabel={amount ?? ""}
              delta={plural(item.count, "invoice", "invoices")}
              detail="collected, no receipt issued"
              tone="danger"
              icon={Receipt}
              // Positions, not flows: the person carries across, the period
              // does not — cash is unreceipted until it is receipted.
              href={`/crm/cost-tracker?flag=not-receipted${
                listScope.get("person") ? `&person=${listScope.get("person")}` : ""
              }`}
            />
          );
        case "no-receipt":
          return (
            <MetricTile
              key={item.kind}
              title="Spend without a receipt"
              value={item.count}
              valueLabel={String(item.count)}
              delta={amount ?? undefined}
              detail="in this period"
              tone="warn"
              icon={Receipt}
              href={`/crm/cost-tracker?flag=no-receipt&${listScope.toString()}`}
            />
          );
        case "over-budget":
          return (
            <MetricTile
              key={item.kind}
              title="Projects over budget"
              value={item.count}
              valueLabel={String(item.count)}
              detail="spent more than their budget"
              tone="danger"
              icon={Work}
              href="/crm/projects?budget=over"
            />
          );
      }
    });

  return (
    <section aria-labelledby="finance-needs-action" className="space-y-2">
      <h2 id="finance-needs-action" className="text-sm font-semibold text-[var(--text-strong)]">
        Needs action
      </h2>
      {tiles.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">Nothing is waiting on anybody.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{tiles}</div>
      )}
    </section>
  );
}

/** Which rows are open. Several at once: comparing two projects' requisitions is the point. */
function useExpanded() {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return { isOpen: (id: string) => open.has(id), toggle };
}

/** The disclosure mark at the head of a row that opens. */
function Disclosure({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <ChevronRight
        className={cn("size-3.5 shrink-0 text-[var(--text-subtle)] transition-transform", open && "rotate-90")}
        aria-hidden="true"
      />
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

function formatOrDim(value: string | null, currency: string) {
  return value === null ? dim() : amt(formatMoney(value, currency));
}

function ProjectBreakdown({ rows, currency }: { rows: ProjectStanding[]; currency: string }) {
  const { isOpen, toggle } = useExpanded();

  const detail = (row: ProjectStanding) => (
    <RequisitionLines
      requisitions={row.requisitions}
      show="requester"
      empty="No requisitions open on it, or moved in this period."
      footer={
        <Link href={`/crm/projects/${row.project.id}`} className="font-medium text-[var(--brand-strong)] hover:underline">
          Open the project
        </Link>
      }
    />
  );

  const tableRows: ReportRow[] = rows.map((row) => ({
    id: row.project.id,
    onSelect: () => toggle(row.project.id),
    expanded: isOpen(row.project.id),
    detail: detail(row),
    cells: [
      node(
        <Disclosure open={isOpen(row.project.id)}>
          <span className="font-semibold text-[var(--text-strong)]">{row.project.name}</span>
          {row.overBudget ? (
            <span className="acct-badge ml-2" data-tone="bad">
              Over budget
            </span>
          ) : null}
        </Disclosure>,
      ),
      formatOrDim(row.budget, currency),
      amt(formatMoney(row.committed, currency)),
      amt(formatMoney(row.spent, currency)),
      amt(formatMoney(row.received, currency)),
      row.remaining === null
        ? dim()
        : amt(formatMoney(row.remaining, currency), { tone: Number(row.remaining) < 0 ? "bad" : "strong" }),
    ],
  }));

  if (rows.length > 0) {
    tableRows.push({
      id: "total",
      emphasis: true,
      cells: [
        node(<span className="pl-5 font-semibold text-[var(--text-strong)]">All of them</span>),
        dim(),
        total(formatMoney(sum(rows.map((row) => row.committed)), currency)),
        total(formatMoney(sum(rows.map((row) => row.spent)), currency)),
        total(formatMoney(sum(rows.map((row) => row.received)), currency)),
        dim(),
      ],
    });
  }

  return (
    <>
      <p className="text-sm text-[var(--text-muted)]">
        Each project as it stands to date — its budget against everything committed and spent on it — whatever
        the period.
      </p>
      <div className="hidden md:block">
        <ReportTable
          label="Money by project"
          tracks="minmax(0,1fr) 120px 120px 120px 120px 120px"
          columns={[
            { label: "Project" },
            { label: "Budget", align: "right" },
            { label: "Committed", align: "right" },
            { label: "Spent", align: "right" },
            { label: "Received", align: "right" },
            { label: "Left", align: "right" },
          ]}
          rows={tableRows}
          emptyLabel="No project has money moving, or open, in this scope."
        />
      </div>
      <BreakdownList
        rows={rows.map((row) => ({
          id: row.project.id,
          title: row.project.name,
          flag: row.overBudget ? "Over budget" : null,
          figures: [
            { label: "Spent", value: formatMoney(row.spent, currency) },
            {
              label: "Left",
              value: row.remaining === null ? "No budget" : formatMoney(row.remaining, currency),
              bad: row.remaining !== null && Number(row.remaining) < 0,
            },
          ],
          detail: detail(row),
        }))}
        isOpen={isOpen}
        toggle={toggle}
        empty="No project has money moving, or open, in this scope."
      />
    </>
  );
}

function PersonBreakdown({
  rows,
  currency,
  listScope,
}: {
  rows: PersonStanding[];
  currency: string;
  listScope: URLSearchParams;
}) {
  const { isOpen, toggle } = useExpanded();

  const detail = (row: PersonStanding) => {
    const tracker = new URLSearchParams(listScope);
    tracker.set("person", row.person.id);
    return (
      <RequisitionLines
        requisitions={row.requisitions}
        show="project"
        empty="No requisitions open, or moved in this period."
        footer={
          <Link href={`/crm/cost-tracker?${tracker.toString()}`} className="font-medium text-[var(--brand-strong)] hover:underline">
            Open their cost tracker
          </Link>
        }
      />
    );
  };

  const tableRows: ReportRow[] = rows.map((row) => ({
    id: row.person.id,
    onSelect: () => toggle(row.person.id),
    expanded: isOpen(row.person.id),
    detail: detail(row),
    cells: [
      node(
        <Disclosure open={isOpen(row.person.id)}>
          <span className="font-semibold text-[var(--text-strong)]">{row.person.name ?? "Unnamed"}</span>
        </Disclosure>,
      ),
      amt(formatMoney(row.requested, currency)),
      amt(formatMoney(row.approved, currency)),
      amt(formatMoney(row.floatHeld, currency), { tone: Number(row.floatHeld) > 0 ? "warn" : "strong" }),
      amt(formatMoney(row.spent, currency)),
      Number(row.unreceipted) > 0 ? amt(formatMoney(row.unreceipted, currency), { tone: "bad" }) : dim(),
    ],
  }));

  if (rows.length > 0) {
    tableRows.push({
      id: "total",
      emphasis: true,
      cells: [
        node(<span className="pl-5 font-semibold text-[var(--text-strong)]">Everyone</span>),
        total(formatMoney(sum(rows.map((row) => row.requested)), currency)),
        total(formatMoney(sum(rows.map((row) => row.approved)), currency)),
        total(formatMoney(sum(rows.map((row) => row.floatHeld)), currency)),
        total(formatMoney(sum(rows.map((row) => row.spent)), currency)),
        total(formatMoney(sum(rows.map((row) => row.unreceipted)), currency)),
      ],
    });
  }

  return (
    <>
      <p className="text-sm text-[var(--text-muted)]">
        What each person asked for, was approved and spent in the period, and the money they are holding right now.
      </p>
      <div className="hidden md:block">
        <ReportTable
          label="Money by person"
          tracks="minmax(0,1fr) 120px 120px 120px 120px 130px"
          columns={[
            { label: "Person" },
            { label: "Asked for", align: "right" },
            { label: "Approved", align: "right" },
            { label: "Holding", align: "right" },
            { label: "Spent", align: "right" },
            { label: "Not receipted", align: "right" },
          ]}
          rows={tableRows}
          emptyLabel="Nobody has money moving, or held, in this scope."
        />
      </div>
      <BreakdownList
        rows={rows.map((row) => ({
          id: row.person.id,
          title: row.person.name ?? "Unnamed",
          flag: Number(row.unreceipted) > 0 ? `${formatMoney(row.unreceipted, currency)} not receipted` : null,
          figures: [
            { label: "Holding", value: formatMoney(row.floatHeld, currency) },
            { label: "Spent", value: formatMoney(row.spent, currency) },
          ],
          detail: detail(row),
        }))}
        isOpen={isOpen}
        toggle={toggle}
        empty="Nobody has money moving, or held, in this scope."
      />
    </>
  );
}

/**
 * The same rows on a phone: a name and the two figures that matter most,
 * opening onto the same requisitions. Six columns of money do not fit in
 * 390 pixels, and a table that scrolls sideways hides the figure you came for.
 */
function BreakdownList({
  rows,
  isOpen,
  toggle,
  empty,
}: {
  rows: Array<{
    id: string;
    title: string;
    flag: string | null;
    figures: Array<{ label: string; value: string; bad?: boolean }>;
    detail: ReactNode;
  }>;
  isOpen: (id: string) => boolean;
  toggle: (id: string) => void;
  empty: string;
}) {
  if (rows.length === 0) return <p className="text-sm text-[var(--text-muted)] md:hidden">{empty}</p>;

  return (
    <ul className="border-t border-[var(--table-divider)] md:hidden">
      {rows.map((row) => (
        <li key={row.id} className="border-b border-[var(--table-divider)]">
          <button
            type="button"
            aria-expanded={isOpen(row.id)}
            onClick={() => toggle(row.id)}
            className="flex w-full items-start justify-between gap-3 py-2.5 text-left"
          >
            <span className="min-w-0">
              <Disclosure open={isOpen(row.id)}>
                <span className="font-medium text-[var(--text-strong)]">{row.title}</span>
              </Disclosure>
              {row.flag ? (
                <span className="mt-0.5 block pl-5 text-sm font-medium text-[var(--badge-bad-fg)]">{row.flag}</span>
              ) : null}
            </span>
            <span className="shrink-0 space-y-0.5 text-right">
              {row.figures.map((figure) => (
                <span key={figure.label} className="block text-sm">
                  <span className="text-[var(--text-muted)]">{figure.label} </span>
                  <span
                    className={cn(
                      "font-mono font-medium tabular-nums",
                      figure.bad ? "text-[var(--badge-bad-fg)]" : "text-[var(--text-strong)]",
                    )}
                  >
                    {figure.value}
                  </span>
                </span>
              ))}
            </span>
          </button>
          {isOpen(row.id) ? <div className="pb-3 pl-5">{row.detail}</div> : null}
        </li>
      ))}
    </ul>
  );
}

/** The requisitions behind a row: each one a link to its own page. */
function RequisitionLines({
  requisitions,
  show,
  empty,
  footer,
}: {
  requisitions: RequisitionRow[];
  /** The one thing the row's own heading does not already say. */
  show: "requester" | "project";
  empty: string;
  footer: ReactNode;
}) {
  return (
    <div className="space-y-2">
      {requisitions.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">{empty}</p>
      ) : (
        <ul className="divide-y divide-[var(--table-divider)]">
          {requisitions.map((requisition) => (
            <li key={requisition.id}>
              <Link
                href={`/crm/requisitions/${requisition.id}`}
                className="flex items-baseline gap-3 py-1.5 text-sm hover:bg-[var(--surface-muted)]"
              >
                <span className="w-20 shrink-0 font-mono text-[var(--text-muted)]">{requisition.requisitionNo}</span>
                <span className="min-w-0 flex-1 truncate text-[var(--text-strong)]">
                  {requisition.purpose}
                  <span className="text-[var(--text-muted)]">
                    {" · "}
                    {show === "requester"
                      ? requisition.requestedBy?.name ?? "Unknown"
                      : requisition.project?.name ?? "Not for a project"}
                  </span>
                </span>
                <span className="hidden shrink-0 text-[var(--text-muted)] sm:inline">
                  {REQUISITION_STATUS_LABELS[requisition.status]}
                </span>
                <span className="w-28 shrink-0 text-right font-mono tabular-nums text-[var(--text-strong)]">
                  {formatMoney(payable(requisition), requisition.currency)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="text-sm">{footer}</div>
    </div>
  );
}
