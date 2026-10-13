"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ButtonLink, Empty, Kit } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { insightMoney } from "@/lib/reports/week-insights";
import type { FormInsights } from "@/lib/crm/site-visits/insights";
import { answerBars, breakdownTable, visitsCards, visitsFigures, visitsFinding, type VisitCard } from "@/lib/reports/insight-visits";

import {
  HBars,
  InsightAside,
  InsightBlock,
  InsightError,
  InsightFrame,
  InsightLoading,
  InsightPage,
  InsightTableView,
  PeriodTools,
  type InsightCard,
} from "../insight-page";
import { periodDays, useInsightAddress } from "./use-period";

type Response = {
  forms: Array<{ id: string; name: string; visits: number }>;
  reps: Array<{ id: string; name: string }>;
  form: { id: string; name: string } | null;
  insights: FormInsights | null;
  canEdit: boolean;
};

const PERIODS = [
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "12m", label: "12 months" },
] as const;
/** A form's own insights in Build read every visit, as they always have. */
const FORM_PERIODS = [{ value: "all", label: "All time" }, ...PERIODS] as const;
type Period = (typeof FORM_PERIODS)[number]["value"];

const money = insightMoney;

/**
 * Site visits, read from a site-visit form's visits (PageInsightVisits).
 *
 * In Reports (`/reports/insights/site-visits`) the Form chip picks the form,
 * the most used first. In Build (`formId`, `/crm/build/visits/[id]/insights`)
 * the page is that form's own: every visit by default, and Make it required
 * on the question the visits most need.
 */
