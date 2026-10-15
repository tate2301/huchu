"use client";

import * as React from "react";
import { useQueries, useQuery } from "@tanstack/react-query";

import { ButtonLink, Kit } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import { PageChrome } from "@/components/layout/page-chrome";
import { SendNoticeDialog } from "@/components/schools/common/send-notice-dialog";
import { useSchoolAccess } from "@/components/schools/common/use-school-access";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  ageTable,
  behindClass,
  classTable,
  feeTable,
  feesFigures,
  feesFinding,
  feeTotals,
  termColumns,
  termTable,
  type ArrearsResponse,
  type CollectionsResponse,
} from "@/lib/reports/insight-fees";
import { fetchSchoolsClasses, fetchSchoolsTerms, type SchoolsTermRecord } from "@/lib/schools/admin-v2";
import { fetchSchoolFeeStructures } from "@/lib/schools/fees-v2";
import { startOfDayIn } from "@/lib/reports/list-query";
import { insightMoney } from "@/lib/reports/week-insights";
import { addDays, DEFAULT_TIME_ZONE, todayIn } from "@/lib/workspace/format";

import {
  Columns,
  InsightAside,
  InsightBlock,
  InsightError,
  InsightFrame,
  InsightLoading,
  InsightPage,
  InsightTables,
  PeriodTools,
  type InsightCard,
} from "../insight-page";
import { useInsightAddress } from "./use-period";

const PERIODS = [
  { value: "term", label: "This term" },
  { value: "last", label: "Last term" },
  { value: "year", label: "This year" },
] as const;
type Period = (typeof PERIODS)[number]["value"];

const BOARDING = [
  { value: "", label: "Boarders and day" },
  { value: "BOARDING", label: "Boarders" },
  { value: "DAY", label: "Day pupils" },
] as const;

/** The term today falls in, else the last one begun; and the one before it. */
function termsNow(terms: readonly SchoolsTermRecord[], today = todayIn()) {
  const begun = [...terms].filter((term) => term.startDate.slice(0, 10) <= today).sort((a, b) => b.startDate.localeCompare(a.startDate));
  return { current: begun[0] ?? null, last: begun[1] ?? null };
}

async function download(params: URLSearchParams, reportType: "collections" | "arrears") {
  const query = new URLSearchParams(params);
  query.set("reportType", reportType);
  query.set("format", "pdf");
  const response = await fetch(`/api/v2/schools/reports/export?${query.toString()}`, { credentials: "include" });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `The export failed (${response.status}).`);
  }
  const blob = await response.blob();
  const named = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1];
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = named ?? `${reportType}.pdf`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(href), 0);
}

/**
 * Reports → Insights → Fees (PageSchoolFees): what the school's Collections
 * and Arrears showed, as one insight. The term, the class and boarders or day
 * are in the address; Remind sends the school's own notice to the families in
 * arrears once a person presses it.
 */
