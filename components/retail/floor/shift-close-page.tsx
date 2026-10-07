"use client";

import "./shift-close-page.css";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { PageChrome, type PagePrimary } from "@/components/layout/page-chrome";
import { useHomeLink } from "@/components/layout/role-refusal";
import { LoadError, Refusal } from "@/components/list-frame/list-states";
import { Button } from "@/components/workspace/button";
import { ConfirmDialog } from "@/components/workspace/confirm-dialog";
import { MoneyInput } from "@/components/workspace/fields/money-input";
import { TextArea } from "@/components/workspace/fields/text-area";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { countDrawer, floatLeftProblem, needsExplaining, rowTotal, type CountCurrency, type CountRow } from "@/lib/retail/floor/count";
import type { CountForm } from "@/lib/retail/floor/shifts";
import type { Ask } from "@/lib/workspace/ask";
import { formatMoney, formatSigned, formatTime } from "@/lib/workspace/format";

/**
 * Count and close (50-floor W-39, FLR-04; board ShiftClose): the notes in
 * the drawer by currency, the summary against what should be there, what
 * happened, the tenders checked without counting, and what is left for
 * tomorrow and goes to the safe. The cashier counts blind: what should be
 * there and the difference read "Shows when you close" until the server
 * answers, and a 400 carrying the difference reveals them. Everything adds
 * up with `countDrawer`, the same arithmetic the server closes with.
 */

type Closed = NonNullable<CountForm["closed"]>;
type CloseAnswer = { data: { shiftNo: string; closedAt: string; difference: string; state: "BALANCED" | "SHORT" | "OVER" } };

const SHOWS_LATER = "Shows when you close";
/** `leaving` when the browser's Back asked, not a link. */
const BACK = "back";

const leaveAsk: Ask = {
  title: "Discard this count?",
  body: "What you typed is not saved.",
  keep: "Keep counting",
  go: "Discard",
  fill: "bad",
};

const STATE_OF: Record<CloseAnswer["data"]["state"], Closed["state"]> = { BALANCED: "Balanced", SHORT: "Short", OVER: "Over" };

const money = (value: string | number, currency: CountCurrency = "USD") => formatMoney(Number(value), currency);

function rowsOf(form: CountForm | undefined, currency: CountCurrency, counts: Record<string, string>): CountRow[] {
  const list = currency === "USD" ? form?.denominations.USD : form?.denominations.ZWG;
  return (list ?? []).map((denomination) => ({ denomination, count: Number(counts[`${currency}:${denomination}`] || 0) }));
}

/** "Closed at 14:10." and what it came to. */
function bannerWords(closed: Closed): { lead: string; text: string; tone: "ok" | "warn" } {
  const lead = `Closed at ${formatTime(closed.at)}.`;
  if (closed.state === "Not counted") return { lead, text: `Not counted${closed.note ? `: ${closed.note}` : ""}. A manager signs it off.`, tone: "warn" };
  if (closed.state === "Balanced") return { lead, text: "The drawer balanced.", tone: "ok" };
  return { lead, text: `Out by ${formatSigned(Number(closed.difference ?? 0))}. It is on the overview for a manager to sign off.`, tone: "warn" };
}

export function ShiftClosePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const home = useHomeLink();
  const query = useQuery({
    queryKey: ["retail-shift-close", id],
    enabled: Boolean(id),
    queryFn: async () => (await fetchJson<{ data: CountForm }>(`/api/v2/retail/shifts/${id}/close`)).data,
    retry: (count, error) => !(error instanceof ApiError && [403, 404].includes(error.status)) && count < 2,
  });

  if (query.isPending) return <PageChrome title="Count and close" backHref={`/retail/shifts/${id}`} backLabel="Shift" />;
  if (query.isError) {
    const error = query.error;
    const refused = error instanceof ApiError && (error.status === 403 || error.status === 404);
    return (
      <>
        <PageChrome title="Count and close" backHref={`/retail/shifts/${id}`} backLabel="Shift" />
        {refused ? (
          <Refusal noun="shifts" sentence={getApiErrorMessage(error).replace(/\.$/, "")} back={home} />
        ) : (
          <LoadError noun="shift" message={getApiErrorMessage(error)} onRetry={() => void query.refetch()} />
        )}
      </>
    );
  }
  return <CountAndClose form={query.data} />;
}

