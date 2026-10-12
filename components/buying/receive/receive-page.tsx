"use client";

import "./receive.css";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { PageChrome } from "@/components/layout/page-chrome";
import { LookupField } from "@/components/sheet-form/lookup-field";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/workspace/button";
import { ConfirmDialog } from "@/components/workspace/confirm-dialog";
import { PhotoField } from "@/components/workspace/fields/photo-field";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Barcode, Check, X } from "@/lib/icons";
import { leaveReceiveAsk } from "@/lib/retail/asks/buying";
import type { ReceivingView } from "@/lib/retail/buying/delivery-view";
import { lateWords } from "@/lib/retail/buying/words";
import type { Ask } from "@/lib/workspace/ask";
import { formatCount, formatMoney } from "@/lib/workspace/format";
import type { PickedOption } from "@/lib/workspace/sheet-kind";

import { checkersWords, postedWords, receiveTotals, rowFigures, whenYouPost, type ReceiveRow, type Rest } from "./receive-math";

/**
 * Receive a delivery against its order (40-buying 5.7, W-33; board Receive):
 * count each line (typed or scanned), put breakages aside, keep or close the
 * rest, and post to stock. An owner or manager posts at once; a stock clerk
 * sends the count for checking. The aside says live what posting does, and
 * keeps the delivery note, the empties going back and how it is paid.
 */

type Line = ReceiveRow & {
  orderLineId: string | null;
  inventoryItemId: string;
  before: string;
  barcodes: string[];
  packBarcode: string | null;
  packSize: number | null;
  /** What was typed, as typed ("" while empty). */
  typed: { thisTime: string; damaged: string };
};

type UploadedFile = { url: string; name: string; contentType: string; size: number };
type Outcome = { id: string; receiptNo: string; status: "COUNTED" | "POSTED"; units: number; stillOnOrder: number; checkers: string[] };

const GUIDE_KEY = "huchu.buying.receive.guide";
const WHOLE = /^\d*$/;

const receivingKey = (orderId: string) => ["retail-receiving", orderId] as const;

function linesOf(view: ReceivingView): Line[] {
  return view.lines.map((line) => ({
    key: line.orderLineId,
    name: line.name,
    ordered: line.ordered,
    due: line.due,
    unitCost: line.unitCost,
    thisTime: line.due,
    damaged: 0,
    rest: "KEEP",
    orderLineId: line.orderLineId,
    inventoryItemId: line.inventoryItemId,
    before: line.before,
    barcodes: line.barcodes,
    packBarcode: line.packBarcode,
    packSize: line.packSize,
    typed: { thisTime: String(line.due), damaged: "0" },
  }));
}

function readGuideHidden(): boolean {
  try {
    return window.localStorage.getItem(GUIDE_KEY) === "hidden";
  } catch {
    return false;
  }
}

function writeGuideHidden() {
  try {
    window.localStorage.setItem(GUIDE_KEY, "hidden");
  } catch {
    // Remembering is a convenience; the guide hides for this visit either way.
  }
}

async function uploadNote(file: File): Promise<UploadedFile> {
  const form = new FormData();
  form.set("file", file);
  return (await fetchJson<{ data: UploadedFile }>("/api/v2/retail/buying/attachments", { method: "POST", body: form })).data;
}

