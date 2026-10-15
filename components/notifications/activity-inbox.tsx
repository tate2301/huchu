"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { Button, Empty, Input, Kit, Segmented, Select, useShortcut } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { InboxDrawerView } from "@/components/notifications/inbox-drawer";
import { InboxRow, InboxSkeleton, rowFromItem, type RowModel } from "@/components/notifications/inbox-row";
import { useInboxMutations, useNow } from "@/components/notifications/notification-center";
import { rowFromEntry, TrailDrawer } from "@/components/notifications/workspace-trail";
import { useToast } from "@/components/ui/use-toast";
import { useDebounced } from "@/hooks/use-debounced";
import { fetchActivityPage, fetchActivityPeople, type ActivityLogEntry, type ActivityLogFilters } from "@/lib/activity/api";
import { ACTIVITY_MODULES, type ActivityAction } from "@/lib/activity/describe";
import { ApiError, getApiErrorMessage } from "@/lib/api-client";
import { archiveInbox, fetchInbox, fetchInboxDetail, type InboxView } from "@/lib/inbox/api";
import { groupByDay, INBOX_MODULES, isInboxModule, type InboxModule } from "@/lib/inbox/describe";
import { isOrgAdminRole } from "@/lib/preferences/nav";

import styles from "./inbox.module.css";

type View = "needs" | "mentions" | "all" | "workspace";

const VIEWS: View[] = ["needs", "mentions", "all", "workspace"];

const INBOX_MODULE_OPTIONS = (Object.entries(INBOX_MODULES) as Array<[InboxModule, { label: string }]>).sort((a, b) =>
  a[1].label.localeCompare(b[1].label),
);
const AREA_OPTIONS = Object.entries(ACTIVITY_MODULES).sort((a, b) => a[1].localeCompare(b[1]));

/** The kit's select at the toolbar's 32px, as wide as its words. */
const SELECT_STYLE: React.CSSProperties = {
  width: "auto",
  minWidth: 0,
  height: 32,
  fontSize: "var(--text-13)",
  backgroundPosition: "calc(100% - 15px) 12px, calc(100% - 11px) 12px",
};

const PERIODS = [
  { value: "", label: "Any time" },
  { value: "1", label: "Today" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
] as const;

const CHANGES: Array<{ value: "" | ActivityAction; label: string }> = [
  { value: "", label: "Any change" },
  { value: "created", label: "Created" },
  { value: "updated", label: "Updated" },
  { value: "deleted", label: "Deleted" },
];

function periodStart(period: string): string | undefined {
  if (!period) return undefined;
  const start = new Date();
  start.setDate(start.getDate() - (Number(period) - 1));
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}

/** The address is the page's state: view, filters and the open row (`?n=`). */
function useActivityParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const rawView = params.get("view");
  const view: View = VIEWS.includes(rawView as View) ? (rawView as View) : "needs";
  const set = React.useCallback(
    (next: Record<string, string | null>) => {
      const merged = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(next)) {
        if (value === null || value === "") merged.delete(key);
        else merged.set(key, value);
      }
      const query = merged.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );
  return {
    view,
    module: params.get("module") ?? "",
    open: params.get("n"),
    person: params.get("person") ?? "",
    change: params.get("change") ?? "",
    period: params.get("period") ?? "",
    q: params.get("q") ?? "",
    set,
  };
}

/**
 * /activity: the full inbox. Needs you, Mentions and Everything are the
 * reader's notifications; Workspace is the workspace's audit trail, for its
 * managers. A row opens one level deeper, in the drawer; the drawer's one
 * action opens the record in its module.
 *
 * Keys: J and K move, ↵ opens, E marks read.
 */
