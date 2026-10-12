"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import { SHEET_KINDS } from "@/lib/retail/sheet-kinds";
import type { SheetCtx, SheetKind } from "@/lib/workspace/sheet-kind";

import { SheetForm } from "./sheet-form";

/**
 * The sheet host (00-foundations 5.7.1), mounted once in the shell: reads
 * `?sheet=<kind>` and opens that kind over the page that is already there.
 * The address is the sheet's state — refreshing reopens it, Back closes it.
 */

/** The sheet's own parameters, taken out of the address when it closes. */
const SHEET_PARAMS = ["sheet", "id", "ids", "step"];

function withoutSheet(pathname: string, search: string, extra: string[] = []): string {
  const params = new URLSearchParams(search);
  for (const key of [...SHEET_PARAMS, ...extra]) params.delete(key);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function SheetHost() {
  return (
    <React.Suspense fallback={null}>
      <Host />
    </React.Suspense>
  );
}

function Host() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;
  const userName = session?.user?.name ?? "";
  const role = session?.user?.role ?? "";

  const key = searchParams.get("sheet");
  const kind: SheetKind | undefined = key ? SHEET_KINDS[key] : undefined;

  const ctx = React.useMemo<SheetCtx | null>(() => {
    if (!userId) return null;
    const params = new URLSearchParams(search);
    const steppingParam = kind?.stepping?.param;
    const list = steppingParam ? (params.get(steppingParam) ?? "").split(",").filter(Boolean) : [];
    const at = Math.min(Math.max(0, Number(params.get("step") ?? 0) || 0), Math.max(0, list.length - 1));
    return {
      params,
      id: params.get("id"),
      user: { id: userId, name: userName, role },
      can: (resource, action) => canRetailRoleDo(role, resource, action),
      ...(list.length > 0 ? { step: { id: list[at]!, at, count: list.length } } : {}),
    };
  }, [search, userId, userName, role, kind]);

  const allowed = Boolean(kind && ctx && kind.requires.some(([resource, action]) => ctx.can(resource, action)));
  // A stepping sheet opens afresh on each item of its list.
  const openKey = allowed && key ? `${key}|${ctx?.id ?? ""}|${ctx?.step?.at ?? ""}` : null;

  // What is drawn: the open kind, kept through the closing slide. Each new
  // opening is a fresh sheet (`round`), so nothing typed before carries over.
  // Opened by a click on this page (the address went from no sheet to a
  // sheet), closing goes Back, so Back afterwards does not reopen it; opened
  // from a link or a refresh, closing replaces the address. Worked out while
  // rendering, from what the last render saw.
  const [seen, setSeen] = React.useState<{
    openKey: string | null;
    sheetParam: string | null;
    pathname: string | null;
    openedHere: boolean;
    shown: { key: string; kind: SheetKind; round: number } | null;
  }>({ openKey: null, sheetParam: null, pathname: null, openedHere: false, shown: null });
  if (openKey !== seen.openKey || key !== seen.sheetParam || pathname !== seen.pathname) {
    const opening = openKey !== null && (openKey !== seen.openKey || pathname !== seen.pathname);
    setSeen({
      openKey,
      sheetParam: key,
      pathname,
      openedHere: opening ? seen.pathname === pathname && seen.sheetParam === null : openKey ? seen.openedHere : false,
      shown:
        opening && kind && key ? { key, kind, round: (seen.shown?.round ?? 0) + 1 } : seen.shown,
    });
  }
  const openedHere = seen.openedHere;
  const shown = seen.shown;

  // The context the sheet was opened with stays while it slides away.
  const [lastCtx, setLastCtx] = React.useState<SheetCtx | null>(null);
  if (openKey && ctx && ctx !== lastCtx) setLastCtx(ctx);

  const steppingParam = seen.shown?.kind.stepping?.param;
  const close = React.useCallback(() => {
    // A stepping sheet has replaced the address as it went: back would reopen an earlier item.
    if (openedHere && !steppingParam) router.back();
    else router.replace(withoutSheet(pathname, window.location.search.slice(1), steppingParam ? [steppingParam] : []), { scroll: false });
  }, [openedHere, pathname, router, steppingParam]);

  const sheetCtx = (openKey ? ctx : null) ?? lastCtx;
  if (!shown || !sheetCtx) return null;
  return (
    <SheetForm
      key={`${shown.key}:${shown.round}`}
      kind={shown.kind}
      ctx={sheetCtx}
      open={openKey !== null && key === shown.key}
      onClose={close}
    />
  );
}