export function VisitsInsight({ formId }: { formId?: string }) {
  const own = Boolean(formId);
  const periods = own ? FORM_PERIODS : PERIODS;
  const address = useInsightAddress<Period>(
    periods.map((entry) => entry.value),
    own ? "all" : "90d",
  );
  const days = address.days ?? (address.period && address.period !== "all" ? periodDays(address.period) : null);
  const form = formId ?? address.get("form");
  const rep = address.get("rep");
  const search = new URLSearchParams();
  if (form) search.set("form", form);
  if (rep) search.set("rep", rep);
  if (days) {
    search.set("from", days.from);
    search.set("to", days.to);
  }
  const queryKey = ["reports-insight-visits", search.toString()];
  const query = useQuery({
    queryKey,
    queryFn: () => fetchJson<Response>(`/api/v2/reports/insights/site-visits?${search.toString()}`),
    placeholderData: (previous) => previous,
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const require = useMutation({
    mutationFn: ({ id, key }: { id: string; key: string }) =>
      fetchJson(`/api/v2/crm/question-sets/${id}/insights`, { method: "POST", body: JSON.stringify({ require: key }) }),
    onSuccess: async (_, { id }) => {
      await queryClient.invalidateQueries({ queryKey: ["reports-insight-visits"] });
      await queryClient.invalidateQueries({ queryKey: ["crm", "question-set", id] });
      toast({ title: "Required from the next visit" });
    },
    onError: (failure) => toast({ title: "Not changed", description: getApiErrorMessage(failure), variant: "destructive" }),
  });

  const data = query.data;
  const shownForm = data?.form ?? null;
  const title = own ? (shownForm?.name ?? "Site visit form") : "Site visits";
  const actions = React.useMemo(
    () => (
      <Kit contents>
        {own ? (
          <ButtonLink href={`/crm/build/visits/${formId}`} icon="edit">
            Edit the form
          </ButtonLink>
        ) : (
          <ButtonLink href="/reports/crm-visit-forms" icon="reports">
            Open Site visit forms
          </ButtonLink>
        )}
      </Kit>
    ),
    [own, formId],
  );
  const chrome = own ? (
    <PageChrome title={title} backHref="/crm/build" backLabel="Build">
      {actions}
    </PageChrome>
  ) : (
    <PageChrome title={title}>{actions}</PageChrome>
  );

  const repName = rep ? (data?.reps.find((candidate) => candidate.id === rep)?.name ?? "One rep") : null;
  const tools = (
    <>
      <PeriodTools
        periods={periods}
        period={address.period}
        onPeriod={address.setPeriod}
        days={address.days}
        onDays={address.setDays}
        onClearDays={address.clearDays}
      />
      {!own && data && data.forms.length > 0 ? (
        <MenuButton
          className="chipsel is-set"
          icon="filter"
          label="Form"
          items={data.forms.map((candidate) => ({
            key: candidate.id,
            label: candidate.name,
            checked: candidate.id === shownForm?.id,
            onSelect: () => address.set({ form: candidate.id === data.forms[0]?.id ? null : candidate.id }),
          }))}
        >
          <span className="truncate">Form: {shownForm?.name ?? "none"}</span>
        </MenuButton>
      ) : null}
      {data && data.reps.length > 0 ? (
        <MenuButton
          className={rep ? "chipsel is-set" : "chipsel"}
          icon="person"
          label="Rep"
          items={[
            { key: "every", label: "Every rep", checked: !rep, onSelect: () => address.set({ rep: null }) },
            ...data.reps.map((candidate) => ({
              key: candidate.id,
              label: candidate.name,
              checked: candidate.id === rep,
              onSelect: () => address.set({ rep: candidate.id }),
            })),
          ]}
        >
          <span className="truncate">{repName ?? "Every rep"}</span>
        </MenuButton>
      ) : null}
      {!own && shownForm ? (
        <div className="end">
          <ButtonLink variant="quiet" icon="edit" href={`/crm/build/visits/${shownForm.id}/insights`}>
            Open the form
          </ButtonLink>
        </div>
      ) : null}
    </>
  );

  if (query.isPending) {
    return (
      <>
        {chrome}
        <InsightFrame>
          <InsightLoading />
        </InsightFrame>
      </>
    );
  }

  if (query.isError || !data) {
    return (
      <>
        {chrome}
        <InsightFrame>
          <InsightPage tools={tools}>
            <InsightError
              message={`${getApiErrorMessage(query.error, "Check the connection and try again.")} Site visits are for whoever can open the Site visit forms report; a manager can tell you who that is.`}
              onRetry={() => void query.refetch()}
            />
          </InsightPage>
        </InsightFrame>
      </>
    );
  }

  const insights = data.insights;
  const send = {
    words: "Site visit forms, the report under this page, as a PDF or a spreadsheet, on the days you choose.",
    href: "/reports/crm-visit-forms?send=1",
  };

  const cardFor = (card: VisitCard): InsightCard => {
    if (card.action === "form" && shownForm) {
      if (own && insights?.suggestion) {
        const suggestion = insights.suggestion;
        return data.canEdit
          ? {
              key: card.key,
              title: card.title,
              body: card.body,
              action: {
                label: `Make ${suggestion.label.toLowerCase()} required`,
                icon: "check",
                busy: require.isPending,
                onClick: () => require.mutate({ id: shownForm.id, key: suggestion.key }),
              },
            }
          : { key: card.key, title: card.title, body: `${card.body} A manager can change the form.`, action: { label: "Open the form", icon: "edit", href: `/crm/build/visits/${shownForm.id}` } };
      }
      return { key: card.key, title: card.title, body: card.body, action: { label: "Open the form", icon: "edit", href: `/crm/build/visits/${shownForm.id}/insights` } };
    }
    if (card.action === "answers") {
      return { key: card.key, title: card.title, body: card.body, action: { label: "See those visits", icon: "list", href: "/reports/crm-visit-answers" } };
    }
    return { key: card.key, title: card.title, body: card.body, action: { label: "Open the visits", icon: "visits", href: "/reports/crm-visit-forms" } };
  };

  if (!shownForm) {
    return (
      <>
        {chrome}
        <InsightFrame>
          <InsightPage tools={tools}>
            <Empty
              icon="visits"
              title="No site-visit forms yet"
              action={
                <ButtonLink href="/crm/build" icon="plus">
                  Make a form in Build
                </ButtonLink>
              }
            >
              Once reps fill in a form on site, this page shows where they stop answering and what the visits came to.
            </Empty>
          </InsightPage>
        </InsightFrame>
      </>
    );
  }

  if (!insights || insights.visits === 0) {
    return (
      <>
        {chrome}
        <InsightFrame>
          <InsightPage tools={tools} aside={<InsightAside cards={[]} send={send} />}>
            <Empty icon="calendar" title={days || rep ? "No visits in these dates" : "No visit has used this form yet"}>
              {days || rep
                ? "Widen the dates or choose every rep to read more visits."
                : "Once reps fill it in on site, what came of it shows here."}
            </Empty>
          </InsightPage>
        </InsightFrame>
      </>
    );
  }

  const breakdown = breakdownTable(insights);

  return (
    <>
      {chrome}
      <InsightFrame>
        <InsightPage
          tools={tools}
          finding={visitsFinding(insights)}
          figures={visitsFigures(insights, money)}
          aside={<InsightAside cards={visitsCards(insights).map(cardFor)} send={send} />}
        >
          <div className={query.isFetching ? "rp-grid2 is-fetching" : "rp-grid2"}>
            <div>
              <InsightBlock title="Where reps stop answering" sum="answered, of visits asked">
                <HBars rows={answerBars(insights)} empty="This form asks nothing yet." />
              </InsightBlock>
            </div>
            <div>
              <section className="ip-sec">
                {breakdown.title ? <h3>{breakdown.title}</h3> : null}
                <InsightTableView table={breakdown.table} />
              </section>
            </div>
          </div>
        </InsightPage>
      </InsightFrame>
    </>
  );
}