function CountAndClose({ form }: { form: CountForm }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [counts, setCounts] = React.useState<Record<string, string>>(() => {
    const lines = form.closed?.lines;
    if (!lines) return {};
    const typed: Record<string, string> = {};
    for (const currency of ["USD", "ZWG"] as const) for (const row of lines[currency]) typed[`${currency}:${row.denomination}`] = String(row.count);
    return typed;
  });
  const [floatLeft, setFloatLeft] = React.useState(form.floatLeft);
  const [editingFloat, setEditingFloat] = React.useState(false);
  const [note, setNote] = React.useState(form.closed?.note ?? "");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [problem, setProblem] = React.useState<string | null>(null);
  // A blind count's expected, worked back from the difference the server revealed.
  const [revealed, setRevealed] = React.useState<string | null>(null);
  const [closed, setClosed] = React.useState<Closed | null>(form.closed);
  const [busy, setBusy] = React.useState(false);
  const [leaving, setLeaving] = React.useState<string | null>(null);
  const noteRef = React.useRef<HTMLTextAreaElement>(null);

  const usd = rowsOf(form, "USD", counts);
  const zig = rowsOf(form, "ZWG", counts);
  const zigTyped = zig.some((row) => row.count > 0);
  const expected = form.expected ?? revealed;
  const floatTyped = /^\d+(\.\d{1,2})?$/.test(floatLeft.trim()) ? floatLeft.trim() : "0";
  const count = countDrawer({
    usd,
    zig: form.rate ? zig : [],
    rate: form.rate,
    expected: expected ?? "0",
    floatLeft: floatTyped,
  });
  // The float comes out of the US$ counted: more than that leaves nothing to say for To the safe.
  const floatProblem = closed ? null : floatLeftProblem(floatTyped, count.countedUsd);
  const difference = closed ? closed.difference : expected === null ? null : count.difference;
  const typedAny = Object.values(counts).some((value) => Number(value) > 0);
  const dirty = !closed && typedAny;
  const readOnly = Boolean(closed);

  // Leaving with counts typed asks first: a link in the app, the browser's Back, or the tab itself.
  // Back is held by an extra history entry for this page while the count is dirty; Discard then goes back past it.
  const discardingBack = React.useRef(false);
  React.useEffect(() => {
    if (!dirty) return;
    if (!(window.history.state as { cxCount?: boolean } | null)?.cxCount) {
      window.history.pushState({ ...(window.history.state ?? {}), cxCount: true }, "", window.location.href);
    }
    const onPop = () => {
      if (discardingBack.current) return;
      window.history.pushState({ ...(window.history.state ?? {}), cxCount: true }, "", window.location.href);
      setLeaving(BACK);
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      event.preventDefault();
      event.stopPropagation();
      setLeaving(`${url.pathname}${url.search}${url.hash}`);
    };
    const onUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("popstate", onPop);
    };
  }, [dirty]);

  const setCount = (key: string, value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 6);
    setCounts((current) => ({ ...current, [key]: digits }));
    setProblem(null);
    setErrors((current) => {
      const next = { ...current };
      delete next[key.replace(/^USD:/, "usd.").replace(/^ZWG:/, "zwg.")];
      delete next.usd;
      delete next.zwg;
      return next;
    });
  };

  const close = async () => {
    if (busy || closed) return;
    // Out by more than US$1.00, where the difference shows: say what happened first.
    if (floatProblem) {
      setErrors((current) => ({ ...current, floatLeft: floatProblem }));
      setEditingFloat(true);
      return;
    }
    if (difference !== null && needsExplaining(difference) && !note.trim()) {
      setErrors((current) => ({ ...current, note: "Say what happened." }));
      noteRef.current?.focus();
      return;
    }
    setBusy(true);
    setProblem(null);
    setErrors({});
    try {
      const answer = await fetchJson<CloseAnswer>(`/api/v2/retail/shifts/${form.shiftId}/close`, {
        method: "POST",
        body: JSON.stringify({
          counts: { USD: usd, ...(form.denominations.ZWG ? { ZWG: zig } : {}) },
          floatLeft: floatLeft.trim(),
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      });
      setClosed({
        at: answer.data.closedAt,
        counted: count.counted,
        difference: answer.data.difference,
        state: STATE_OF[answer.data.state],
        note: note.trim() || null,
        lines: { USD: usd, ZWG: zig },
      });
      void Promise.all(
        [["retail-shift", form.shiftId], ["retail-shift-close", form.shiftId], ["record-activity"], ["retail-shifts"], ["reports"], ["nav-badges"]].map(
          (queryKey) => queryClient.invalidateQueries({ queryKey }),
        ),
      );
    } catch (error) {
      const details = (error instanceof ApiError ? error.details : null) as { difference?: string; fieldErrors?: Record<string, string> } | null;
      // The blind count's answer: the summary shows, and What happened asks. A manager's summary was
      // read when the page loaded; a sale since moved what should be there, so it is read again.
      if (details?.difference !== undefined) {
        if (form.blind) setRevealed((Number(count.counted) - Number(details.difference)).toFixed(2));
        else void queryClient.invalidateQueries({ queryKey: ["retail-shift-close", form.shiftId] });
      }
      const fields = details?.fieldErrors ?? {};
      setErrors(fields);
      if (fields.note) requestAnimationFrame(() => noteRef.current?.focus());
      if (fields.floatLeft) setEditingFloat(true);
      // A field's own error says it under the field; anything else says it above the tables.
      setProblem(fields.floatLeft && details?.difference === undefined ? null : getApiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const primary: PagePrimary = closed
    ? { label: "Back to the shift", href: `/retail/shifts/${form.shiftId}` }
    : { label: "Close the shift", onClick: () => void close() };

  const banner = closed ? bannerWords(closed) : null;
  // Said under the float once notes are typed (before, every float is more than nothing counted), or after a refused close.
  const floatError = errors.floatLeft || (typedAny ? floatProblem : null);
  const diffTone = difference === null ? null : Number(difference) === 0 ? "ok" : Number(difference) < 0 ? "bad" : "warn";
  const moves = form.parts?.moves ?? null;
  const countedLabel = form.rate ? `Counted, ZiG at ${form.rate}` : "Counted";

  return (
    <>
      <PageChrome
        title="Count and close"
        backHref={`/retail/shifts/${form.shiftId}`}
        backLabel={form.shiftNo}
        reference={form.sub}
        primary={primary}
      >
        {closed || form.blind ? null : (
          <Button asChild>
            <a href={`/api/v2/retail/records/RetailShift/${form.shiftId}/pdf?as=x-report`} target="_blank" rel="noopener">
              Print X-report
            </a>
          </Button>
        )}
      </PageChrome>
      <div className="cx-sc">
        <div className="cx-sc-main">
          {banner ? (
            <p role="status" className={`cx-sc-banner cx-sc-banner--${banner.tone}`}>
              <b>{banner.lead}</b> {banner.text}
            </p>
          ) : null}
          <p className="cx-sc-line">
            Count the notes in the drawer. The cashier counts without seeing what is expected; the difference shows once both sides are in.
          </p>
          {problem ? (
            <p role="alert" className="cx-sc-problem">
              {problem}
            </p>
          ) : null}
          <div className="cx-sc-tables">
            <NoteTable currency="USD" rows={usd} counts={counts} errors={errors} readOnly={readOnly} onChange={setCount} />
            {form.denominations.ZWG ? (
              <NoteTable currency="ZWG" rows={zig} counts={counts} errors={errors} readOnly={readOnly} onChange={setCount} />
            ) : null}
          </div>
          {zigTyped && !form.rate && !closed ? <p className="cx-sc-hint">There is no ZiG rate yet, so the ZiG notes are not added in. Set it in Payments.</p> : null}
        </div>

        <aside className="cx-sc-aside" aria-label="The drawer">
          <dl className="cx-sc-summary">
            {form.parts ? (
              <>
                <div className="cx-sc-row">
                  <dt>Opening float</dt>
                  <dd className="cx-sc-mono">{money(form.parts.openingFloat)}</dd>
                </div>
                <div className="cx-sc-row">
                  <dt>Cash sales</dt>
                  <dd className="cx-sc-mono">{money(form.parts.cashSales)}</dd>
                </div>
                {moves ? (
                  <div className="cx-sc-row">
                    <dt>{moves.label}</dt>
                    <dd className="cx-sc-mono">{money(moves.amount)}</dd>
                  </div>
                ) : null}
              </>
            ) : null}
            <div className="cx-sc-row">
              <dt>Should be there</dt>
              {expected === null ? <dd className="cx-sc-later">{SHOWS_LATER}</dd> : <dd className="cx-sc-mono cx-sc-strong">{money(expected)}</dd>}
            </div>
            <div className="cx-sc-row">
              <dt>{countedLabel}</dt>
              {closed && closed.counted === null ? (
                <dd className="cx-sc-later">Not counted</dd>
              ) : (
                <dd className="cx-sc-mono cx-sc-strong">{money(closed?.counted ?? count.counted)}</dd>
              )}
            </div>
            <div className={`cx-sc-row cx-sc-diff${diffTone ? ` cx-sc-diff--${diffTone}` : ""}`}>
              <dt>Difference</dt>
              {closed && closed.state === "Not counted" ? (
                <dd className="cx-sc-later">Not counted</dd>
              ) : difference === null ? (
                <dd className="cx-sc-later">{SHOWS_LATER}</dd>
              ) : (
                <dd className="cx-sc-diff__value">{Number(difference) === 0 ? "None" : formatSigned(Number(difference))}</dd>
              )}
            </div>
          </dl>

          <div className="cx-sc-field">
            <label htmlFor="cx-sc-note">What happened</label>
            <TextArea
              ref={noteRef}
              id="cx-sc-note"
              rows={3}
              maxLength={500}
              readOnly={readOnly}
              aria-invalid={errors.note ? true : undefined}
              aria-describedby="cx-sc-note-hint"
              placeholder={difference !== null && Number(difference) !== 0 ? "For example: gave change for US$20 instead of US$10" : "Nothing to explain"}
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                if (errors.note) setErrors((current) => ({ ...current, note: "" }));
              }}
            />
            {errors.note ? (
              <span id="cx-sc-note-hint" className="cx-error">
                {errors.note}
              </span>
            ) : (
              <span id="cx-sc-note-hint" className="cx-sc-hint">
                Needed when it is out by more than US$1.00. A manager signs it off.
              </span>
            )}
          </div>

          {form.checked.length ? (
            <section className="cx-sc-group">
              <h2>Not counted, checked</h2>
              {form.checked.map((line) => (
                <div key={line.label} className="cx-sc-check">
                  <span>{line.label}</span>
                  <span className="cx-sc-check__end">
                    <span className="cx-sc-mono">{money(line.amount)}</span>
                    <span className={`cx-sc-mono ${line.ok ? "cx-sc-ok" : "cx-sc-warn cx-sc-check__own"}`}>{line.note}</span>
                  </span>
                </div>
              ))}
            </section>
          ) : null}

          <section className="cx-sc-group">
            <h2>After closing</h2>
            <div className="cx-sc-line-row">
              <span>Float left for tomorrow</span>
              {editingFloat && !readOnly ? (
                <MoneyInput
                  aria-label="Float left for tomorrow"
                  className="cx-sc-float"
                  value={floatLeft}
                  autoFocus
                  aria-invalid={floatError ? true : undefined}
                  aria-describedby={floatError ? "cx-sc-float-error" : undefined}
                  onValueChange={(value) => {
                    setFloatLeft(value);
                    if (errors.floatLeft) setErrors((current) => ({ ...current, floatLeft: "" }));
                  }}
                />
              ) : (
                <button
                  type="button"
                  className={`cx-sc-mono cx-sc-float-button${floatError ? " cx-sc-float-button--bad" : ""}`}
                  disabled={readOnly}
                  aria-describedby={floatError ? "cx-sc-float-error" : undefined}
                  onClick={() => setEditingFloat(true)}
                >
                  {money(floatLeft || "0")}
                </button>
              )}
            </div>
            {floatError ? (
              <span id="cx-sc-float-error" className="cx-error">
                {floatError}
              </span>
            ) : null}
            <div className="cx-sc-line-row">
              <span>To the safe</span>
              <span className="cx-sc-mono cx-sc-strong">
                {closed ? (closed.counted === null ? "—" : money(Number(closed.counted) - Number(floatLeft || 0))) : floatProblem ? "—" : money(count.toSafe)}
              </span>
            </div>
          </section>
        </aside>
      </div>
      {leaving ? (
        <ConfirmDialog
          ask={leaveAsk}
          open
          onOpenChange={(open) => {
            if (!open) setLeaving(null);
          }}
          onConfirm={() => {
            const to = leaving;
            setCounts({});
            setLeaving(null);
            if (to === BACK) {
              // Past this page's extra entry and the page itself, to wherever Back was going.
              discardingBack.current = true;
              window.history.go(-2);
            } else router.push(to);
          }}
        />
      ) : null}
    </>
  );
}

function NoteTable({
  currency,
  rows,
  counts,
  errors,
  readOnly,
  onChange,
}: {
  currency: CountCurrency;
  rows: CountRow[];
  counts: Record<string, string>;
  errors: Record<string, string>;
  readOnly: boolean;
  onChange: (key: string, value: string) => void;
}) {
  const name = currency === "USD" ? "US$" : "ZiG";
  const fieldKey = currency === "USD" ? "usd" : "zwg";
  return (
    <table className="cx-sc-table">
      <thead>
        <tr>
          <th scope="col">{name} note</th>
          <th scope="col" className="cx-sc-end">
            How many
          </th>
          <th scope="col" className="cx-sc-end">
            Comes to
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const key = `${currency}:${row.denomination}`;
          const error = errors[`${fieldKey}.${row.denomination}`];
          return (
            <tr key={key}>
              <th scope="row" className="cx-sc-mono">
                {row.denomination}
              </th>
              <td className="cx-sc-end">
                <input
                  className="cx-sc-count"
                  inputMode="numeric"
                  aria-label={`${name}${row.denomination} notes`}
                  aria-invalid={error ? true : undefined}
                  title={error || undefined}
                  placeholder="0"
                  readOnly={readOnly}
                  value={counts[key] ?? ""}
                  onChange={(event) => onChange(key, event.target.value)}
                />
              </td>
              <td className="cx-sc-end cx-sc-mono">{money(rowTotal(row), currency)}</td>
            </tr>
          );
        })}
      </tbody>
      {errors[fieldKey] ? (
        <tfoot>
          <tr>
            <td colSpan={3} className="cx-error">
              {errors[fieldKey]}
            </td>
          </tr>
        </tfoot>
      ) : null}
    </table>
  );
}
