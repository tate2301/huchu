"use client";

import "./count-phone.css";

import * as React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError, fetchJson } from "@/lib/api-client";
import { Barcode, CheckCircle } from "@/lib/icons";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import { countingTitle } from "@/lib/retail/stock/count-words";
import type { CountLine, CountProgress, CountView } from "@/lib/retail/stock/counts";
import { formatCount } from "@/lib/workspace/format";

/**
 * Count on a phone (30-stock 5.7; board CountPhone). The head names the
 * count and how far it has got; a scan box jumps to a bottle's line; each
 * line takes its figure, saved on blur or Enter, after which the next line
 * still to count takes the focus. "Done, send for review" sends it once
 * every line is counted. Built for 390px; wider screens keep it 480 wide.
 */

type LinesPage = { lines: CountLine[]; progress: CountProgress };
type Saved = { line: CountLine; progress: CountProgress };
type LineState = { typed: string; status: "idle" | "saving" | "failed"; error?: string };

const viewKey = (id: string) => ["retail-stock-count", id] as const;
const linesKey = (id: string) => ["retail-stock-count", id, "lines"] as const;

const NOT_YOURS = "This count is not yours to count.";

export function CountPhone({ countId }: { countId: string }) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const canSeeCounts = canRetailRoleDo(session?.user?.role, "retail.counts", "view");

  const view = useQuery({
    queryKey: viewKey(countId),
    queryFn: () => fetchJson<{ data: CountView }>(`/api/v2/retail/stock/counts/${countId}`).then((answer) => answer.data),
    retry: false,
    // Always the server's figures when the page opens, never a copy kept from before.
    staleTime: 0,
    refetchOnMount: "always",
  });
  const linesQuery = useQuery({
    queryKey: linesKey(countId),
    queryFn: () => fetchJson<LinesPage>(`/api/v2/retail/stock/counts/${countId}/lines`),
    enabled: view.isSuccess,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });

  // Drawn only once mounted: the server has no figures, and a copy kept on the phone would not match its HTML.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const [states, setStates] = React.useState<Record<string, LineState>>({});
  const [current, setCurrent] = React.useState<string | null>(null);
  const [scan, setScan] = React.useState("");
  const [scanMiss, setScanMiss] = React.useState(false);
  const [refusal, setRefusal] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const inputs = React.useRef(new Map<string, HTMLInputElement>());

  // Lines in the server's order; each save writes its answer into the same
  // list, so a line saved stays where it is while the counter works down the shelf.
  const page = mounted && linesQuery.isFetchedAfterMount ? (linesQuery.data ?? null) : null;
  const lines = page?.lines ?? null;
  const progress = page?.progress ?? null;
  const firstUncounted = lines?.find((line) => line.counted === null)?.id ?? null;
  React.useEffect(() => {
    if (firstUncounted) setCurrent((was) => was ?? firstUncounted);
  }, [firstUncounted]);

  const count = mounted && view.isFetchedAfterMount ? (view.data ?? null) : null;
  const loadError = mounted ? (view.error ?? linesQuery.error) : null;

  const nextUncounted = (afterId: string, list: CountLine[]): CountLine | null => {
    const from = list.findIndex((line) => line.id === afterId);
    const ordered = [...list.slice(from + 1), ...list.slice(0, from + 1)];
    return ordered.find((line) => line.counted === null && line.id !== afterId) ?? null;
  };

  const focusLine = (lineId: string) => {
    const input = inputs.current.get(lineId);
    if (!input) return;
    input.scrollIntoView({ block: "center", behavior: "smooth" });
    input.focus();
  };

  const save = async (line: CountLine, moveOn: boolean) => {
    const state = states[line.id];
    const typed = (state?.typed ?? line.counted ?? "").trim();
    if (typed === "" || (typed === line.counted && state?.status !== "failed")) {
      if (moveOn) {
        const next = nextUncounted(line.id, lines ?? []);
        if (next) focusLine(next.id);
      }
      return;
    }
    setStates((all) => ({ ...all, [line.id]: { typed, status: "saving" } }));
    try {
      const answer = await fetchJson<Saved>(`/api/v2/retail/stock/counts/${countId}/lines/${line.id}`, {
        method: "PUT",
        body: JSON.stringify({ counted: typed }),
      });
      const updated = (lines ?? []).map((row) => (row.id === line.id ? answer.line : row));
      queryClient.setQueryData<LinesPage>(linesKey(countId), { lines: updated, progress: answer.progress });
      setStates((all) => ({ ...all, [line.id]: { typed: answer.line.counted ?? typed, status: "idle" } }));
      setRefusal(null);
      if (moveOn) {
        const next = nextUncounted(line.id, updated);
        if (next) focusLine(next.id);
      }
    } catch (error) {
      const message =
        error instanceof ApiError && error.status === 400
          ? error.message
          : error instanceof ApiError && (error.status === 409 || error.status === 403)
            ? error.message
            : "Not saved. Tap to try again.";
      setStates((all) => ({ ...all, [line.id]: { typed, status: "failed", error: message } }));
      if (error instanceof ApiError && error.status === 409) void view.refetch();
    }
  };

  const onScan = (event: React.FormEvent) => {
    event.preventDefault();
    const code = scan.trim();
    if (!code) return;
    const found = (lines ?? []).find((line) => line.barcode === code);
    setScan("");
    if (!found) {
      setScanMiss(true);
      return;
    }
    setScanMiss(false);
    setCurrent(found.id);
    focusLine(found.id);
  };

  const send = async () => {
    setSending(true);
    setRefusal(null);
    try {
      await fetchJson(`/api/v2/retail/stock/counts/${countId}/submit`, { method: "POST" });
      setSent(true);
      void queryClient.invalidateQueries({ queryKey: ["nav-badges"] });
    } catch (error) {
      setRefusal(error instanceof Error ? error.message : "It was not sent. Try again.");
    } finally {
      setSending(false);
    }
  };

  if (loadError) {
    const status = loadError instanceof ApiError ? loadError.status : 0;
    return (
      <Shell>
        <div className="cp-state" role="alert">
          <p className="cp-state__title">
            {status === 403 ? NOT_YOURS : status === 404 ? "That count is not this shop’s." : "This count could not be loaded."}
          </p>
          {status !== 403 && status !== 404 ? (
            <>
              <p className="cp-state__line">{loadError.message}</p>
              <button type="button" className="cp-done" onClick={() => void view.refetch().then(() => linesQuery.refetch())}>
                Try again
              </button>
            </>
          ) : null}
        </div>
      </Shell>
    );
  }

  const closed = count && (count.status === "APPROVED" || count.status === "CANCELLED");
  const waiting = count && count.status === "TO_APPROVE";
  const recount = count && count.status === "COUNTING" && count.yours ? count.recount : 0;
  const shown = progress ?? (count ? { counted: count.counted, total: count.lines } : null);

  return (
    <Shell>
      <header className="cp-head">
        <span className="cp-head__ref">
          {count ? `${count.countNo}${count.multiSite ? ` · ${count.site.name}` : ""}` : "—"}
        </span>
        <h1 className="cp-head__title">{count ? countingTitle(count.name, count.scope, recount) : "—"}</h1>
        <div className="cp-progress">
          <span className="cp-progress__track" aria-hidden="true">
            <span
              className="cp-progress__fill"
              style={{ width: shown && shown.total > 0 ? `${(shown.counted / shown.total) * 100}%` : "0%" }}
            />
          </span>
          <span className="cp-progress__words">
            {shown ? (
              <>
                <span className="cp-mono">{formatCount(shown.counted)}</span> of <span className="cp-mono">{formatCount(shown.total)}</span>
              </>
            ) : (
              "—"
            )}
          </span>
        </div>
      </header>

      {closed ? (
        <div className="cp-state">
          <p className="cp-state__title">This count is closed.</p>
          {canSeeCounts ? (
            <Link href="/retail/stock/counts" className="cp-link">
              Back to Counts
            </Link>
          ) : null}
        </div>
      ) : sent || waiting ? (
        <div className="cp-state" role="status">
          <CheckCircle className="cp-state__icon" aria-hidden="true" />
          <p className="cp-state__title">Sent for review</p>
          <p className="cp-state__line">{count?.approver ?? "A manager or the owner"} approves it. You can close this page.</p>
        </div>
      ) : (
        <>
          <form className="cp-scan" onSubmit={onScan}>
            <label className="cp-scan__box">
              <Barcode aria-hidden="true" />
              <input
                value={scan}
                onChange={(event) => {
                  setScan(event.target.value);
                  setScanMiss(false);
                }}
                placeholder="Scan a bottle to jump to it"
                aria-label="Scan a bottle to jump to it"
                autoComplete="off"
              />
            </label>
            {scanMiss ? <span className="cp-scan__miss">Not in this count.</span> : null}
          </form>

          <ul className="cp-lines">
            {lines === null
              ? Array.from({ length: 6 }, (_, index) => (
                  <li key={index} className="cp-line cp-line--skeleton" aria-hidden="true">
                    <span className="cp-skel cp-skel--name" />
                    <span className="cp-skel cp-skel--box" />
                  </li>
                ))
              : lines.map((line) => {
                  const state = states[line.id];
                  const value = state?.typed ?? line.counted ?? "";
                  const failed = state?.status === "failed";
                  return (
                    <li key={line.id} className={`cp-line${current === line.id ? " is-current" : ""}`}>
                      <div className="cp-line__text">
                        <span className="cp-line__name">{line.product}</span>
                        <span className="cp-line__sub">
                          {line.sub}
                          {count && !count.blind && typeof line.expected === "number"
                            ? `${line.sub ? " · " : ""}expected ${formatCount(line.expected)}`
                            : ""}
                        </span>
                        {failed ? (
                          <button type="button" className="cp-line__failed" onClick={() => void save(line, false)}>
                            {state?.error ?? "Not saved. Tap to try again."}
                          </button>
                        ) : null}
                      </div>
                      <input
                        ref={(node) => {
                          if (node) inputs.current.set(line.id, node);
                          else inputs.current.delete(line.id);
                        }}
                        className="cp-line__input"
                        inputMode="decimal"
                        aria-label={`Counted, ${line.product}`}
                        aria-invalid={failed || undefined}
                        value={value}
                        onFocus={() => setCurrent(line.id)}
                        onChange={(event) =>
                          setStates((all) => ({ ...all, [line.id]: { typed: event.target.value, status: "idle" } }))
                        }
                        onBlur={() => void save(line, false)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void save(line, true);
                          }
                        }}
                      />
                    </li>
                  );
                })}
          </ul>

          <footer className="cp-foot">
            {refusal ? <p className="cp-foot__refusal" role="alert">{refusal}</p> : null}
            <p className="cp-foot__note">
              {count?.blind === false ? "Count what is there." : "You do not see what is expected. Count what is there."}
            </p>
            <button type="button" className="cp-done" disabled={sending || !count} onClick={() => void send()}>
              Done, send for review
            </button>
          </footer>
        </>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="cp-page">
      <main className="cp-main">{children}</main>
    </div>
  );
}
