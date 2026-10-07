"use client";

import type { ListAction, ReportRow } from "@/lib/reports/types";
import { fillTemplate } from "@/lib/reports/actions";

import { bulkHref } from "./model";

/**
 * Doing a row or bulk action (00-foundations 5.4.2 `ListAction`, F-2): the
 * frame hands the action its ids and rows; the action's own endpoint checks
 * permission and company on every id again.
 */

export type ActionOutcome =
  | { kind: "navigate"; href: string }
  | { kind: "done"; toast?: { title: string; variant: "success" | "warning" | "destructive" } }
  | { kind: "export" };

/** The filename a response says it is, or a fallback. */
export function fileNameFrom(response: Response, fallback: string): string {
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  return match?.[1] ?? fallback;
}

/** Saves a blob under a name, the way a link with `download` does. */
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** The clipboard, or — outside a secure context, where it does not exist — a selected textarea. */
async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  const copied = document.execCommand("copy");
  area.remove();
  if (!copied) throw new Error("That could not be copied.");
}

async function errorText(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (body?.error) return body.error;
  } catch {
    // Not JSON.
  }
  return "That did not work. Try again.";
}

/** A sheet over this page: `?sheet=<kind>&id=<id>` for one row, `&ids=` for several. */
export function sheetHref(pathname: string, search: string, sheet: string, ids: string[]): string {
  const params = new URLSearchParams(search);
  params.set("sheet", sheet);
  params.delete("id");
  params.delete("ids");
  if (ids.length === 1) params.set("id", ids[0]!);
  else if (ids.length > 1) params.set("ids", ids.join(","));
  return `${pathname}?${params.toString()}`;
}

export async function runAction(
  action: ListAction,
  ids: string[],
  rows: ReportRow[],
  where: { pathname: string; search: string },
): Promise<ActionOutcome> {
  const how = action.do;

  if ("sheet" in how) return { kind: "navigate", href: sheetHref(where.pathname, where.search, how.sheet, ids) };

  if ("href" in how) {
    const template = Array.isArray(how.href) ? how.href[0]! : how.href;
    const href = bulkHref(template, rows);
    if (!href) return { kind: "done", toast: { title: "There is nothing to open for these rows.", variant: "warning" } };
    return { kind: "navigate", href };
  }

  if ("open" in how && !("download" in how)) {
    const href = rows[0] ? fillTemplate(how.open, rows[0]) : null;
    if (!href) return { kind: "done", toast: { title: "There is nothing to open for this row.", variant: "warning" } };
    window.open(href, "_blank", "noopener");
    return { kind: "done" };
  }

  if ("copy" in how) {
    const values = rows.map((row) => row[how.copy]).filter((value) => value !== null && value !== undefined && value !== "");
    await copyText(values.join(", "));
    const title = (how.done ?? "{n} copied.").replace("{n}", String(values.length));
    return { kind: "done", toast: { title, variant: "success" } };
  }

  if ("download" in how) {
    if (how.cap && ids.length > how.cap) {
      return {
        kind: "done",
        toast: { title: `Tick ${how.cap} or fewer for ${action.label.toLowerCase()}.`, variant: "warning" },
      };
    }
    // A row's file: its `{key}` holes filled from the row.
    const url = rows.length === 1 ? fillTemplate(how.download, rows[0]!) : how.download;
    if (!url) return { kind: "done", toast: { title: "There is nothing to open for this row.", variant: "warning" } };
    // Opened before the request, so the browser treats the new tab as the click's.
    const tab = how.open ? window.open("", "_blank") : null;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(how.rowsAs
          ? { [how.rowsAs.key]: rows.map((row) => Object.fromEntries(Object.entries(how.rowsAs!.fields).map(([field, column]) => [field, row[column]]))) }
          : { [how.idsAs ?? "ids"]: ids }),
        ...how.with,
      }),
    });
    if (!response.ok) {
      tab?.close();
      return { kind: "done", toast: { title: await errorText(response), variant: "destructive" } };
    }
    const blob = await response.blob();
    if (tab) {
      tab.location.href = URL.createObjectURL(blob);
    } else {
      saveBlob(blob, fileNameFrom(response, `${action.key}.${how.with?.format ?? "pdf"}`));
    }
    const count = how.notice ? Number(response.headers.get(how.notice.header) ?? 0) : 0;
    if (how.notice && count > 0) {
      return { kind: "done", toast: { title: how.notice.text.replace("{n}", String(count)), variant: "warning" } };
    }
    return { kind: "done" };
  }

  // A confirm action is drawn by the frame's ConfirmDialog, which posts itself.
  return { kind: "done" };
}

/**
 * Exports the list as a file (W-55): the list's query, or only the ticked
 * rows. Answers what to toast: why it failed, or that the file stops at the
 * engine's row limit; null when the file is the whole list.
 */
export async function exportList(
  source: string,
  format: "xlsx" | "csv" | "pdf",
  query: Record<string, unknown>,
  rowIds?: string[],
): Promise<{ title: string; variant: "destructive" | "warning" } | null> {
  const response = await fetch(`/api/v2/reports/${encodeURIComponent(source)}/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ format, query, ...(rowIds ? { rowIds } : {}) }),
  });
  if (!response.ok) return { title: await errorText(response), variant: "destructive" };
  saveBlob(await response.blob(), fileNameFrom(response, `${source}.${format}`));
  return cutWords(response.headers.get("X-Export-Rows"), response.headers.get("X-Export-Of"));
}

/** "The file has the first 5,000 of 5,858 rows. Narrow the filters for the rest." */
export function cutWords(rows: string | null, of: string | null): { title: string; variant: "warning" } | null {
  if (!rows) return null;
  const count = (value: string) => Number(value).toLocaleString("en-US");
  const first = of ? `the first ${count(rows)} of ${count(of)} rows` : `the first ${count(rows)} rows`;
  return { title: `The file has ${first}. Narrow the filters for the rest.`, variant: "warning" };
}
