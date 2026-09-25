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
 * Drawn with the management contract's pieces (`components/management/ui`):
 * section headings that carry their count, lists that name their columns
 * once, figures mono against the right edge, and no sentence explaining a
 * figure its label already names. Everything follows the filters, which live
 * in the URL, so "Tendai's money last month" is a link somebody can send.
 */

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { Alert, EmptyState, Skeleton } from "@corelithzw/react";
import {
  ColumnFigure,
  ColumnList,
  ColumnName,
  ColumnText,
  FactList,
  SectionHeading,
  StatusDot,
} from "@/components/management/ui";
import { FILTER_ANY, ViewToolbar, ViewToolbarFilter } from "@/components/records/view-toolbar";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { SectionTab, SectionTabs } from "@/components/ui/section-tabs";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { REQUISITION_TONE } from "@/lib/crm/tones";

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

/**
 * The measure the short lists share with their headings. The breakdown is a
 * comparison across six figures and takes the page's width instead.
 */
const LIST_WIDTH = 560;
const WIDE = 1200;

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
        title="Finance is for whoever looks after the money"
        body="Ask an administrator for “See everybody's money”."
      />
    );
  }

  // The same scope, handed to the lists the figures come from.
  const listScope = new URLSearchParams();
  if (data) {
    listScope.set("from", data.period.from);
    listScope.set("to", data.period.to);
  }
  if (chosen("project") !== FILTER_ANY) listScope.set("project", chosen("project"));
  if (chosen("person") !== FILTER_ANY) listScope.set("person", chosen("person"));

  return (
    <div className="pb-10">
      {/* Which money — the period, a project, a person. Every figure on the
          page follows it, so it heads the page rather than sitting between
          the totals and the breakdown, where it read as the breakdown's own.
          The period rides in the slot a phone keeps on screen: a total with
          no period beside it is a number without a question. The rest fold
          into the one button there. */}
      <ViewToolbar
        filterCount={
          [chosen("project"), chosen("person"), chosen("currency")].filter((value) => value !== FILTER_ANY).length
        }
        search={
          <DateRangeFilter
            label="Period"
            anyLabel="This month"
            value={{ from: searchParams.get("from") ?? data?.period.from ?? null, to: searchParams.get("to") ?? data?.period.to ?? null }}
            max={todayKey()}
            onChange={(next) => setParams({ from: next.from, to: next.to })}
          />
        }
        start={
          <>
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

      {financeQuery.error ? (
        <Alert tone="danger" title="The finance overview would not load" className="mt-6">
          {getApiErrorMessage(financeQuery.error)}
        </Alert>
      ) : null}

      {data ? (
        <>
          <NeedsAction data={data} listScope={listScope} />
          <MoneyInOut data={data} listScope={listScope} />
          <Standing data={data} />
        </>
      ) : (
        <div className="mt-6 space-y-3" aria-busy="true">
          <Skeleton height={120} />
          <Skeleton height={160} />
          <Skeleton height={140} />
        </div>
      )}

      <section aria-label="Where the money went" className="mt-10 space-y-3">
        {/* Tabs on their own row: which way to break the money down is a
            question of its own, asked after which money. */}
        <SectionTabs label="Break the money down">
          <SectionTab to={viewHref("project")} active={view === "project"}>
            By project
          </SectionTab>
          <SectionTab to={viewHref("person")} active={view === "person"}>
            By person
          </SectionTab>
        </SectionTabs>

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
 * What needs somebody, at most four things, each a link to the list that
 * holds it. Only the ones with something in them are drawn, and the heading
 * counts them — nothing waiting is said once, under the heading.
 */
function NeedsAction({ data, listScope }: { data: FinanceResponse; listScope: URLSearchParams }) {
  const rows = data.needsAction
    .filter((item) => item.count > 0)
    .map((item) => {
      const amount = item.amount === null ? null : formatMoney(item.amount, data.currency);
      switch (item.kind) {
        case "awaiting-approval":
          return {
            id: item.kind,
            name: "Waiting for approval",
            href: "/crm/requisitions?queue=AWAITING_DECISION",
            count: plural(item.count, "requisition", "requisitions"),
            amount,
            tone: "warn" as const,
          };
        case "not-receipted":
          return {
            id: item.kind,
            name: "Cash not receipted",
            // Positions, not flows: the person carries across, the period
            // does not — cash is unreceipted until it is receipted.
            href: `/crm/cost-tracker?flag=not-receipted${
              listScope.get("person") ? `&person=${listScope.get("person")}` : ""
            }`,
            count: plural(item.count, "invoice", "invoices"),
            amount,
            tone: "danger" as const,
          };
        case "no-receipt":
          return {
            id: item.kind,
            name: "Spend without a receipt",
            href: `/crm/cost-tracker?flag=no-receipt&${listScope.toString()}`,
            count: plural(item.count, "line", "lines"),
            amount,
            tone: "warn" as const,
          };
        case "over-budget":
          return {
            id: item.kind,
            name: "Projects over budget",
            href: "/crm/projects?budget=over",
            count: plural(item.count, "project", "projects"),
            amount: null,
            tone: "danger" as const,
          };
      }
    });

  return (
    <section aria-labelledby="finance-needs-action">
      <SectionHeading count={rows.length} maxWidth={LIST_WIDTH}>
        <span id="finance-needs-action">Needs action</span>
      </SectionHeading>
      <ColumnList
        label="Needs action"
        maxWidth={LIST_WIDTH}
        empty="Nothing is waiting on anybody."
        columns={[
          { id: "what", label: "What" },
          { id: "count", label: "How many", align: "end" },
          { id: "amount", label: "Amount", align: "end" },
        ]}
        rows={rows.map((row) => ({
          id: row.id,
          cells: {
            what: <ColumnName name={row.name} href={row.href} />,
            count: <ColumnText>{row.count}</ColumnText>,
            amount: row.amount ? <ColumnFigure tone={row.tone}>{row.amount}</ColumnFigure> : null,
          },
        }))}
      />
    </section>
  );
}

/**
 * Two figures of equal weight, side by side: what came in and what went out,
 * in the period the filters are set to. Under each, what it is made of.
 */
function MoneyInOut({ data, listScope }: { data: FinanceResponse; listScope: URLSearchParams }) {
  return (
    <section aria-label="Money in and out" className="grid gap-x-12 md:grid-cols-2">
      <Headline
        heading="Money in"
        value={formatMoney(data.moneyIn.total, data.currency)}
        facts={[{ label: "Customer payments", value: String(data.moneyIn.receipts), mono: true }]}
      />
      <Headline
        heading="Money out"
        value={formatMoney(data.moneyOut.total, data.currency)}
        facts={[
          {
            label: "Paid out on requisitions",
            value: formatMoney(data.moneyOut.requisitions, data.currency),
            mono: true,
          },
          {
            label: "Spent directly",
            value: formatMoney(data.moneyOut.direct, data.currency),
            mono: true,
            href: `/crm/cost-tracker?type=SPENT&requisition=none&${listScope.toString()}`,
          },
        ]}
      />
    </section>
  );
}

function Headline({
  heading,
  value,
  facts,
}: {
  heading: string;
  value: string;
  facts: Array<{ label: string; value: string; mono?: boolean; href?: string }>;
}) {
  return (
    <div className="min-w-0">
      <SectionHeading maxWidth={LIST_WIDTH}>{heading}</SectionHeading>
      <p className="mb-2 font-mono text-[28px] font-semibold leading-tight tracking-[-0.01em] tabular-nums text-[var(--text-strong)]">
        {value}
      </p>
      <FactList items={facts} align="end" maxWidth={LIST_WIDTH} labelWidth={180} />
    </div>
  );
}

/**
 * Where the money stands right now — not in the period: "floats we had out
 * last March" is not a question anybody asks.
 */
function Standing({ data }: { data: FinanceResponse }) {
  const currency = data.currency;
  return (
    <section aria-labelledby="finance-standing">
      <SectionHeading maxWidth={LIST_WIDTH}>
        <span id="finance-standing">Where it stands</span>
      </SectionHeading>
      <ColumnList
        label="Where it stands"
        maxWidth={LIST_WIDTH}
        columns={[
          { id: "what", label: "What" },
          { id: "count", label: "How many", align: "end" },
          { id: "amount", label: "Amount", align: "end" },
        ]}
        rows={[
          {
            id: "owed",
            cells: {
              what: <ColumnName name="Owed to us" href="/crm/invoices" />,
              count: <ColumnText>{plural(data.owedToUs.invoices, "invoice", "invoices")}</ColumnText>,
              amount: <ColumnFigure>{formatMoney(data.owedToUs.total, currency)}</ColumnFigure>,
            },
          },
          {
            id: "floats",
            cells: {
              what: <ColumnName name="Floats not accounted for" href="/crm/requisitions?queue=OUTSTANDING" />,
              count: <ColumnText>{plural(data.floatsOut.requisitions, "requisition", "requisitions")}</ColumnText>,
              amount: (
                <ColumnFigure tone={data.floatsOut.requisitions > 0 ? "warn" : "default"}>
                  {formatMoney(data.floatsOut.total, currency)}
                </ColumnFigure>
              ),
            },
          },
          {
            id: "committed",
            cells: {
              what: <ColumnName name="Approved, not yet paid" href="/crm/requisitions?queue=APPROVED" />,
              count: (
                <ColumnText>{plural(data.committedUnpaid.requisitions, "requisition", "requisitions")}</ColumnText>
              ),
              amount: <ColumnFigure>{formatMoney(data.committedUnpaid.total, currency)}</ColumnFigure>,
            },
          },
        ]}
      />
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

function money(value: string | null, currency: string, tone?: "warn" | "danger") {
  if (value === null) return <ColumnFigure tone="muted">—</ColumnFigure>;
  return <ColumnFigure tone={tone}>{formatMoney(value, currency)}</ColumnFigure>;
}

/**
 * Each project as it stands to date — a budget can only be spent against in
 * full — with its requisitions for the period under it. Over budget first.
 *
 * On a phone the six figures come down to the two that matter, spent and
 * left, rather than a table that scrolls sideways past the one you came for.
 */
function ProjectBreakdown({ rows, currency }: { rows: ProjectStanding[]; currency: string }) {
  const { isOpen, toggle } = useExpanded();

  return (
    <ColumnList
      label="Money by project"
      maxWidth={WIDE}
      empty="No project has money moving in this period."
      columns={[
        { id: "project", label: "Project" },
        { id: "budget", label: "Budget", align: "end", hideBelow: "md" },
        { id: "committed", label: "Committed", align: "end", hideBelow: "md" },
        { id: "spent", label: "Spent", align: "end" },
        { id: "received", label: "Received", align: "end", hideBelow: "md" },
        { id: "left", label: "Left", align: "end" },
      ]}
      rows={rows.map((row) => ({
        id: row.project.id,
        expanded: isOpen(row.project.id),
        onToggle: () => toggle(row.project.id),
        detail: (
          <RequisitionLines
            requisitions={row.requisitions}
            show="requester"
            empty="No requisitions on it in this period."
            open={{ href: `/crm/projects/${row.project.id}`, label: "Open the project" }}
          />
        ),
        cells: {
          project: (
            <ColumnName
              code={row.project.projectNo}
              name={row.project.name}
              meta={row.overBudget ? <StatusDot tone="danger" label="Over budget" /> : undefined}
            />
          ),
          budget: money(row.budget, currency),
          committed: money(row.committed, currency),
          spent: money(row.spent, currency),
          received: money(row.received, currency),
          left: money(row.remaining, currency, row.remaining !== null && Number(row.remaining) < 0 ? "danger" : undefined),
        },
      }))}
      total={
        rows.length > 1
          ? {
              project: "Total",
              budget: null,
              committed: <ColumnFigure>{formatMoney(sum(rows.map((row) => row.committed)), currency)}</ColumnFigure>,
              spent: <ColumnFigure>{formatMoney(sum(rows.map((row) => row.spent)), currency)}</ColumnFigure>,
              received: <ColumnFigure>{formatMoney(sum(rows.map((row) => row.received)), currency)}</ColumnFigure>,
              left: null,
            }
          : undefined
      }
    />
  );
}

/** What each person asked for, was approved and spent in the period, and what they hold now. */
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

  const trackerHref = (personId: string) => {
    const tracker = new URLSearchParams(listScope);
    tracker.set("person", personId);
    return `/crm/cost-tracker?${tracker.toString()}`;
  };

  return (
    <ColumnList
      label="Money by person"
      maxWidth={WIDE}
      empty="Nobody has money moving in this period."
      columns={[
        { id: "person", label: "Person" },
        { id: "requested", label: "Asked for", align: "end", hideBelow: "md" },
        { id: "approved", label: "Approved", align: "end", hideBelow: "md" },
        { id: "holding", label: "Holding", align: "end" },
        { id: "spent", label: "Spent", align: "end", hideBelow: "md" },
        { id: "unreceipted", label: "Not receipted", align: "end" },
      ]}
      rows={rows.map((row) => ({
        id: row.person.id,
        expanded: isOpen(row.person.id),
        onToggle: () => toggle(row.person.id),
        detail: (
          <RequisitionLines
            requisitions={row.requisitions}
            show="project"
            empty="No requisitions in this period."
            open={{ href: trackerHref(row.person.id), label: "Open their cost tracker" }}
          />
        ),
        cells: {
          person: <ColumnName name={row.person.name ?? "Unnamed"} />,
          requested: money(row.requested, currency),
          approved: money(row.approved, currency),
          holding: money(row.floatHeld, currency, Number(row.floatHeld) > 0 ? "warn" : undefined),
          spent: money(row.spent, currency),
          unreceipted:
            Number(row.unreceipted) > 0 ? (
              money(row.unreceipted, currency, "danger")
            ) : (
              <ColumnFigure tone="muted">—</ColumnFigure>
            ),
        },
      }))}
      total={
        rows.length > 1
          ? {
              person: "Total",
              requested: <ColumnFigure>{formatMoney(sum(rows.map((row) => row.requested)), currency)}</ColumnFigure>,
              approved: <ColumnFigure>{formatMoney(sum(rows.map((row) => row.approved)), currency)}</ColumnFigure>,
              holding: <ColumnFigure>{formatMoney(sum(rows.map((row) => row.floatHeld)), currency)}</ColumnFigure>,
              spent: <ColumnFigure>{formatMoney(sum(rows.map((row) => row.spent)), currency)}</ColumnFigure>,
              unreceipted: <ColumnFigure>{formatMoney(sum(rows.map((row) => row.unreceipted)), currency)}</ColumnFigure>,
            }
          : undefined
      }
    />
  );
}

/** The requisitions behind a row: each one a link to its own page. */
function RequisitionLines({
  requisitions,
  show,
  empty,
  open,
}: {
  requisitions: RequisitionRow[];
  /** The one thing the row's own name does not already say. */
  show: "requester" | "project";
  empty: string;
  /** Where the row's own page is, said once under its requisitions. */
  open: { href: string; label: string };
}): ReactNode {
  return (
    <div className="space-y-2 pt-1">
      <ColumnList
        label="Requisitions"
        maxWidth={WIDE}
        empty={empty}
        columns={[
          { id: "requisition", label: "Requisition" },
          { id: "status", label: "Status", hideBelow: "sm" },
          { id: "amount", label: "Amount", align: "end" },
        ]}
        rows={requisitions.map((requisition) => ({
          id: requisition.id,
          cells: {
            requisition: (
              <ColumnName
                code={requisition.requisitionNo}
                name={requisition.purpose}
                meta={
                  show === "requester"
                    ? (requisition.requestedBy?.name ?? "Unknown")
                    : (requisition.project?.name ?? "Not for a project")
                }
                href={`/crm/requisitions/${requisition.id}`}
              />
            ),
            status: (
              <StatusDot
                tone={REQUISITION_TONE[requisition.status] ?? "neutral"}
                label={REQUISITION_STATUS_LABELS[requisition.status]}
              />
            ),
            amount: <ColumnFigure>{formatMoney(payable(requisition), requisition.currency)}</ColumnFigure>,
          },
        }))}
      />
      <Link
        href={open.href}
        className="inline-block text-sm font-medium text-[var(--brand-strong)] underline decoration-transparent underline-offset-2 hover:decoration-current"
      >
        {open.label}
      </Link>
    </div>
  );
}
