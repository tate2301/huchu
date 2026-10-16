"use client";

import "./admin-list.css";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { ListHostProvider, type ListHost } from "@/components/list-frame/host";
import { ListFrame, type ListFrameProps } from "@/components/list-frame/list-frame";
import { useToast } from "@/components/ui/use-toast";
import { ADMIN_LIST_RUNS } from "@/lib/admin/lists/runs";

import { ADMIN_SHEETS } from "./sheets";

/** The admin portal's lists: its own API behind the operator's sign-in, its own runs, its pages' own headers. */
const ADMIN_LIST_HOST: ListHost = {
  base: "/api/platform-admin/lists",
  runs: ADMIN_LIST_RUNS,
  chrome: "page",
  formats: ["xlsx", "csv"],
};

export type AdminSheetProps = {
  ids: string[];
  /** Back to the list, the sheet's address gone. */
  close: () => void;
  /** Says it, reads the list again and closes. */
  done: (title: string, variant?: "success" | "warning") => void;
};

/**
 * A working list in the admin portal: the workspace product's ListFrame —
 * tabs, search, filters, sorting, grouping, ticks, bulk actions, export — over
 * an admin source, with the sheets its actions open (`?sheet=`).
 */
export function AdminList(props: ListFrameProps) {
  return (
    <ListHostProvider host={ADMIN_LIST_HOST}>
      <div className="cx-admin-list">
        <ListFrame {...props} />
      </div>
      <AdminSheetHost source={props.source} />
    </ListHostProvider>
  );
}

function AdminSheetHost({ source }: { source: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const kind = searchParams.get("sheet");
  const Sheet = kind ? ADMIN_SHEETS[kind] : undefined;
  const ids = React.useMemo(() => {
    const one = searchParams.get("id");
    const many = searchParams.get("ids");
    return one ? [one] : many ? many.split(",").filter(Boolean) : [];
  }, [searchParams]);

  const close = React.useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("sheet");
    params.delete("id");
    params.delete("ids");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const done = React.useCallback(
    (title: string, variant: "success" | "warning" = "success") => {
      toast({ title, variant });
      void queryClient.invalidateQueries({ queryKey: ["list", source] });
      router.refresh();
      close();
    },
    [close, queryClient, router, source, toast],
  );

  if (!Sheet) return null;
  return <Sheet ids={ids} close={close} done={done} />;
}