export function ActivityInbox() {
  const state = useActivityParams();
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const admin = isOrgAdminRole(role);
  const now = useNow();
  const { markRead, markAll } = useInboxMutations();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const workspace = state.view === "workspace";
  const inboxView: InboxView = state.view === "workspace" ? "all" : state.view;
  const inboxModule = isInboxModule(state.module) ? state.module : null;

  /* ---- the reader's notifications ---- */
  const inbox = useInfiniteQuery({
    queryKey: ["notifications", "inbox", "page", inboxView, inboxModule],
    queryFn: ({ pageParam }) => fetchInbox({ view: inboxView, module: inboxModule, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => last.nextPage,
    enabled: !workspace,
  });
  const items = React.useMemo(() => inbox.data?.pages.flatMap((page) => page.items) ?? [], [inbox.data]);
  const counts = inbox.data?.pages[0]?.counts;

  /* ---- the workspace trail ---- */
  const [searchDraft, setSearchDraft] = React.useState(state.q);
  const debounced = useDebounced(searchDraft.trim(), 300);
  const setParams = state.set;
  const lastPushed = React.useRef(debounced);
  React.useEffect(() => {
    if (lastPushed.current === debounced) return;
    lastPushed.current = debounced;
    setParams({ q: debounced || null });
  }, [debounced, setParams]);

  const from = React.useMemo(() => periodStart(state.period), [state.period]);
  const trailFilters: ActivityLogFilters = {
    actorId: state.person || undefined,
    module: workspace && state.module ? state.module : undefined,
    action: (state.change || undefined) as ActivityAction | undefined,
    from,
    q: state.q || undefined,
  };
  const trail = useInfiniteQuery({
    queryKey: ["activity", "log", trailFilters],
    queryFn: ({ pageParam }) => fetchActivityPage(trailFilters, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: workspace && admin,
  });
  const entries = React.useMemo(() => trail.data?.pages.flatMap((page) => page.entries) ?? [], [trail.data]);
  const people = useQuery({
    queryKey: ["activity", "people"],
    queryFn: fetchActivityPeople,
    staleTime: 5 * 60_000,
    enabled: workspace && admin,
  });

  /* ---- rows, selection and keys ---- */
  const rows: RowModel[] = React.useMemo(
    () => (workspace ? entries.map(rowFromEntry) : items.map(rowFromItem)),
    [workspace, entries, items],
  );
  const groups = React.useMemo(() => groupByDay(rows, now), [rows, now]);
  const order = React.useMemo(() => groups.flatMap((group) => group.items.map((row) => row.id)), [groups]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const refs = React.useRef(new Map<string, HTMLElement>());

  const move = (step: number) => {
    if (order.length === 0) return;
    const at = cursor ? order.indexOf(cursor) : -1;
    const next = order[Math.min(order.length - 1, Math.max(0, at + step))] ?? order[0]!;
    setCursor(next);
    refs.current.get(next)?.focus();
    refs.current.get(next)?.scrollIntoView({ block: "nearest" });
  };
  useShortcut("J", () => move(1));
  useShortcut("K", () => move(-1));
  useShortcut(
    "E",
    () => {
      const target = state.open ?? cursor;
      const item = items.find((entry) => entry.id === target);
      if (item && !item.isRead) markRead.mutate([item.id]);
    },
    { enabled: !workspace, inDialog: true },
  );

  const openRow = (id: string) => {
    setCursor(id);
    state.set({ n: id });
  };
  const closeDrawer = () => {
    state.set({ n: null });
    if (cursor) window.setTimeout(() => refs.current.get(cursor)?.focus(), 0);
  };

  /* ---- the drawer ---- */
  const detail = useQuery({
    queryKey: ["notifications", "inbox", "detail", state.open],
    queryFn: () => fetchInboxDetail(state.open!),
    enabled: !!state.open && !workspace,
  });
  const openedUnread = detail.data && !detail.data.isRead ? detail.data.id : null;
  React.useEffect(() => {
    // Opening a notification reads it.
    if (openedUnread) markRead.mutate([openedUnread]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opened row
  }, [openedUnread]);

  const archive = useMutation({
    mutationFn: (id: string) => archiveInbox([id]),
    onSuccess: () => {
      closeDrawer();
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => toast({ title: "It was not archived", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  /* ---- states ---- */
  const featureOff = inbox.error instanceof ApiError && inbox.error.status === 403;
  const active = workspace ? trail : inbox;
  const filtered = workspace
    ? !!(state.person || state.module || state.change || state.period || state.q)
    : !!inboxModule;

  const viewItems = [
    { value: "needs" as const, label: "Needs you", count: counts && counts.needs > 0 ? counts.needs : undefined },
    { value: "mentions" as const, label: "Mentions" },
    { value: "all" as const, label: "Everything" },
    ...(admin ? [{ value: "workspace" as const, label: "Workspace" }] : []),
  ];

  let body: React.ReactNode;
  if (workspace && !admin) {
    body = (
      <Empty icon="lock" title="Only managers can see the workspace's activity">
        Ask a manager or the workspace owner if you need a change traced.
      </Empty>
    );
  } else if (featureOff) {
    body = (
      <Empty icon="lock" title="Notifications are off for this workspace">
        The workspace owner can turn them on in Management.
      </Empty>
    );
  } else if (active.isLoading) {
    body = <InboxSkeleton rows={8} />;
  } else if (active.isError && rows.length === 0) {
    body = (
      <Empty
        icon="warn"
        title={workspace ? "The workspace's activity did not load" : "Your notifications did not load"}
        action={
          <Button icon="history" onClick={() => void active.refetch()}>
            Try again
          </Button>
        }
      >
        {getApiErrorMessage(active.error, "Check the connection and try again.")}
      </Empty>
    );
  } else if (rows.length === 0) {
    body = filtered ? (
      <Empty icon="filter" title="Nothing matches these filters" action={<Button onClick={() => state.set({ module: null, person: null, change: null, period: null, q: null })}>Clear filters</Button>} />
    ) : state.view === "needs" ? (
      <Empty icon="check" title="Nothing needs you">
        Approvals, mentions and anything waiting on you arrive here.
      </Empty>
    ) : state.view === "mentions" ? (
      <Empty icon="at" title="No mentions">
        When someone names you on a record, it shows here.
      </Empty>
    ) : workspace ? (
      <Empty icon="activity" title="No activity recorded yet">
        Every change people make in the workspace is kept here.
      </Empty>
    ) : (
      <Empty icon="bell" title="No notifications yet">
        What happens to your records arrives here.
      </Empty>
    );
  } else {
    body = (
      <>
        {groups.map((group) => (
          <section key={group.key} aria-labelledby={`day-${group.key}`}>
            <div className={styles.day}>
              <h2 id={`day-${group.key}`}>{group.label}</h2>
            </div>
            <ul className={styles.list}>
              {group.items.map((row) => {
                const item = workspace ? null : items.find((entry) => entry.id === row.id) ?? null;
                return (
                  <InboxRow
                    key={row.id}
                    ref={(element) => {
                      if (element) refs.current.set(row.id, element);
                      else refs.current.delete(row.id);
                    }}
                    row={row}
                    now={now}
                    selected={state.open === row.id || cursor === row.id}
                    onFocus={() => setCursor(row.id)}
                    onActivate={() => openRow(row.id)}
                    onMarkRead={item && !item.isRead ? () => markRead.mutate([item.id]) : undefined}
                    onOpen={item && !item.isRead ? () => markRead.mutate([item.id]) : undefined}
                  />
                );
              })}
            </ul>
          </section>
        ))}
        {active.hasNextPage ? (
          <div className={styles.more}>
            <Button variant="quiet" icon="down" busy={active.isFetchingNextPage} onClick={() => void active.fetchNextPage()}>
              Show more
            </Button>
          </div>
        ) : null}
        <p className={styles.keys}>
          <kbd>J</kbd> and <kbd>K</kbd> move, <kbd>↵</kbd> opens{workspace ? "" : <>, <kbd>E</kbd> marks read</>}.
        </p>
      </>
    );
  }

  const openEntry: ActivityLogEntry | null = workspace && state.open ? (entries.find((entry) => entry.id === state.open) ?? null) : null;

  return (
    <>
      <PageChrome title="Activity" />
      <Kit className="kit-main">
        <div className="mn">
          <div className={styles.page}>
            <div className={styles.toolbar}>
              <div className={styles.views}>
              <Segmented<View>
                label="Show"
                value={state.view}
                onChange={(view) => {
                  setCursor(null);
                  state.set({ view: view === "needs" ? null : view, module: null, n: null, person: null, change: null, period: null, q: null });
                  setSearchDraft("");
                }}
                items={viewItems}
              />
              </div>
              <div className="end">
                {workspace && admin ? (
                  <>
                    <Input type="search" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Search records" aria-label="Search the workspace's activity" style={{ width: 180, height: 32, fontSize: "var(--text-13)" }} />
                    <Select style={SELECT_STYLE} aria-label="Person" value={state.person} onChange={(event) => state.set({ person: event.target.value || null })}>
                      <option value="">Anyone</option>
                      {(people.data?.people ?? []).map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.name}
                        </option>
                      ))}
                    </Select>
                    <Select style={SELECT_STYLE} aria-label="Module" value={state.module} onChange={(event) => state.set({ module: event.target.value || null })}>
                      <option value="">Any module</option>
                      {AREA_OPTIONS.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                    <Select style={SELECT_STYLE} aria-label="Change" value={state.change} onChange={(event) => state.set({ change: event.target.value || null })}>
                      {CHANGES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                    <Select style={SELECT_STYLE} aria-label="Period" value={state.period} onChange={(event) => state.set({ period: event.target.value || null })}>
                      {PERIODS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                    <Button
                      variant="quiet"
                      icon="export"
                      onClick={() => {
                        const params = new URLSearchParams();
                        for (const [key, value] of Object.entries(trailFilters)) if (value) params.set(key, value);
                        window.location.assign(`/api/activity/export?${params.toString()}`);
                      }}
                    >
                      Export
                    </Button>
                  </>
                ) : workspace ? null : (
                  <>
                    <Select style={SELECT_STYLE} aria-label="Module" value={inboxModule ?? ""} onChange={(event) => state.set({ module: event.target.value || null, n: null })}>
                      <option value="">Every module</option>
                      {INBOX_MODULE_OPTIONS.map(([value, meta]) => (
                        <option key={value} value={value}>
                          {meta.label}
                        </option>
                      ))}
                    </Select>
                    <Button variant="quiet" icon="check" disabled={!counts || counts.unread === 0 || markAll.isPending} onClick={() => markAll.mutate()}>
                      Mark all read
                    </Button>
                  </>
                )}
              </div>
            </div>
            <div className={styles.column}>{body}</div>
          </div>
        </div>
      </Kit>

      {workspace ? (
        <TrailDrawer entry={openEntry} open={!!state.open} onOpenChange={(open) => (open ? null : closeDrawer())} />
      ) : (
        <InboxDrawerView
          open={!!state.open}
          onOpenChange={(open) => (open ? null : closeDrawer())}
          detail={detail.data ?? null}
          loading={detail.isLoading}
          error={detail.isError ? getApiErrorMessage(detail.error) : null}
          onRetry={() => void detail.refetch()}
          onArchive={() => state.open && archive.mutate(state.open)}
          archiving={archive.isPending}
        />
      )}
    </>
  );
}

