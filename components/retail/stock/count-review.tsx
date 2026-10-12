"use client";

import "./count-review.css";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/workspace/button";
import { ConfirmDialog } from "@/components/workspace/confirm-dialog";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/workspace/menu";
import { StateBadge } from "@/components/workspace/state-badge";
import { Tabs } from "@/components/workspace/tabs";
import { useHydrated } from "@/hooks/use-hydrated";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Pencil } from "@/lib/icons";
import { cancelCountAsk } from "@/lib/retail/asks/stock";
import { countKind } from "@/lib/retail/record-kinds";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";
import { approvedWords, COUNT_WHY_WORDS, countedSentence, historyDay, recountToast, whyOf } from "@/lib/retail/stock/count-words";
import type { CountLine } from "@/lib/retail/stock/counts";
import type { CountWhy } from "@/lib/retail/stock/movement-words";
import { formatCount, formatSigned, formatSignedCount } from "@/lib/workspace/format";

/**
 * Approve the differences (30-stock W-22 steps 3–4, STK-06; board
 * CountReview): a count waiting for approval, its lines in Differ, Match and
 * All. An approver corrects a figure (saved on blur), says why a line
 * differs, ticks lines to send back, then approves: on hand becomes what was
 * counted and the net posts to Breakage and losses. A count that is not
 * waiting for approval goes to its record.
 */

type Tab = "differ" | "match" | "all";
type Said = { tone: "ok" | "bad"; lead: string | null; text: string };

const WHYS: CountWhy[] = ["BROKEN", "NOT_KNOWN", "FOUND"];
const COUNTED = /^\d+(\.\d{1,4})?$/;

/** A line at cost to the cent, as the server values it. */
const valueOf = (line: CountLine) =>
  line.difference === null || line.difference === undefined || line.unitCost === undefined
    ? 0
    : Math.round(line.difference * line.unitCost * 100) / 100;
const differs = (line: CountLine) => typeof line.difference === "number" && line.difference !== 0;
const linesWord = (n: number) => `${formatCount(n)} ${n === 1 ? "line" : "lines"}`;