export function FeesInsight() {
  const address = useInsightAddress(
    PERIODS.map((entry) => entry.value),
    "term",
  );
  const { toast } = useToast();
  const access = useSchoolAccess();
  const classId = address.get("class") ?? "";
  const boarding = address.get("boarding") ?? "";

  const terms = useQuery({ queryKey: ["schools", "terms", "insight"], queryFn: () => fetchSchoolsTerms({ page: 1, limit: 100 }) });
  const classes = useQuery({ queryKey: ["schools", "classes", "insight"], queryFn: () => fetchSchoolsClasses({ page: 1, limit: 200 }) });
  const { current, last } = termsNow(terms.data?.data ?? []);

  // What the chosen period reads: a term, the year, or days of one's own.
  const scope = React.useMemo(() => {
    const params = new URLSearchParams();
    if (address.days) {
      params.set("startDate", startOfDayIn(address.days.from, DEFAULT_TIME_ZONE).toISOString());
      params.set("endDate", new Date(startOfDayIn(addDays(address.days.to, 1), DEFAULT_TIME_ZONE).getTime() - 1).toISOString());
    } else if (address.period === "year" && current) params.set("academicYearId", current.academicYear.id);
    else if (address.period === "last" && last) params.set("termId", last.id);
    else if (current) params.set("termId", current.id);
    if (classId) params.set("classId", classId);
    if (boarding) params.set("boarding", boarding);
    return params;
  }, [address.days, address.period, boarding, classId, current, last]);
  const ready = terms.isSuccess;
  const query = scope.toString();

  const collections = useQuery({
    queryKey: ["reports-insight-fees", query],
    queryFn: () => fetchJson<CollectionsResponse>(`/api/v2/schools/reports/collections?${query}`),
    enabled: ready,
    placeholderData: (previous) => previous,
  });
  // The term before, for "was 79%".
  const beforeTerm = address.period === "term" && !address.days ? last : null;
  const before = useQuery({
    queryKey: ["reports-insight-fees-before", beforeTerm?.id, classId, boarding],
    queryFn: () =>
      fetchJson<CollectionsResponse>(
        `/api/v2/schools/reports/collections?${new URLSearchParams({ termId: beforeTerm!.id, ...(classId ? { classId } : {}), ...(boarding ? { boarding } : {}) }).toString()}`,
      ),
    enabled: Boolean(beforeTerm),
  });
  // Every term of the year, for "Is each term collected?".
  const yearId = current?.academicYear.id ?? null;
  const year = useQuery({
    queryKey: ["reports-insight-fees-year", yearId, classId, boarding],
    queryFn: () =>
      fetchJson<CollectionsResponse>(
        `/api/v2/schools/reports/collections?${new URLSearchParams({ academicYearId: yearId!, ...(classId ? { classId } : {}), ...(boarding ? { boarding } : {}) }).toString()}`,
      ),
    enabled: Boolean(yearId),
  });
  const arrearsQuery = React.useMemo(() => {
    const params = new URLSearchParams();
    if (scope.get("termId")) params.set("termId", scope.get("termId")!);
    if (classId) params.set("classId", classId);
    if (boarding) params.set("boarding", boarding);
    return params.toString();
  }, [boarding, classId, scope]);
  const arrears = useQuery({
    queryKey: ["reports-insight-fees-arrears", arrearsQuery],
    queryFn: () => fetchJson<ArrearsResponse>(`/api/v2/schools/reports/arrears?${arrearsQuery}`),
    enabled: ready,
    placeholderData: (previous) => previous,
  });
  const structures = useQuery({
    queryKey: ["reports-insight-fees-structures"],
    queryFn: () => fetchSchoolFeeStructures({ page: 1, limit: 200 }),
  });
  const byFee = useQueries({
    queries: (structures.data?.data ?? []).map((structure) => ({
      queryKey: ["reports-insight-fees-fee", structure.id, query],
      queryFn: () =>
        fetchJson<CollectionsResponse>(`/api/v2/schools/reports/collections?${new URLSearchParams([...scope.entries(), ["feeStructureId", structure.id]]).toString()}`),
      enabled: ready && address.get("view") === "fee",
    })),
  });

  const [reminding, setReminding] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);

  const chrome = (
    <PageChrome title="Fees">
      <Kit contents>
        <ButtonLink href="/reports/school-fee-balances" icon="reports">
          Open Fees owed
        </ButtonLink>
      </Kit>
    </PageChrome>
  );

  const classOptions = classes.data?.data ?? [];
  const className = classOptions.find((entry) => entry.id === classId)?.name ?? null;
  const tools = (
    <>
      <PeriodTools
        periods={PERIODS}
        period={address.period as Period | null}
        onPeriod={address.setPeriod}
        days={address.days}
        onDays={address.setDays}
        onClearDays={address.clearDays}
      />
      <MenuButton
        className={classId ? "chipsel is-set" : "chipsel"}
        icon="filter"
        label="Class"
        items={[
          { key: "", label: "Every class", checked: !classId, onSelect: () => address.set({ class: null }) },
          ...classOptions.map((entry) => ({ key: entry.id, label: entry.name, checked: entry.id === classId, onSelect: () => address.set({ class: entry.id }) })),
        ]}
      >
        {className ?? "Every class"}
      </MenuButton>
      <MenuButton
        className={boarding ? "chipsel is-set" : "chipsel"}
        icon="filter"
        label="Boarders or day"
        items={BOARDING.map((entry) => ({ key: entry.value || "both", label: entry.label, checked: entry.value === boarding, onSelect: () => address.set({ boarding: entry.value || null }) }))}
      >
        {BOARDING.find((entry) => entry.value === boarding)?.label ?? "Boarders and day"}
      </MenuButton>
    </>
  );

  if (terms.isPending || (ready && collections.isPending)) {
    return (
      <>
        {chrome}
        <InsightFrame>
          <InsightLoading />
        </InsightFrame>
      </>
    );
  }

  const failed = terms.error ?? collections.error;
  if (failed || !collections.data) {
    return (
      <>
        {chrome}
        <InsightFrame>
          <InsightPage tools={tools}>
            <InsightError
              message={`${getApiErrorMessage(failed, "Check the connection and try again.")} Fees are for whoever can open the school's reports; the head or the bursar can tell you who that is.`}
              onRetry={() => void (terms.error ? terms.refetch() : collections.refetch())}
            />
          </InsightPage>
        </InsightFrame>
      </>
    );
  }

  const rows = collections.data.byYearGroup;
  const totals = feeTotals(rows);
  const behind = behindClass(rows);
  const whose = address.days ? "these dates’" : address.period === "year" ? "the year’s" : address.period === "last" ? `${last?.name ?? "last term"}’s` : "the term’s";
  const when = address.days ? "in these dates" : address.period === "year" ? "this year" : address.period === "last" ? "last term" : "this term";
  const beforeRows = before.data?.byYearGroup ?? null;
  const beforeRate = beforeRows ? feeTotals(beforeRows).rate : null;
  const owing = arrears.data?.data ?? [];
  const arrearsHref = (id: string) => `/schools/finance/arrears?class=${encodeURIComponent(id)}`;

  const feeRows = (structures.data?.data ?? []).map((structure, index) => {
    const result = byFee[index]?.data;
    const sum = result ? feeTotals(result.byYearGroup) : null;
    return { id: structure.id, name: `${structure.name}, ${structure.class.name}`, billed: sum?.billed ?? 0, paid: sum?.paid ?? 0 };
  });
  const tables = [
    classTable(rows, arrearsHref),
    ageTable(owing, (id) => `/schools/students/${id}`),
    feeTable(feeRows),
    termTable(collections.data.data),
  ];

  const cards: InsightCard[] = [];
  if (owing.length > 0) {
    cards.push({
      key: "remind",
      title: `${owing.length} ${owing.length === 1 ? "family still owes" : "families still owe"}`,
      body: "A reminder goes to each family’s portal and phone. You choose who, and send it.",
      action: {
        label: `Remind the ${owing.length}`,
        icon: "remind",
        onClick: () => setReminding(true),
        disabled: !access.can("schools.reports", "create"),
      },
    });
  }
  if (behind && totals.rate !== null && behind.collectionRate / 100 < totals.rate && behind.classId) {
    cards.push({
      key: "behind",
      title: `${behind.className} is at ${Math.round(behind.collectionRate)}%`,
      body: `${insightMoney(Math.max(0, behind.invoiced - behind.collected))} owed by ${behind.owing} ${behind.owing === 1 ? "family" : "families"}.`,
      action: { label: `See ${behind.className}’s arrears`, icon: "list", href: arrearsHref(behind.classId) },
    });
  }
  cards.push({
    key: "pdf",
    title: "For the board meeting",
    body: "Collections and arrears, each as a PDF.",
    action: {
      label: "Export as PDF",
      icon: "export",
      busy: exporting,
      onClick: () => {
        setExporting(true);
        const params = new URLSearchParams(scope);
        void Promise.all([download(params, "collections"), download(new URLSearchParams(arrearsQuery), "arrears")])
          .catch((error) => toast({ title: "Export failed", description: getApiErrorMessage(error), variant: "destructive" }))
          .finally(() => setExporting(false));
      },
    },
  });

  const view = address.get("view") ?? "class";
  const empty = totals.billed === 0;

  return (
    <>
      {chrome}
      <InsightFrame>
        <InsightPage
          tools={tools}
          finding={empty ? { fact: `Nothing was billed ${when}.`, rest: "Bills raised against the term show here as they are paid." } : feesFinding(rows, whose)}
          figures={empty ? null : feesFigures(rows, beforeRate, arrears.data?.summary ?? null, when)}
          aside={<InsightAside cards={cards} send={{ words: "Fees owed, the report under this page, as a PDF or a spreadsheet, on the days you choose.", href: "/reports/school-fee-balances?send=1" }} />}
        >
          <div className={collections.isFetching ? "rp-blocks is-fetching" : "rp-blocks"}>
            <InsightBlock
              title="Is each term collected?"
              sum="invoiced, split into collected and still owing"
              legend={[
                { label: "Collected", color: "var(--color-ink-2)" },
                { label: "Still owing", color: "var(--color-warning)" },
              ]}
            >
              <Columns
                columns={termColumns(year.data?.data ?? [])}
                labels={(year.data?.data ?? []).map((row) => row.termName)}
                empty="Nothing was billed this year."
              />
            </InsightBlock>
            <InsightTables tables={tables} value={view} onChange={(next) => address.set({ view: next === "class" ? null : next })} />
          </div>
        </InsightPage>
      </InsightFrame>
      {reminding ? (
        <SendNoticeDialog
          open
          onOpenChange={(next) => {
            if (!next) setReminding(false);
          }}
          title={owing.length === 1 ? `Remind ${owing[0]!.studentName}'s family` : `Remind the ${owing.length}`}
          audience={{
            studentIds: owing.map((row) => row.studentId),
            describe: owing.length === 1 ? `${owing[0]!.studentName}'s guardians` : `the families of the ${owing.length} in arrears in this view`,
          }}
          severity="WARNING"
          defaultSubject="School fees outstanding"
          defaultBody="Our records show school fees still outstanding on your child's account. Please settle the balance, or come and see the bursar to arrange terms. Your statement is on the portal."
          sendLabel={owing.length === 1 ? "Send the reminder" : `Remind the ${owing.length}`}
          onSent={(result) =>
            toast({
              title: `Sent to ${result.recipients} ${result.recipients === 1 ? "family" : "families"}`,
              description: result.withoutAccount > 0 ? `${result.withoutAccount} have no portal account yet, so ring them.` : undefined,
              variant: "success",
            })
          }
        />
      ) : null}
    </>
  );
}