export function ReceivePage({ orderId }: { orderId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const view = useQuery({ queryKey: receivingKey(orderId), queryFn: async () => (await fetchJson<{ data: ReceivingView }>(`/api/v2/retail/buying/orders/${orderId}/receiving`)).data, enabled: Boolean(orderId), retry: false });

  const [lines, setLines] = React.useState<Line[] | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [noteNumber, setNoteNumber] = React.useState("");
  const [counter, setCounter] = React.useState<PickedOption | null>(null);
  const [photo, setPhoto] = React.useState<UploadedFile | null>(null);
  const [crates, setCrates] = React.useState("");
  const [requisition, setRequisition] = React.useState<PickedOption | null>(null);
  const [guideHidden, setGuideHidden] = React.useState(false);
  const [scan, setScan] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [refused, setRefused] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<Outcome | null>(null);
  const [asking, setAsking] = React.useState<{ ask: Ask; go: () => void | Promise<void> } | null>(null);
  const [anyway, setAnyway] = React.useState(false);
  const inputs = React.useRef(new Map<string, HTMLInputElement>());
  const scanRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => setGuideHidden(readGuideHidden()), []);
  React.useEffect(() => {
    if (!view.data || lines) return;
    setLines(linesOf(view.data));
    setCounter({ id: view.data.counter.id, label: view.data.counter.name });
  }, [view.data, lines]);

  // Leaving with typed counts asks first (`leavereceive`): links in the page and the shell, and the browser's own leave.
  const guarding = dirty && !done;
  React.useEffect(() => {
    if (!guarding) return;
    const unload = (event: BeforeUnloadEvent) => event.preventDefault();
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank") return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      event.preventDefault();
      event.stopPropagation();
      setAsking({ ask: leaveReceiveAsk(), go: () => router.push(`${url.pathname}${url.search}`) });
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true);
    };
  }, [guarding, router]);

  const backHref = `/retail/buying/orders/${orderId}`;
  const data = view.data;
  const poNo = data?.order.poNo ?? "Order";

  if (view.isError) {
    const status = view.error instanceof ApiError ? view.error.status : null;
    return (
      <>
        <PageChrome title="Receive delivery" backHref={backHref} backLabel={poNo === "Order" ? "The order" : poNo} />
        <div className="cx-rv-state" role="alert">
          <h2>{status === 404 ? "There is nothing at this address" : status === 409 ? "Nothing can be received against this order" : "This would not load"}</h2>
          <p>{getApiErrorMessage(view.error)}</p>
          <Link href={status === 404 ? "/retail/buying/orders" : backHref} className="cx-rv-link">
            {status === 404 ? "Back to Orders" : "Back to the order"}
          </Link>
        </div>
      </>
    );
  }
  if (!data || !lines) {
    return (
      <>
        <PageChrome title="Receive delivery" backHref={backHref} backLabel="The order" />
        <div className="cx-rv" aria-busy="true">
          <div className="cx-rv-strip" />
          <div className="cx-rv-body">
            <div className="cx-rv-main">
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className="cx-rv-skeleton" />
              ))}
            </div>
          </div>
        </div>
      </>
    );
  }

  const readOnly = Boolean(done);
  const totals = receiveTotals(lines);
  const sentences = whenYouPost(totals, data.order.site.name, data.order.supplier.name);
  const anyOver = lines.some((line) => rowFigures(line).over || rowFigures(line).tooBroken);
  const nothing = totals.thisTime === 0;
  const perCrate = data.empties ? Number(data.empties.perCrate) : 0;
  const crateCount = Number(crates) || 0;
  const newest = data.requisitions[0] ?? null;

  const change = (key: string, field: "thisTime" | "damaged", text: string) => {
    if (!WHOLE.test(text)) return;
    setDirty(true);
    setRefused(null);
    setLines((current) =>
      current?.map((line) => (line.key === key ? { ...line, [field]: Number(text) || 0, typed: { ...line.typed, [field]: text } } : line)) ?? null,
    );
  };
  const setRest = (key: string, rest: Rest) => {
    setDirty(true);
    setLines((current) => current?.map((line) => (line.key === key ? { ...line, rest } : line)) ?? null);
  };
  const add = (key: string, by: number) => {
    setDirty(true);
    setLines(
      (current) =>
        current?.map((line) =>
          line.key === key ? { ...line, thisTime: line.thisTime + by, typed: { ...line.typed, thisTime: String(line.thisTime + by) } } : line,
        ) ?? null,
    );
  };
  const fillAsOrdered = () => {
    setDirty(true);
    setLines((current) => current?.map((line) => ({ ...line, thisTime: line.due ?? line.thisTime, damaged: 0, typed: { thisTime: String(line.due ?? line.thisTime), damaged: "0" } })) ?? null);
  };
  const focus = (key: string, field: "thisTime" | "damaged") => {
    const input = inputs.current.get(`${key}:${field}`);
    input?.focus();
    input?.select();
  };

  /** A typed name or a scanned barcode finds its line; a barcode adds one (a case barcode, the case); a product not on the order is offered as an extra line. */
  const doScan = async () => {
    const typed = scan.trim();
    if (!typed) return;
    const byCode = lines.find((line) => line.barcodes.includes(typed));
    const byCase = lines.find((line) => line.packBarcode === typed);
    const found = byCode ?? byCase ?? lines.find((line) => line.name.toLowerCase().includes(typed.toLowerCase()));
    setScan("");
    if (byCode) {
      add(byCode.key, 1);
      scanRef.current?.focus();
      return;
    }
    if (byCase) {
      add(byCase.key, byCase.packSize ?? 1);
      scanRef.current?.focus();
      return;
    }
    if (found) {
      focus(found.key, "thisTime");
      return;
    }
    try {
      const page = await fetchJson<{ options: Array<PickedOption & { cost?: string | null }> }>(
        `/api/v2/retail/lookup/stock-line?${new URLSearchParams({ q: typed, limit: "1", context: JSON.stringify({ siteId: data.order.site.id }) }).toString()}`,
      );
      const option = page.options[0];
      if (!option) {
        toast({ title: `Nothing called ${typed} is kept at ${data.order.site.name}.`, variant: "destructive" });
        return;
      }
      if (lines.some((line) => line.inventoryItemId === option.id)) {
        focus(lines.find((line) => line.inventoryItemId === option.id)!.key, "thisTime");
        return;
      }
      setAsking({
        ask: {
          title: `${option.label} is not on ${data.order.poNo}. Add it to this delivery?`,
          body: "It is counted in with the rest and goes into stock; the order is not changed.",
          keep: "Not now",
          go: "Add it",
          fill: "action",
        },
        go: () => {
          setDirty(true);
          setLines((current) => [
            ...(current ?? []),
            {
              key: `extra-${option.id}`,
              name: option.label,
              ordered: null,
              due: null,
              unitCost: Number(option.cost ?? 0),
              thisTime: 1,
              damaged: 0,
              rest: "KEEP",
              orderLineId: null,
              inventoryItemId: option.id,
              before: "Not on the order",
              barcodes: [typed],
              packBarcode: null,
              packSize: null,
              typed: { thisTime: "1", damaged: "0" },
            },
          ]);
        },
      });
    } catch (error) {
      toast({ title: getApiErrorMessage(error), variant: "destructive" });
    }
  };

  const submit = async () => {
    setBusy(true);
    setRefused(null);
    try {
      const answer = await fetchJson<{ data: Outcome }>("/api/v2/retail/buying/deliveries", {
        method: "POST",
        body: JSON.stringify({
          purchaseOrderId: data.order.id,
          noteNumber: noteNumber.trim() || null,
          countedById: counter?.id ?? null,
          photo,
          lines: lines
            .filter((line) => line.thisTime > 0 || (line.rest === "CLOSE" && rowFigures(line).toCome > 0))
            .map((line) => ({
              purchaseOrderLineId: line.orderLineId,
              inventoryItemId: line.inventoryItemId,
              quantity: line.thisTime,
              damaged: line.damaged,
              unitCost: line.orderLineId ? line.unitCost : null,
              rest: rowFigures(line).toCome > 0 ? line.rest : "KEEP",
            })),
          empties: data.empties && crateCount > 0 ? { crates: crateCount } : null,
          requisitionId: requisition?.id ?? null,
          post: data.can.post,
        }),
      });
      setDone(answer.data);
      setDirty(false);
      await Promise.all(
        [receivingKey(orderId), ["retail-order", orderId], ["list", "retail-orders"], ["list", "retail-order-lines"], ["record-activity"], ["reports"], ["nav-badges"]].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    } catch (error) {
      setRefused(getApiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const hideGuide = () => {
    setGuideHidden(true);
    writeGuideHidden();
  };

  const late = data.order.late ? lateWords(data.order.late.days) : null;
  const primaryLabel = data.can.post ? "Post to stock" : "Send for checking";
  const draftFirst = data.order.draft && !anyway;

  return (
    <>
      <PageChrome title="Receive delivery" reference={data.order.heading} backHref={backHref} backLabel={data.order.poNo}>
        {readOnly || draftFirst ? null : (
          <>
            <Button variant="secondary" disabled={busy} onClick={fillAsOrdered}>
              Fill as ordered
            </Button>
            <Button variant="primary" busy={busy} disabled={busy || anyOver || nothing} onClick={() => void submit()}>
              {primaryLabel}
            </Button>
          </>
        )}
      </PageChrome>

      <div className="cx-rv">
        <div className="cx-rv-strip">
          <label className="cx-rv-scan">
            <Barcode className="cx-rv-scan__icon" aria-hidden="true" />
            <input
              ref={scanRef}
              value={scan}
              disabled={readOnly || draftFirst}
              aria-label="Scan or type a product"
              placeholder="Scan or type a product to jump to it"
              onChange={(event) => setScan(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void doScan();
                }
              }}
            />
          </label>
          {late ? <span className="cx-rv-chip cx-rv-chip--bad">{late}</span> : data.order.dueToday ? <span className="cx-rv-chip cx-rv-chip--warn">Due today</span> : null}
          <span className="cx-rv-strip__text">{data.order.deliveredSummary}</span>
          <span className="cx-rv-strip__figure">
            Receiving <b className="cx-rv-mono">{formatMoney(totals.value)}</b>
          </span>
        </div>

        {draftFirst ? (
          <div className="cx-rv-state" role="note">
            <h2>{data.order.poNo} has not been sent</h2>
            <p>Send it first, or receive it anyway: receiving it marks it sent by hand, since {data.order.supplier.short} had it.</p>
            <div className="cx-rv-state__actions">
              <Link href={backHref} className="cx-rv-link">
                Send it first
              </Link>
              <Button variant="secondary" onClick={() => setAnyway(true)}>
                Receive it anyway
              </Button>
            </div>
          </div>
        ) : (
          <div className="cx-rv-body">
            <div className="cx-rv-main">
              {done ? (
                <p className="cx-rv-done" role="status">
                  <Check className="cx-rv-done__icon" aria-hidden="true" />
                  {done.status === "POSTED" ? (
                    <span>
                      <b>Posted to stock.</b> {postedWords(done.units, done.stillOnOrder)}
                    </span>
                  ) : (
                    <span>
                      <b>Sent for checking.</b> {checkersWords(done.checkers)}
                    </span>
                  )}
                  <Link href={`/retail/buying/deliveries/${done.id}`} className="cx-rv-link">
                    Open {done.receiptNo}
                  </Link>
                </p>
              ) : guideHidden ? null : (
                <div className="cx-rv-guide" role="note">
                  <ol>
                    <li>
                      <b>Count each line.</b> Type what came, or scan it. What is already filled is what the order says is due.
                    </li>
                    <li>
                      <b>Put breakages aside.</b> Damaged bottles go in their own column, so they are claimed, not sold.
                    </li>
                    <li>
                      <b>Decide on the rest.</b> Anything short stays on order, unless you close it short.
                    </li>
                  </ol>
                  <button type="button" className="cx-rv-guide__close" aria-label="Hide the guide" onClick={hideGuide}>
                    <X aria-hidden="true" />
                  </button>
                </div>
              )}

              {refused ? (
                <p className="cx-rv-refused" role="alert">
                  {refused}
                </p>
              ) : null}

              <div role="table" aria-label="Lines on this delivery" className="cx-rv-table">
                <div role="row" className="cx-rv-g cx-rv-head">
                  <div role="columnheader">Product</div>
                  <div role="columnheader" className="cx-rv-end">
                    Ordered
                  </div>
                  <div role="columnheader" className="cx-rv-end">
                    This time
                  </div>
                  <div role="columnheader" className="cx-rv-end">
                    Damaged
                  </div>
                  <div role="columnheader" className="cx-rv-end">
                    To come
                  </div>
                  <div role="columnheader">The rest</div>
                  <div role="columnheader" className="cx-rv-end">
                    Value
                  </div>
                </div>
                {lines.map((line, index) => {
                  const figures = rowFigures(line);
                  const next = lines[index + 1];
                  return (
                    <div key={line.key} role="row" className={`cx-rv-g cx-rv-row${line.thisTime === 0 ? " cx-rv-row--none" : ""}`}>
                      <div role="cell" className="cx-rv-product">
                        <span className="cx-rv-product__name">{line.name}</span>
                        <span className="cx-rv-product__before">{line.before}</span>
                      </div>
                      <div role="cell" className="cx-rv-end cx-rv-mono cx-rv-ordered">
                        <span className="cx-rv-phone">Ordered </span>
                        {line.ordered === null ? "–" : formatCount(line.ordered)}
                      </div>
                      <div role="cell" className="cx-rv-end cx-rv-cellinput">
                        <span className="cx-rv-phone">This time</span>
                        {readOnly ? (
                          <span className="cx-rv-mono cx-rv-strong">{formatCount(line.thisTime)}</span>
                        ) : (
                          <input
                            ref={(element) => {
                              if (element) inputs.current.set(`${line.key}:thisTime`, element);
                              else inputs.current.delete(`${line.key}:thisTime`);
                            }}
                            className="cx-rv-input"
                            inputMode="numeric"
                            aria-label={`Coming now, ${line.name}`}
                            aria-invalid={figures.over ? true : undefined}
                            aria-describedby={figures.over ? `${line.key}-over` : undefined}
                            value={line.typed.thisTime}
                            onChange={(event) => change(line.key, "thisTime", event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                focus(line.key, "damaged");
                              }
                            }}
                          />
                        )}
                        {figures.over ? (
                          <span id={`${line.key}-over`} className="cx-rv-hint">
                            More than is still to come.
                          </span>
                        ) : null}
                      </div>
                      <div role="cell" className="cx-rv-end cx-rv-cellinput">
                        <span className="cx-rv-phone">Damaged</span>
                        {readOnly ? (
                          <span className={`cx-rv-mono${line.damaged > 0 ? " cx-rv-bad" : ""}`}>{formatCount(line.damaged)}</span>
                        ) : (
                          <input
                            ref={(element) => {
                              if (element) inputs.current.set(`${line.key}:damaged`, element);
                              else inputs.current.delete(`${line.key}:damaged`);
                            }}
                            className={`cx-rv-input cx-rv-input--damaged${line.damaged > 0 ? " cx-rv-bad" : ""}`}
                            inputMode="numeric"
                            aria-label={`Damaged units, ${line.name}`}
                            aria-invalid={figures.tooBroken ? true : undefined}
                            value={line.typed.damaged}
                            onChange={(event) => change(line.key, "damaged", event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                if (next) focus(next.key, "thisTime");
                                else (event.target as HTMLInputElement).blur();
                              }
                            }}
                          />
                        )}
                        {figures.tooBroken ? <span className="cx-rv-hint">More damaged than came.</span> : null}
                      </div>
                      <div
                        role="cell"
                        className={`cx-rv-end cx-rv-mono cx-rv-tocome ${figures.toCome === 0 ? "cx-rv-faint" : line.rest === "KEEP" ? "cx-rv-warn cx-rv-strong" : "cx-rv-muted"}`}
                      >
                        <span className="cx-rv-phone">To come </span>
                        {figures.toCome === 0 ? "–" : formatCount(figures.toCome)}
                      </div>
                      <div role="cell" className="cx-rv-rest">
                        {line.due === null ? null : figures.toCome === 0 ? (
                          <span className="cx-rv-allin">
                            <Check aria-hidden="true" /> All in
                          </span>
                        ) : (
                          <span className="cx-rv-seg" role="group" aria-label={`The rest of ${line.name}`}>
                            {(["KEEP", "CLOSE"] as const).map((rest) => (
                              <button
                                key={rest}
                                type="button"
                                aria-pressed={line.rest === rest}
                                disabled={readOnly}
                                className={line.rest === rest ? "is-on" : undefined}
                                onClick={() => setRest(line.key, rest)}
                              >
                                {rest === "KEEP" ? "Keep" : "Close"}
                              </button>
                            ))}
                          </span>
                        )}
                      </div>
                      <div role="cell" className="cx-rv-end cx-rv-mono cx-rv-value">
                        {formatMoney(figures.value)}
                      </div>
                    </div>
                  );
                })}
                <div role="row" className="cx-rv-g cx-rv-total">
                  <div role="cell">Σ {formatCount(totals.lines)} {totals.lines === 1 ? "line" : "lines"}</div>
                  <div role="cell" className="cx-rv-end cx-rv-mono cx-rv-ordered">
                    {formatCount(totals.ordered)}
                  </div>
                  <div role="cell" className="cx-rv-end cx-rv-mono">
                    {formatCount(totals.thisTime)}
                  </div>
                  <div role="cell" className={`cx-rv-end cx-rv-mono${totals.damaged > 0 ? " cx-rv-bad" : ""}`}>
                    {formatCount(totals.damaged)}
                  </div>
                  <div role="cell" className={`cx-rv-end cx-rv-mono cx-rv-tocome${totals.toCome > 0 ? " cx-rv-warn" : ""}`}>
                    {formatCount(totals.toCome)}
                  </div>
                  <div role="cell" className="cx-rv-rest cx-rv-faint">
                    —
                  </div>
                  <div role="cell" className="cx-rv-end cx-rv-mono cx-rv-value">
                    {formatMoney(totals.value)}
                  </div>
                </div>
              </div>
              <p className="cx-rv-under">Quantities are single units. Damaged units are counted in, claimed from the supplier and kept off the shelf.</p>
            </div>

            <aside className="cx-rv-aside" aria-label="When you post">
              <section className="cx-rv-group">
                <h2>When you post</h2>
                <ul className="cx-rv-dots">
                  {sentences.map((sentence) => (
                    <li key={sentence.tone} className={`cx-rv-dot cx-rv-dot--${sentence.tone}`}>
                      {sentence.text}
                    </li>
                  ))}
                </ul>
              </section>

              <section className="cx-rv-group">
                <h2>The delivery note</h2>
                <label className="cx-rv-field">
                  <span>Note number</span>
                  <input className="cx-rv-text cx-rv-mono" value={noteNumber} disabled={readOnly} onChange={(event) => setNoteNumber(event.target.value)} />
                </label>
                <div className="cx-rv-field">
                  <span id="rv-counter-label">Counted by</span>
                  <LookupField
                    id="rv-counter"
                    label="Counted by"
                    noun="person"
                    value={counter}
                    disabled={readOnly}
                    onValueChange={(picked) => setCounter(picked)}
                    aria-describedby="rv-counter-label"
                  />
                </div>
                <PhotoField
                  value={photo?.url ?? null}
                  disabled={readOnly}
                  prompt="Add a photo of the signed note"
                  accept="image/*,application/pdf"
                  added={photo && photo.contentType === "application/pdf" ? photo.name : null}
                  upload={async (file) => {
                    const uploaded = await uploadNote(file);
                    setPhoto(uploaded);
                    return uploaded.url;
                  }}
                  onValueChange={(url) => {
                    if (!url) setPhoto(null);
                  }}
                />
              </section>

              {data.empties ? (
                <section className="cx-rv-group">
                  <h2>
                    Empties going back <span className="cx-rv-tag">Liquor store</span>
                  </h2>
                  <div className="cx-rv-pair">
                    <label className="cx-rv-field">
                      <span>Crates</span>
                      <input
                        className="cx-rv-text cx-rv-mono cx-rv-end"
                        inputMode="numeric"
                        value={crates}
                        disabled={readOnly}
                        onChange={(event) => WHOLE.test(event.target.value) && setCrates(event.target.value)}
                      />
                    </label>
                    <div className="cx-rv-field">
                      <span>Deposit back</span>
                      <span className="cx-rv-read cx-rv-mono">{formatMoney(crateCount * perCrate)}</span>
                    </div>
                  </div>
                  <p className="cx-rv-hintline">
                    {data.empties.crateWord} at {formatMoney(perCrate)} each, credited against this order. {formatCount(data.empties.inStore)} in the store.
                  </p>
                </section>
              ) : null}

              <section className="cx-rv-group">
                <h2>Paying for it</h2>
                <p>{data.terms.sentence}</p>
                <div className="cx-rv-field">
                  <span id="rv-req-label">Paid in cash instead?</span>
                  <LookupField
                    id="rv-requisition"
                    label="Paid in cash instead?"
                    noun="requisition"
                    value={requisition}
                    disabled={readOnly}
                    placeholder="Search requisitions, or ask for money"
                    context={{ supplierId: data.order.supplier.id, orderId: data.order.id }}
                    onValueChange={(picked) => {
                      setRequisition(picked);
                      setDirty(true);
                    }}
                    aria-describedby="rv-req-label"
                  />
                  {readOnly ? null : (
                    <Link href={`${pathname}?sheet=req-new&for=order&orderId=${data.order.id}`} className="cx-rv-link cx-rv-ask">
                      Ask for money
                    </Link>
                  )}
                </div>
                <p className="cx-rv-hintline">
                  {newest ? (
                    <>
                      Cash for a supplier comes from a requisition, like{" "}
                      <Link href={`/retail/buying/requisitions/${newest.id}`} className="cx-rv-link cx-rv-mono">
                        {newest.requisitionNo}
                      </Link>
                      , so the safe always balances.
                    </>
                  ) : (
                    "Cash for a supplier comes from a requisition, so the safe always balances."
                  )}
                </p>
              </section>
            </aside>
          </div>
        )}
      </div>

      {asking ? (
        <ConfirmDialog
          ask={asking.ask}
          open
          onOpenChange={(open) => !open && setAsking(null)}
          onConfirm={async () => {
            const { ask, go } = asking;
            setAsking(null);
            // Leaving drops the guard first, so the move it asked about goes through.
            if (ask.go === "Leave") setDirty(false);
            await go();
          }}
        />
      ) : null}
    </>
  );
}
