"use client";

import "./end-of-day-page.css";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { PageChrome, type PagePrimary } from "@/components/layout/page-chrome";
import { useHomeLink } from "@/components/layout/role-refusal";
import { LoadError, Refusal } from "@/components/list-frame/list-states";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/workspace/button";
import { MoneyInput } from "@/components/workspace/fields/money-input";
import { PhotoField } from "@/components/workspace/fields/photo-field";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { CheckItem, CloseDayResult, EndOfDayView, PaidTile, TillRow } from "@/lib/retail/floor/day-close";
import { formatMoney, formatSigned, formatTime } from "@/lib/workspace/format";

/**
 * End of day (50-floor W-43, FLR-07; board EndOfDay): one site's trading day.
 * The tills and what each took, how people paid, and in the aside what is
 * left before the day closes and the cash to bank. "Close the day" waits for
 * every drawer to be closed and signed off; once closed the page reads what
 * the close froze, with each till's Z-report.
 */

const money = (value: string | number) => formatMoney(Number(value));
/** The amount as typed, read as the server reads it: "1,000.00" is a thousand. */
const typedAmount = (value: string) => Number(value.replace(/,/g, "").trim() || 0);

/** "ZiG 4,288", with cents only when there are any. */
function tileAmount(tile: PaidTile): string {
  if (tile.currency !== "ZWG") return money(tile.amount);
  const text = formatMoney(Number(tile.amount), "ZWG");
  return Number.isInteger(Number(tile.amount)) ? text.replace(/\.00$/, "") : text;
}

/** "None", "−US$4.50", "+US$1.20", or "–" while a drawer is open. */
function differenceWords(row: TillRow): { text: string; tone: "warn" | null } {
  if (row.difference === null) return { text: "–", tone: null };
  const value = Number(row.difference);
  if (value === 0) return { text: "None", tone: null };
  return { text: formatSigned(value), tone: value < 0 ? "warn" : null };
}

function pathFor(siteId: string, date: string, today: string) {
  const params = new URLSearchParams();
  params.set("site", siteId);
  if (date !== today) params.set("date", date);
  return `/retail/end-of-day?${params.toString()}`;
}

export function EndOfDayPage() {
  const searchParams = useSearchParams();
  const site = searchParams.get("site");
  const date = searchParams.get("date");
  const home = useHomeLink();
  const query = useQuery({
    queryKey: ["retail-end-of-day", site, date],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (site) params.set("siteId", site);
      if (date) params.set("date", date);
      return (await fetchJson<{ data: EndOfDayView }>(`/api/v2/retail/end-of-day?${params.toString()}`)).data;
    },
    retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
  });

  if (query.isPending) return <PageChrome title="End of day" />;
  if (query.isError) {
    const error = query.error;
    const refused = error instanceof ApiError && error.status === 403;
    return (
      <>
        <PageChrome title="End of day" />
        {refused ? (
          <Refusal noun="the end of day" sentence={getApiErrorMessage(error).replace(/\.$/, "")} back={home} />
        ) : (
          <LoadError noun="day" message={getApiErrorMessage(error)} onRetry={() => void query.refetch()} />
        )}
      </>
    );
  }
  return <EndOfDay view={query.data} key={`${query.data.site.id}|${query.data.date}`} />;
}