export function CountReview({ countId }: { countId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const hydrated = useHydrated();
  const { data: session, status: sessionStatus } = useSession();
  const user = session?.user as { role?: string; supportSessionId?: string | null } | undefined;
  const can = (resource: "retail.counts", action: "approve" | "delete") =>
    Boolean(user) && canRetailSessionDo({ user: { role: user?.role, supportSessionId: user?.supportSessionId } }, resource, action);
  const mayApprove = can("retail.counts", "approve");

  const view = useQuery({
    queryKey: countKind.queryKey(countId),
    queryFn: () => countKind.load(countId),
    enabled: Boolean(countId) && mayApprove,
  });
  const linesQuery = useQuery({
    queryKey: ["retail-stock-count-lines", countId],
    queryFn: () => fetchJson<{ lines: CountLine[] }>(`/api/v2/retail/stock/counts/${countId}/lines?tab=all`),
    enabled: Boolean(countId) && mayApprove,
  });

  const [tab, setTab] = React.useState<Tab>("differ");
  const [lines, setLines] = React.useState<CountLine[] | null>(null);
  const [typed, setTyped] = React.useState<Record<string, string>>({});
  const [badLine, setBadLine] = React.useState<string | null>(null);
  const [ticked, setTicked] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState<"approve" | "recount" | null>(null);
  const [said, setSaid] = React.useState<Said | null>(null);
  const [approved, setApproved] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  // Figures on their way to the server, by line: approving waits for them.
  const saving = React.useRef(new Map<string, { text: string; done: Promise<boolean> }>());
  // Set before the approval is sent: a refetch that already sees it approved
  // must not take the page to the record before the "Approved." line shows.
  const approving = React.useRef(false);

  React.useEffect(() => {
    if (linesQuery.data) setLines(linesQuery.data.lines);
  }, [linesQuery.data]);

  const count = view.data;
  // Only a count waiting for approval is reviewed here; any other opens its
  // record. Not the one approved from this page: it stays to say so.
  React.useEffect(() => {
    if (count && count.status !== "TO_APPROVE" && !approved && !approving.current) router.replace(`/retail/stock/counts/${count.id}`);
  }, [count, approved, router]);

  const refresh = React.useCallback(async () => {
    await Promise.all(
      [countKind.queryKey(countId), ["record-activity"], ["reports"], ...(countKind.invalidates ?? [])].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
  }, [queryClient, countId]);

  const back = { backHref: "/retail/stock/counts", backLabel: "Counts" };

  if (!hydrated || sessionStatus === "loading") return <PageChrome title="Approve the differences" {...back} />;
  if (!mayApprove) {
    return (
      <>
        <PageChrome title="Approve the differences" {...back} />
        <div className="cx-cr-state" role="status">
          <h2>Your role cannot approve stock counts.</h2>
          <p>An owner or a manager approves them. The count itself is in Counts.</p>
        </div>
      </>
    );
  }
  if (view.isError || linesQuery.isError) {
    const missing = view.error instanceof ApiError && view.error.status === 404;
    return (
      <>
        <PageChrome title="Approve the differences" {...back} />
        <div className="cx-cr-state" role="alert">
          <h2>{missing ? "There is nothing at this address" : "This would not load"}</h2>
          <p>{missing ? "It may have been removed. Counts lists everything that is here." : getApiErrorMessage(view.error ?? linesQuery.error)}</p>
        </div>
      </>
    );
  }
  if (!count || !lines) {
    return (
      <>
        <PageChrome title="Approve the differences" {...back} />
        <div className="cx-cr" aria-busy="true">
          <span className="cx-cr-sr" role="status">
            Loading
          </span>
        </div>
      </>
    );
  }

  const readOnly = approved || count.status !== "TO_APPROVE";
  const seeCost = count.difference !== undefined;
  const differing = lines.filter(differs);
  const matching = lines.filter((line) => !differs(line));
  // Differ lists the differing lines, then the matching ones faded (the board).
  const shown = tab === "differ" ? [...differing, ...matching] : tab === "match" ? matching : lines;
  const net = Math.round(differing.reduce((sum, line) => sum + valueOf(line), 0) * 100) / 100;
  const recountIds = [...ticked].filter((id) => differing.some((line) => line.id === id));
  const recountN = recountIds.length > 0 ? recountIds.length : differing.length;
  const firstName = count.counter.name.split(" ")[0] ?? count.counter.name;
  const lastThree = [...count.history].reverse().slice(0, 3);
  const now = new Date();

  /** Saves a typed figure; true when there was nothing to save or it saved. The same figure already on its way is not sent twice. */
  const save = (line: CountLine): Promise<boolean> => {
    const text = typed[line.id]?.trim();
    if (text === undefined || text === (line.counted ?? "")) return Promise.resolve(true);
    const inFlight = saving.current.get(line.id);
    if (inFlight?.text === text) return inFlight.done;
    if (!COUNTED.test(text)) {
      setBadLine(line.id);
      toast({ title: "Type how many are there.", variant: "destructive" });
      return Promise.resolve(false);
    }
    const entry = { text, done: Promise.resolve(true) };
    entry.done = (async () => {
      await inFlight?.done;
      try {
        const answer = await fetchJson<{ line: CountLine }>(`/api/v2/retail/stock/counts/${countId}/lines/${line.id}`, {
          method: "PUT",
          body: JSON.stringify({ counted: text }),
        });
        setBadLine(null);
        setLines((current) => current?.map((row) => (row.id === line.id ? answer.line : row)) ?? null);
        setTyped((current) => {
          if (current[line.id]?.trim() !== text) return current;
          const next = { ...current };
          delete next[line.id];
          return next;
        });
        void refresh();
        return true;
      } catch (error) {
        setBadLine(line.id);
        toast({ title: getApiErrorMessage(error), variant: "destructive" });
        return false;
      } finally {
        if (saving.current.get(line.id) === entry) saving.current.delete(line.id);
      }
    })();
    saving.current.set(line.id, entry);
    return entry.done;
  };

  const setWhy = async (line: CountLine, why: CountWhy) => {
    const before = line.why;
    setLines((current) => current?.map((row) => (row.id === line.id ? { ...row, why } : row)) ?? null);
    try {
      await fetchJson(`/api/v2/retail/stock/counts/${countId}/lines/${line.id}`, { method: "PATCH", body: JSON.stringify({ why }) });
    } catch (error) {
      setLines((current) => current?.map((row) => (row.id === line.id ? { ...row, why: before } : row)) ?? null);
      toast({ title: getApiErrorMessage(error), variant: "destructive" });
    }
  };

  const tick = (id: string, on: boolean) =>
    setTicked((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const approve = async () => {
    approving.current = true;
    setBusy("approve");
    setSaid(null);
    // A figure typed and not yet saved goes first, and every save on its way
    // lands, before the approval reads the lines; one refused stops it here.
    const saved = await Promise.all([...lines.map(save), ...[...saving.current.values()].map((entry) => entry.done)]);
    if (!saved.every(Boolean)) {
      approving.current = false;
      setBusy(null);
      return;
    }
    try {
      const answer = await fetchJson<{ data: { differenceValue: number } }>(`/api/v2/retail/stock/counts/${countId}/approve`, { method: "POST" });
      const value = answer.data.differenceValue;
      setApproved(true);
      setSaid({ tone: "ok", lead: "Approved.", text: approvedWords(value === 0 || !seeCost ? null : formatSigned(value)) });
      await refresh();
    } catch (error) {
      approving.current = false;
      setSaid({ tone: "bad", lead: null, text: getApiErrorMessage(error) });
    } finally {
      setBusy(null);
    }
  };

  const recount = async () => {
    setBusy("recount");
    try {
      const answer = await fetchJson<{ lines: number; counter: string }>(`/api/v2/retail/stock/counts/${countId}/recount`, {
        method: "POST",
        body: JSON.stringify(recountIds.length > 0 ? { lineIds: recountIds } : {}),
      });
      toast({ title: recountToast(answer.lines, answer.counter), variant: "success" });
      await refresh();
      router.push(`/retail/stock/counts/${countId}`);
    } catch (error) {
      toast({ title: getApiErrorMessage(error), variant: "destructive" });
      setBusy(null);
    }
  };

  const cancel = async () => {
    try {
      await fetchJson(`/api/v2/retail/stock/counts/${countId}/cancel`, { method: "POST" });
    } catch (error) {
      throw new Error(getApiErrorMessage(error));
    }
    toast({ title: `${count.countNo} cancelled. Nothing on hand changed.`, variant: "success" });
    await refresh();
    router.push(`/retail/stock/counts/${countId}`);
  };

  const whyButton = (line: CountLine) => {
    const why = whyOf((line.why as CountWhy | null) ?? null, line.difference ?? 0);
    if (readOnly) return <span>{COUNT_WHY_WORDS[why]}</span>;
    return (
      <Menu>
        <MenuTrigger asChild>
          <button type="button" className="cx-cr-why" aria-label={`Why ${line.product} differs: ${COUNT_WHY_WORDS[why]}`}>
            {COUNT_WHY_WORDS[why]}
            <Pencil className="cx-cr-why__pen" aria-hidden="true" />
          </button>
        </MenuTrigger>
        <MenuContent align="start">
          {WHYS.map((option) => (
            <MenuItem key={option} onSelect={() => void setWhy(line, option)}>
              {COUNT_WHY_WORDS[option]}
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>
    );
  };

  const recountBox = (line: CountLine) =>
    readOnly ? null : (
      <input
        type="checkbox"
        className="cx-cr-tick"
        aria-label={`Recount ${line.product}`}
        checked={ticked.has(line.id)}
        onChange={(event) => tick(line.id, event.target.checked)}
      />
    );

  return (
    <>
      <PageChrome title={count.countNo} reference={count.name} {...back}>
        {readOnly ? null : (
          <>
            {differing.length > 0 ? (
              <Button variant="secondary" busy={busy === "recount"} disabled={busy !== null} onClick={() => void recount()}>
                Recount the {formatCount(recountN)}
              </Button>
            ) : null}
            <Button variant="primary" busy={busy === "approve"} disabled={busy !== null} onClick={() => void approve()}>
              Approve and adjust
            </Button>
          </>
        )}
      </PageChrome>

      <div className="cx-cr">
        <div className="cx-cr-strip">
          <StateBadge tone={readOnly ? "hollow" : "warn"}>{readOnly ? "Approved" : "To approve"}</StateBadge>
          <span className="cx-cr-strip__text">
            {countedSentence(
              { blind: count.blind, counter: count.counter.name, from: count.firstCountedAt, to: count.submittedAt, keepSelling: count.keepSelling },
              now,
            )}
          </span>
          <span className="cx-cr-strip__figure">
            {seeCost ? (
              <>
                Difference{" "}
                <b className={`cx-cr-mono cx-cr-${net < 0 ? "bad" : net > 0 ? "ok" : "plain"}`}>{formatSigned(net)}</b>
              </>
            ) : (
              <>
                Differ <b className="cx-cr-mono">{formatCount(differing.length)}</b>
              </>
            )}
          </span>
        </div>

        {said ? (
          <p role={said.tone === "bad" ? "alert" : "status"} className={`cx-cr-said cx-cr-said--${said.tone}`}>
            {said.lead ? <b>{said.lead}</b> : null} {said.text}
          </p>
        ) : null}

        <div className="cx-cr-body">
          <div className="cx-cr-main">
            <Tabs
              items={[
                { value: "differ", label: "Differ", count: formatCount(differing.length) },
                { value: "match", label: "Match", count: formatCount(matching.length) },
                { value: "all", label: "All", count: formatCount(lines.length) },
              ]}
              value={tab}
              onValueChange={(next) => setTab(next as Tab)}
              aria-label="Lines"
            />
            <div role="table" aria-label="Lines" className={`cx-cr-table${seeCost ? "" : " cx-cr-table--nocost"}`}>
              <div role="row" className="cx-cr-g cx-cr-head">
                <div role="columnheader">Product</div>
                <div role="columnheader" className="cx-cr-end cx-cr-wide">
                  Expected
                </div>
                <div role="columnheader" className="cx-cr-end">
                  Counted
                </div>
                <div role="columnheader" className="cx-cr-end">
                  Difference
                </div>
                {seeCost ? (
                  <div role="columnheader" className="cx-cr-end cx-cr-wide">
                    At cost
                  </div>
                ) : null}
                <div role="columnheader" className="cx-cr-wide cx-cr-whycol">
                  Why
                </div>
                <div role="columnheader" className="cx-cr-wide">
                  Recount
                </div>
              </div>
              {tab === "differ" && differing.length === 0 ? <p className="cx-cr-empty">Every line is as expected.</p> : null}
              {tab === "match" && matching.length === 0 ? <p className="cx-cr-empty">Every line differs.</p> : null}
              {shown.map((line) => {
                const diff = differs(line);
                const value = valueOf(line);
                const expected = line.expectedAtCount ?? line.expected;
                return (
                  <div key={line.id} role="row" className={`cx-cr-g cx-cr-row${diff ? "" : " cx-cr-row--match"}`}>
                    <div role="cell" className="cx-cr-product">
                      <span className="cx-cr-product__name">{line.product}</span>
                      <span className="cx-cr-product__more">
                        <span className="cx-cr-mono">Expected {expected ?? "—"}</span>
                        {diff && seeCost ? <span className={`cx-cr-mono cx-cr-${value < 0 ? "bad" : "ok"}`}>{formatSigned(value)}</span> : null}
                        {diff ? whyButton(line) : null}
                        {diff ? recountBox(line) : null}
                      </span>
                    </div>
                    <div role="cell" className="cx-cr-end cx-cr-mono cx-cr-wide cx-cr-muted">
                      {expected ?? "—"}
                    </div>
                    <div role="cell" className="cx-cr-end">
                      {readOnly ? (
                        <span className="cx-cr-mono cx-cr-strong">{line.counted ?? "—"}</span>
                      ) : (
                        <input
                          className="cx-cr-count"
                          inputMode="decimal"
                          aria-label={`Counted ${line.product}`}
                          aria-invalid={badLine === line.id ? true : undefined}
                          value={typed[line.id] ?? line.counted ?? ""}
                          onChange={(event) => setTyped((current) => ({ ...current, [line.id]: event.target.value }))}
                          onBlur={() => void save(line)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                          }}
                        />
                      )}
                    </div>
                    <div role="cell" className={`cx-cr-end cx-cr-mono cx-cr-strong ${diff ? `cx-cr-${(line.difference ?? 0) < 0 ? "bad" : "ok"}` : "cx-cr-faint"}`}>
                      {diff ? formatSignedCount(line.difference ?? 0) : "–"}
                    </div>
                    {seeCost ? (
                      <div role="cell" className={`cx-cr-end cx-cr-mono cx-cr-wide ${diff ? `cx-cr-${value < 0 ? "bad" : "ok"}` : "cx-cr-faint"}`}>
                        {diff ? formatSigned(value) : "–"}
                      </div>
                    ) : null}
                    <div role="cell" className="cx-cr-wide cx-cr-whycol">
                      {diff ? whyButton(line) : null}
                    </div>
                    <div role="cell" className="cx-cr-wide">
                      {diff ? recountBox(line) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <aside className="cx-cr-aside" aria-label="When you approve">
            <section className="cx-cr-group">
              <h2>{readOnly ? "Approved" : "When you approve"}</h2>
              <p>Stock on hand becomes what was counted for all {linesWord(lines.length)}.</p>
              <p>
                {seeCost && net !== 0 ? (
                  <>
                    The difference, <span className="cx-cr-mono">{formatSigned(net)}</span>, is posted to Breakage and losses and shows in
                    Insights › Losses.
                  </>
                ) : (
                  "The difference is posted to Breakage and losses and shows in Insights › Losses."
                )}
              </p>
              {readOnly ? null : <p>Ticked lines are sent back to {firstName} to count again first.</p>}
              {!readOnly && can("retail.counts", "delete") ? (
                <div className="cx-cr-cancel">
                  <button type="button" className="cx-cr-cancel__link" onClick={() => setCancelling(true)}>
                    Cancel the count
                  </button>
                  <span>Nothing on hand changes.</span>
                </div>
              ) : null}
            </section>
            {seeCost && lastThree.length > 0 ? (
              <section className="cx-cr-group">
                <h2>
                  {count.scopeLabel}, last {lastThree.length === 1 ? "count" : `${["", "", "two", "three"][lastThree.length]} counts`}
                </h2>
                <dl className="cx-cr-history">
                  {lastThree.map((point) => (
                    <div key={point.id} className="cx-cr-history__row">
                      <dt>{historyDay(point.at, now)}</dt>
                      <dd className="cx-cr-mono">{formatSigned(point.id === count.id && !readOnly ? net : point.difference)}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}
          </aside>
        </div>
      </div>

      {cancelling ? (
        <ConfirmDialog
          ask={cancelCountAsk({ countNo: count.countNo, counter: count.counter.name })}
          open
          onOpenChange={(open) => !open && setCancelling(false)}
          onConfirm={cancel}
        />
      ) : null}
    </>
  );
}
