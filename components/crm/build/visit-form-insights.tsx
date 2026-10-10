"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { formatMoney } from "@/components/crm/money/money";
import { PageChrome } from "@/components/layout/page-chrome";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { FormInsights } from "@/lib/crm/site-visits/insights";
import { Check, Lightning, Pencil } from "@/lib/icons";

import styles from "./visit-form-insights.module.css";

type Response = { name: string; insights: FormInsights; canEdit: boolean };

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const figure = (value: number) => value.toLocaleString("en-GB", { maximumFractionDigits: 2 });
const month = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

/**
 * A site-visit form, read back from its visits: what came of them, where
 * reps stop answering, and what each use of the floor measured and won.
 */
export function VisitFormInsights({ id }: { id: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = ["crm", "question-set-insights", id];
  const { data, isLoading, error } = useQuery({ queryKey, queryFn: () => fetchJson<Response>(`/api/v2/crm/question-sets/${id}/insights`) });

  const require = useMutation({
    mutationFn: (key: string) => fetchJson(`/api/v2/crm/question-sets/${id}/insights`, { method: "POST", body: JSON.stringify({ require: key }) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ["crm", "question-set", id] });
      toast({ title: "Required from the next visit" });
    },
    onError: (failure) => toast({ title: "Not changed", description: getApiErrorMessage(failure), variant: "destructive" }),
  });

  const chrome = (
    <PageChrome title={data?.name ?? "Site visit form"} backHref="/crm/build" backLabel="Build">
      <Button asChild variant="outline" size="sm">
        <Link href={`/crm/build/visits/${id}`}>
          <Pencil aria-hidden className="mr-1 h-4 w-4" />
          Edit the form
        </Link>
      </Button>
    </PageChrome>
  );

  if (error) return (<>{chrome}<p className={styles.empty}>{getApiErrorMessage(error)}</p></>);
  if (isLoading || !data) return (<>{chrome}<Skeleton className="h-96 w-full" /></>);

  const { insights } = data;
  if (insights.visits === 0) {
    return (
      <>
        {chrome}
        <p className={styles.empty}>No visit has used this form yet. Once reps fill it in on site, what came of it shows here.</p>
      </>
    );
  }

  const ranked = [...insights.questions].sort((a, b) => rate(a) - rate(b));
  const weakest = ranked.find((question) => question.asked > 0 && rate(question) < 1);

  return (
    <>
      {chrome}
      <div className={styles.page}>
        <p className={styles.lede}>
          {plural(insights.visits, "visit")} drafted {plural(insights.drafted, "quote")} and {plural(insights.won, "win")}
          {insights.since ? ` since ${month(insights.since)}` : ""}.
          <span>
            {weakest
              ? `“${weakest.label}” went unanswered on ${weakest.asked - weakest.answered - weakest.notApplicable} of ${plural(weakest.asked, "visit")}${weakest.feedsQuote ? ", and the quote counts on it" : ""}.`
              : "Every question is answered on every visit."}
          </span>
        </p>

        <div className={styles.columns}>
          <section aria-labelledby="answering">
            <div className={styles.head}>
              <h2 id="answering" className={styles.title}>Where reps stop answering</h2>
              <span className={styles.note}>Answered, of the visits it was asked on</span>
            </div>
            <div className={styles.bars}>
              {insights.questions.map((question) => {
                const share = rate(question);
                return (
                  <div key={question.key} className={styles.bar}>
                    <span>{question.label}</span>
                    <span className={styles.track} aria-hidden>
                      <span className={styles.fill} data-low={share < 0.75} style={{ width: `${Math.round(share * 100)}%`, display: "block" }} />
                    </span>
                    <span className={styles.num}>{question.asked ? `${Math.round(share * 100)}%` : "—"}</span>
                    <span className={styles.num} data-muted="true">{question.answered + question.notApplicable}</span>
                  </div>
                );
              })}
            </div>
            {insights.suggestion ? (
              <div className={styles.suggestion}>
                <Lightning aria-hidden width={18} height={18} />
                <span>
                  {insights.suggestion.label} decides what is quoted, and {plural(insights.suggestion.missing, "visit")} went without it. Requiring it holds the
                  visit until it is answered.
                </span>
                {data.canEdit ? (
                  <Button type="button" variant="outline" size="sm" disabled={require.isPending} onClick={() => require.mutate(insights.suggestion!.key)}>
                    <Check aria-hidden className="mr-1 h-4 w-4" />
                    Make {insights.suggestion.label.toLowerCase()} required
                  </Button>
                ) : null}
              </div>
            ) : null}
          </section>

          <div style={{ display: "grid", gap: 32 }}>
            {insights.breakdown && insights.breakdown.rows.length ? (
              <section aria-labelledby="breakdown">
                <div className={styles.head}>
                  <h2 id="breakdown" className={styles.title}>What is won</h2>
                  <span className={styles.note}>By {insights.breakdown.question.replace(/\?$/, "").toLowerCase()}</span>
                </div>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Answer</th>
                      <th className={styles.right}>Visits</th>
                      <th className={styles.right}>Won</th>
                      <th className={styles.right}>Measured, per visit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {insights.breakdown.rows.map((row) => (
                      <tr key={row.answer}>
                        <td>{row.answer}</td>
                        <td className={styles.right}>{row.visits}</td>
                        <td className={styles.right}>{row.won}</td>
                        <td className={styles.right}>
                          {row.measuredPerVisit === null ? "—" : `${figure(row.measuredPerVisit)} ${insights.breakdown!.unit}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ) : null}

            <section aria-labelledby="on-site">
              <div className={styles.head}>
                <h2 id="on-site" className={styles.title}>On site</h2>
              </div>
              <div className={styles.figures}>
                <div className={styles.figure}>
                  <span>Measured per visit</span>
                  <b>{insights.figures.measuredPerVisit === null ? "—" : `${figure(insights.figures.measuredPerVisit)} ${insights.figures.measureUnit}`}</b>
                </div>
                <div className={styles.figure}>
                  <span>Quote drafted, typical</span>
                  <b>{insights.figures.draftedPerVisit === null ? "—" : formatMoney(insights.figures.draftedPerVisit)}</b>
                </div>
                <div className={styles.figure}>
                  <span>Visits that drafted a quote</span>
                  <b>{insights.drafted} of {insights.visits}</b>
                </div>
                <div className={styles.figure}>
                  <span>Won</span>
                  <b>{insights.won} of {insights.visits}</b>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

function rate(question: FormInsights["questions"][number]): number {
  return question.asked ? (question.answered + question.notApplicable) / question.asked : 1;
}