function EndOfDay({ view }: { view: EndOfDayView }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [banked, setBanked] = React.useState(view.banked.default);
  const [slip, setSlip] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [problem, setProblem] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const closed = view.closed;
  const bank = view.banked.bank;
  const thingsLeft = view.thingsLeft;
  const thingsWords = `${thingsLeft} ${thingsLeft === 1 ? "thing" : "things"} before closing`;

  const close = React.useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    setErrors({});
    try {
      const { data } = await fetchJson<{ data: CloseDayResult }>(`/api/v2/retail/end-of-day/close`, {
        method: "POST",
        body: JSON.stringify({ siteId: view.site.id, date: view.date, banked: banked.trim() || "0", ...(slip ? { slipUrl: slip } : {}) }),
      });
      // The amount the close banked, as the server read it.
      const amount = Number(data.banked);
      toast({
        title: amount > 0 ? `${view.dateLabel} closed. ${money(amount)} banked to ${bank ?? "the bank"}.` : `${view.dateLabel} closed.`,
        variant: "success",
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["retail-end-of-day"] }),
        queryClient.invalidateQueries({ queryKey: ["list", "retail-days"] }),
      ]);
    } catch (error) {
      const fields = (error instanceof ApiError ? (error.details as { fieldErrors?: Record<string, string> } | null)?.fieldErrors : null) ?? {};
      if (Object.keys(fields).length) {
        setErrors(fields);
      } else {
        setProblem(getApiErrorMessage(error));
      }
    } finally {
      setBusy(false);
    }
  }, [bank, banked, busy, queryClient, slip, toast, view.dateLabel, view.date, view.site.id]);

  const primary: PagePrimary | null =
    closed || !view.can.close
      ? null
      : thingsLeft > 0
        ? { label: "Close the day", disabled: thingsWords }
        : { label: busy ? "Closing…" : "Close the day", onClick: () => void close() };

  const upload = async (file: File) => {
    const body = new FormData();
    body.set("file", file);
    const response = await fetch("/api/v2/retail/end-of-day/slip", { method: "POST", body });
    const answer = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
    if (!response.ok || !answer?.url) throw new Error(answer?.error ?? "The slip did not upload. Try again.");
    return answer.url;
  };

  // The banked check reads what is typed, until the day closes.
  const checklist: CheckItem[] = view.checklist.map((item) => {
    if (item.key !== "banked" || closed || !bank) return item;
    const amount = typedAmount(banked);
    return {
      ...item,
      detail: amount > 0 ? `${money(amount)} to ${bank}${slip ? ", slip photo." : ". No slip yet."}` : "Nothing to bank.",
    };
  });

  const strip = closed
    ? { text: `Closed at ${formatTime(closed.at)} by ${closed.by}`, tone: "plain" as const }
    : !view.traded
      ? null
      : thingsLeft > 0
        ? { text: thingsWords, tone: "warn" as const }
        : { text: "Ready to close", tone: "ok" as const };

  const reportFor = (row: TillRow) => closed?.zReports.find((report) => report.registerCode === row.registerCode) ?? null;

  return (
    <>
      <PageChrome
        title="End of day"
        reference={view.dateLabel}
        picker={{
          label: view.site.name,
          options: view.sites.map((entry) => ({ key: entry.id, label: entry.name, href: pathFor(entry.id, view.date, view.today) })),
        }}
        primary={primary}
      >
        <Button asChild>
          <Link href="/retail/end-of-day/days">Past days</Link>
        </Button>
      </PageChrome>
      <div className="cx-eod">
        <div className="cx-eod-strip">
          {strip ? <span className={`cx-eod-chip cx-eod-chip--${strip.tone}`}>{strip.text}</span> : <span />}
          <span className="cx-eod-takings">
            Takings <b className="cx-eod-mono">{money(view.takings)}</b>
          </span>
        </div>
        <div className="cx-eod-body">
          <div className="cx-eod-main">
            {problem ? (
              <p role="alert" className="cx-eod-problem">
                {problem}
              </p>
            ) : null}
            {view.traded ? (
              <TillsTable view={view} reportFor={reportFor} />
            ) : (
              <p className="cx-eod-empty">
                Nothing was sold at {view.site.name} on {view.dateLabel}.
              </p>
            )}
            {view.paid.length ? (
              <div className="cx-eod-tiles" aria-label="How people paid">
                {view.paid.map((tile) => (
                  <div key={tile.tender} className="cx-eod-tile">
                    <span className="cx-eod-tile__label">{tile.label}</span>
                    <span className="cx-eod-tile__amount cx-eod-mono">{tileAmount(tile)}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <aside className="cx-eod-aside" aria-label="Before the day closes">
            <h2>Before the day closes</h2>
            <ul className="cx-eod-checks">
              {checklist.map((item) => (
                <li key={item.key} className="cx-eod-check" data-done={item.done ? "true" : undefined}>
                  <span className="cx-eod-check__mark" aria-hidden="true">
                    {item.done ? "✓" : null}
                  </span>
                  <span className="cx-eod-check__text">
                    <span className="cx-eod-check__label">{item.label}</span>
                    <span className="cx-eod-check__detail">{item.detail}</span>
                  </span>
                  {item.action && !closed && view.can.close ? (
                    <Button asChild>
                      <Link href={item.action.href}>{item.action.label}</Link>
                    </Button>
                  ) : null}
                  <span className="cx-eod-sr">{item.done ? "Done." : item.blocking ? "Needed before closing." : "Not needed to close."}</span>
                </li>
              ))}
            </ul>

            {view.traded ? (
              closed ? (
                <dl className="cx-eod-read">
                  <div>
                    <dt>Banked</dt>
                    <dd className="cx-eod-mono">{money(closed.banked)}</dd>
                  </div>
                  <div>
                    <dt>Deposit slip</dt>
                    <dd>
                      {closed.slipUrl ? (
                        <a href={closed.slipUrl} target="_blank" rel="noopener">
                          Open the slip
                        </a>
                      ) : (
                        "No slip"
                      )}
                    </dd>
                  </div>
                </dl>
              ) : view.can.close ? (
                <>
                  <div className="cx-eod-field">
                    <label htmlFor="eod-banked">Banked</label>
                    <MoneyInput
                      id="eod-banked"
                      value={banked}
                      onValueChange={(value) => {
                        setBanked(value);
                        setErrors((current) => ({ ...current, banked: "" }));
                      }}
                      aria-invalid={Boolean(errors.banked)}
                      aria-describedby="eod-banked-hint"
                    />
                    {errors.banked ? <span className="cx-eod-error">{errors.banked}</span> : null}
                    <span id="eod-banked-hint" className="cx-eod-hint">
                      {view.banked.account ? `Into ${view.banked.account}. Add the deposit slip photo.` : "Add a bank account in Posting to the books first."}
                    </span>
                  </div>
                  <div className="cx-eod-field">
                    <label htmlFor="eod-slip">
                      Deposit slip <span className="cx-eod-optional">optional</span>
                    </label>
                    <PhotoField id="eod-slip" value={slip} onValueChange={setSlip} upload={upload} prompt="Add the slip photo" />
                    {errors.slip ? <span className="cx-eod-error">{errors.slip}</span> : null}
                  </div>
                </>
              ) : null
            ) : null}
          </aside>
        </div>
      </div>
    </>
  );
}

function TillsTable({ view, reportFor }: { view: EndOfDayView; reportFor: (row: TillRow) => { id: string } | null }) {
  const xReport = (row: TillRow) =>
    `/api/v2/retail/end-of-day/x-report?siteId=${view.site.id}&date=${view.date}&registerId=${row.registerId}`;
  const linkFor = (row: TillRow) => {
    if (row.state === "none") return null;
    if (row.state === "open") return row.openShiftId ? { label: "Count and close", href: `/retail/shifts/${row.openShiftId}/close`, external: false } : null;
    const report = reportFor(row);
    if (report) return { label: "Z-report", href: `/api/v2/retail/z-reports/${report.id}?format=pdf`, external: true };
    return { label: "Z-report", href: xReport(row), external: true };
  };
  const totalDiff = view.totals.difference === null ? null : Number(view.totals.difference);

  return (
    <div className="cx-eod-table" role="table" aria-label="The tills">
      <div className="cx-eod-row cx-eod-row--head" role="row">
        <span role="columnheader">Till</span>
        <span role="columnheader">Shift</span>
        <span role="columnheader" className="cx-eod-end">
          Takings
        </span>
        <span role="columnheader" className="cx-eod-end">
          Refunds
        </span>
        <span role="columnheader" className="cx-eod-end">
          Difference
        </span>
        <span role="columnheader" aria-label="Report" />
      </div>
      {view.tills.map((row) => {
        const difference = differenceWords(row);
        const link = linkFor(row);
        return (
          <div key={row.key} className="cx-eod-row" role="row">
            <span role="cell" className="cx-eod-till">
              <span className="cx-eod-till__name">{row.name}</span>
              {row.cashier ? <span className="cx-eod-till__who">{row.cashier}</span> : null}
            </span>
            <span role="cell" className={row.state === "open" ? "cx-eod-bad" : undefined}>
              {row.state === "open" ? "Still open" : row.closedAt ? `Closed ${formatTime(row.closedAt)}` : "—"}
            </span>
            <span role="cell" className="cx-eod-end cx-eod-mono" data-label="Takings">
              {money(row.takings)}
            </span>
            <span role="cell" className="cx-eod-end cx-eod-mono" data-label="Refunds">
              {money(row.refunds)}
            </span>
            <span role="cell" className={`cx-eod-end cx-eod-mono${difference.tone ? " cx-eod-warn" : ""}`} data-label="Difference">
              {difference.text}
            </span>
            <span role="cell" className="cx-eod-link">
              {link ? (
                link.external ? (
                  <a href={link.href} target="_blank" rel="noopener">
                    {link.label}
                  </a>
                ) : (
                  <Link href={link.href}>{link.label}</Link>
                )
              ) : null}
            </span>
          </div>
        );
      })}
      <div className="cx-eod-row cx-eod-row--sum" role="row">
        <span role="cell">
          Σ {view.totals.tills} {view.totals.tills === 1 ? "till" : "tills"}
        </span>
        <span role="cell" />
        <span role="cell" className="cx-eod-end cx-eod-mono" data-label="Takings">
          {money(view.totals.takings)}
        </span>
        <span role="cell" className="cx-eod-end cx-eod-mono" data-label="Refunds">
          {money(view.totals.refunds)}
        </span>
        {/* "–" while any till's difference is not known yet: open, or not counted. */}
        <span role="cell" className={`cx-eod-end cx-eod-mono${totalDiff !== null && totalDiff < 0 ? " cx-eod-warn" : ""}`} data-label="Difference">
          {totalDiff === null ? "–" : totalDiff === 0 ? "None" : formatSigned(totalDiff)}
        </span>
        <span role="cell" />
      </div>
    </div>
  );
}
