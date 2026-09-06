"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { IconButton } from "@corelithzw/ui/components/icon-button";
import { useSidebar } from "@corelithzw/ui/components/sidebar";
import { fetchJson } from "@/lib/api-client";
import { navSections } from "@/lib/navigation";
import { filterNavSectionsByEnabledFeatures } from "@/lib/platform/gating/nav-filter";
import { resolveViewIcon } from "@corelithzw/ui/lib/ui/view-icons";
import {
  AddressBook,
  ArrowRight,
  Building2,
  Checklist,
  Coins,
  Funnel,
  HelpCircle,
  Home,
  LocalShipping,
  ManageAccounts,
  MapPin,
  MedusaBookOpenIcon,
  Package,
  PanelLeft,
  Receipt,
  Scale,
  Search,
  Settings2,
  TableRows,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "@corelithzw/ui/lib/icons";
import type { SearchResult, SearchResultType } from "@/lib/records/search-result";

import { CommandBar } from "./command-bar";
import type { CommandGroup, CommandItem } from "./command-bar-types";
import {
  ActionPreview,
  DateChip,
  MeetingPreview,
  RecordPreview,
  type MeetingPreviewData,
} from "./command-previews";

type SearchGroup = { type: SearchResultType; label: string; results: SearchResult[] };

// The same icons `RecordMark` draws for these kinds, so a pupil looks like a
// pupil whether you found her in the search box or opened her from a register.
const TYPE_ICONS: Record<SearchResultType, LucideIcon> = {
  EMPLOYEE: ManageAccounts,
  SHIFT_GROUP: Users,
  PERSON: Users,
  COMPANY: Building2,
  DEAL: Funnel,
  LEAD: AddressBook,
  SITE: MapPin,
  QUOTATION: Receipt,
  INVOICE: Receipt,
  RECEIPT: Receipt,
  PRODUCT: Package,
  CUSTOMER: Wallet,
  STUDENT: Users,
  GUARDIAN: Users,
  TEACHER: ManageAccounts,
  CLASS: TableRows,
  SUBJECT: MedusaBookOpenIcon,
  HOSTEL: Home,
  GOLD_POUR: Coins,
  // A gold purchase is weighed in, so it takes the scales rather than the coin:
  // the row beside it in the results is the pour, and two coins would be one
  // icon doing no work.
  GOLD_PURCHASE: Scale,
  GOLD_DISPATCH: LocalShipping,
  RETAIL_SALE: Receipt,
  INVENTORY_ITEM: Package,
  EQUIPMENT: Settings2,
  WORK_ORDER: Wrench,
};

type AppointmentRow = {
  id: string;
  appointmentNo: string;
  title: string;
  status: string;
  scheduledStart: string;
  scheduledEnd: string | null;
  location: string | null;
  notes: string | null;
  client: { id: string; name: string } | null;
  assignedTo: { id: string; name: string | null } | null;
};

const RECENT_KEY = "crm.search.recent";
const MAX_RECENT = 6;

type RecentEntry = {
  href: string;
  title: string;
  subtitle: string | null;
  type: SearchResultType;
};

function loadRecents(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as RecentEntry[]).slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function rememberRecent(entry: RecentEntry) {
  if (typeof window === "undefined") return;
  try {
    const existing = loadRecents().filter((item) => item.href !== entry.href);
    window.localStorage.setItem(
      RECENT_KEY,
      JSON.stringify([entry, ...existing].slice(0, MAX_RECENT)),
    );
  } catch {
    // A full or blocked localStorage should not break search.
  }
}

/** "In 10 minutes", "Started 5 minutes ago" — the only bit of a meeting that changes while you look at it. */
function relativeStart(iso: string, now: number): string {
  const minutes = Math.round((new Date(iso).getTime() - now) / 60_000);
  if (minutes > 90) return `In ${Math.round(minutes / 60)} hours`;
  if (minutes > 1) return `In ${minutes} minutes`;
  if (minutes >= -1) return "Now";
  if (minutes > -60) return `Started ${Math.abs(minutes)} minutes ago`;
  return "Earlier today";
}

/**
 * Everything the command bar can offer, assembled.
 *
 * Four sources, in the order somebody needs them: what is happening now, what
 * they typed, the things they create most, and the app's own switches. The
 * order is fixed rather than ranked because a bar whose first row moves around
 * is one you have to read before pressing Enter — and the whole point of the
 * first row is that you do not.
 */
export function GlobalCommandBar() {
  const router = useRouter();
  const { data: session } = useSession();
  const { toggleSidebar } = useSidebar();

  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [recents, setRecents] = React.useState<RecentEntry[]>([]);
  // One instant per opening, so "in 10 minutes" does not tick while reading
  // and React's purity rule is not broken by a Date.now() in render.
  const [now, setNow] = React.useState(0);

  /**
   * Open and close in one place, and **clear the query on the way out**.
   *
   * Clearing on the way *in* is the obvious version and it is wrong: the app-bar
   * input's `onChange` sets the query and opens the bar in the same event, so a
   * reset that runs on opening lands after the seed and eats the first
   * keystroke. Typing "Moyo" searched "oyo" — which `contains` quietly rescued —
   * and typing "EMP-001" searched "MP-001", which it did not.
   *
   * Clearing on close gets both cases with no handover at all: ⌘K opens onto an
   * empty field because the last close emptied it, and a keystroke in the app bar
   * opens onto exactly what was typed.
   */
  const changeOpen = React.useCallback((next: boolean) => {
    setOpen(next);
    if (next) {
      setRecents(loadRecents());
    } else {
      setQuery("");
      setDebounced("");
    }
  }, []);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        changeOpen(!open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, changeOpen]);

  React.useEffect(() => {
    if (open) setNow(Date.now());
  }, [open]);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(timer);
  }, [query]);

  const searchQuery = useQuery({
    queryKey: ["global-search", debounced],
    queryFn: () =>
      fetchJson<{ groups: SearchGroup[]; total: number }>(
        `/api/v2/records/search?q=${encodeURIComponent(debounced)}`,
      ),
    enabled: open && debounced.length >= 2,
    placeholderData: (previous) => previous,
  });

  const enabledFeatures = (session?.user as { enabledFeatures?: string[] } | undefined)
    ?.enabledFeatures;

  // Which modules this tenant actually has. The bar is one component on every
  // page of every module, and until S-4.5 its every band was a CRM band: a
  // school's bursar pressing ⌘K was offered "New deal" and a NOW band fed by
  // `/api/v2/crm/appointments`, which her tenant answers with 403 because the
  // prefix is gated on `crm.core`. Search is now module-neutral; these are the
  // parts that cannot be, so they are asked for only where they exist.
  const hasCrm = (enabledFeatures ?? []).includes("crm.core");
  const hasSchools = (enabledFeatures ?? []).some((feature) => feature.startsWith("schools."));

  // Today's appointments, for the NOW band. Asked for only while the bar is
  // open: it is a band at the top of a palette, not a reason to poll.
  const todayQuery = useQuery({
    queryKey: ["command-bar", "today"],
    queryFn: () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      return fetchJson<{ data: AppointmentRow[] }>(
        `/api/v2/crm/appointments?from=${start.toISOString()}&to=${end.toISOString()}`,
      );
    },
    enabled: open && hasCrm,
    staleTime: 60_000,
  });

  const go = React.useCallback(
    (href: string, entry?: RecentEntry) => {
      if (entry) rememberRecent(entry);
      router.push(href);
    },
    [router],
  );

  const needle = debounced.toLowerCase();

  const groups = React.useMemo<CommandGroup[]>(() => {
    const built: CommandGroup[] = [];
    const matches = (text: string) =>
      needle.length < 2 || text.toLowerCase().includes(needle);

    // 1. What is happening now.
    const upcoming = (todayQuery.data?.data ?? [])
      .filter((appointment) => {
        const start = new Date(appointment.scheduledStart).getTime();
        // The last hour and the next four: a meeting you are late for is as
        // relevant as one you are early for.
        return start > now - 60 * 60_000 && start < now + 4 * 60 * 60_000;
      })
      .filter((appointment) => matches(appointment.title))
      .slice(0, 3);

    if (upcoming.length > 0) {
      built.push({
        id: "now",
        label: "Now",
        items: upcoming.map((appointment): CommandItem => {
          const meeting: MeetingPreviewData = {
            title: appointment.title,
            startsAt: appointment.scheduledStart,
            endsAt: appointment.scheduledEnd,
            location: appointment.location,
            locality: appointment.client?.name ?? null,
            description: appointment.notes,
            link: null,
            status: appointment.status.toLowerCase(),
            participants: appointment.assignedTo?.name
              ? [
                  {
                    id: appointment.assignedTo.id,
                    name: appointment.assignedTo.name,
                    email: null,
                    attending: true,
                  },
                ]
              : [],
          };

          return {
            id: `appointment-${appointment.id}`,
            group: "now",
            label: appointment.title,
            mark: <DateChip value={appointment.scheduledStart} />,
            hint: relativeStart(appointment.scheduledStart, now),
            dot: "success",
            preview: <MeetingPreview meeting={meeting} />,
            primary: {
              label: "Open visit",
              run: () => go(`/crm/appointments?open=${appointment.id}`),
            },
            secondary: {
              label: "Create note",
              run: () =>
                go(
                  appointment.client
                    ? `/crm/companies/${appointment.client.id}`
                    : "/crm/appointments",
                ),
            },
          };
        }),
      });
    }

    // 2. What they typed.
    for (const group of searchQuery.data?.groups ?? []) {
      if (group.results.length === 0) continue;
      built.push({
        id: `search-${group.type}`,
        label: group.label,
        items: group.results.slice(0, 5).map((result): CommandItem => {
          const entry: RecentEntry = {
            href: result.href,
            title: result.title,
            subtitle: result.subtitle,
            type: result.type,
          };
          return {
            id: `result-${result.type}-${result.id}`,
            group: group.label,
            label: result.title,
            icon: TYPE_ICONS[result.type],
            hint: result.reference,
            preview: (
              <RecordPreview
                record={{
                  title: result.title,
                  typeLabel: group.label,
                  reference: result.reference,
                  subtitle: result.subtitle,
                  facts: result.facts,
                }}
              />
            ),
            primary: { label: "Open", run: () => go(result.href, entry) },
          };
        }),
      });
    }

    // 3. Where they were, when they have not typed.
    if (needle.length < 2 && recents.length > 0) {
      built.push({
        id: "recent",
        label: "Recently viewed",
        items: recents.map((entry): CommandItem => ({
          id: `recent-${entry.href}`,
          group: "recent",
          label: entry.title,
          icon: TYPE_ICONS[entry.type] ?? ArrowRight,
          hint: entry.subtitle,
          preview: (
            <RecordPreview
              record={{
                title: entry.title,
                typeLabel: "Recently viewed",
                reference: null,
                subtitle: entry.subtitle,
                facts: [],
              }}
            />
          ),
          primary: { label: "Open", run: () => go(entry.href, entry) },
        })),
      });
    }

    // 4. The things people make. Per module, because a shortcut to a page the
    // tenant's gating refuses is a shortcut to /access-blocked.
    const creates: Array<{ label: string; href: string; icon: LucideIcon }> = [
      ...(hasCrm
        ? [
            { label: "New task", href: "/crm/tasks?new=1", icon: Checklist },
            { label: "New deal", href: "/crm/deals?new=1", icon: Funnel },
            { label: "New person", href: "/crm/people?new=1", icon: Users },
            { label: "New company", href: "/crm/companies?new=1", icon: Building2 },
            { label: "Search tasks", href: "/crm/tasks", icon: Search },
          ]
        : []),
      ...(hasSchools
        ? [
            // Lists rather than forms: a pupil is admitted through admissions
            // (S-1.4), not through a "new student" dialog, and a shortcut that
            // promises a form nobody wrote is worse than none.
            { label: "Students", href: "/schools/students", icon: Users },
            { label: "Admissions", href: "/schools/admissions", icon: AddressBook },
            { label: "Classes", href: "/schools/classes", icon: TableRows },
            { label: "Subjects", href: "/schools/subjects", icon: MedusaBookOpenIcon },
            { label: "Staff", href: "/schools/teachers", icon: ManageAccounts },
          ]
        : []),
    ].filter((entry) => matches(entry.label));

    if (creates.length > 0) {
      built.push({
        id: "create",
        // "Shortcuts" rather than "Tasks suggestions": the group holds whatever
        // the tenant's module offers — forms in the CRM, registers in a school —
        // and none of a school's are tasks.
        label: "Shortcuts",
        items: creates.map((entry): CommandItem => ({
          id: `create-${entry.href}`,
          group: "create",
          label: entry.label,
          icon: entry.icon,
          preview: (
            <ActionPreview
              icon={entry.icon}
              title={entry.label}
              body="Opens the page with its form ready."
            />
          ),
          primary: { label: "Go", run: () => go(entry.href) },
        })),
      });
    }

    // 5. Everywhere they may go.
    const destinations = filterNavSectionsByEnabledFeatures(navSections, enabledFeatures)
      .flatMap((section) =>
        section.items.map((item) => ({
          href: item.href,
          label: item.label,
          section: section.title,
        })),
      )
      .filter((destination) => matches(`${destination.label} ${destination.section}`))
      .slice(0, needle.length < 2 ? 0 : 6);

    if (destinations.length > 0) {
      built.push({
        id: "pages",
        label: "Pages",
        items: destinations.map((destination): CommandItem => {
          const Icon = resolveViewIcon(destination.href, destination.label);
          return {
            id: `page-${destination.href}`,
            group: "pages",
            label: destination.label,
            icon: Icon,
            hint: destination.section,
            preview: (
              <ActionPreview
                icon={Icon}
                title={destination.label}
                body={`In ${destination.section}.`}
              />
            ),
            primary: { label: "Go", run: () => go(destination.href) },
          };
        }),
      });
    }

    // 6. The app's own switches.
    const generalItems: CommandItem[] = [
      {
        id: "action-sidebar",
        group: "general",
        label: "Collapse sidebar",
        icon: PanelLeft,
        preview: (
          <ActionPreview
            icon={PanelLeft}
            title="Collapse sidebar"
            body="Gives the page its full width. The same key brings it back."
          />
        ),
        primary: { label: "Collapse", run: toggleSidebar },
      },
      {
        id: "action-help",
        group: "general",
        label: "Open help",
        icon: HelpCircle,
        preview: (
          <ActionPreview
            icon={HelpCircle}
            title="Open help"
            body="Guides, shortcuts and what each module does."
          />
        ),
        primary: { label: "Open", run: () => go("/help") },
      },
      {
        id: "action-advanced-search",
        group: "general",
        label: "Advanced search",
        icon: Search,
        preview: (
          <ActionPreview
            icon={Search}
            title="Advanced search"
            body="The full search page, with filters and saved queries."
          />
        ),
        // Where "everything, with filters" lives depends on what the tenant
        // has: a school's is the student register, not the CRM's lead list.
        primary: { label: "Open", run: () => go(hasSchools && !hasCrm ? "/schools/students" : "/crm/leads") },
      },
    ];
    const general = generalItems.filter(
      (item) => needle.length < 2 || `${item.label} ${item.keywords ?? ""}`.toLowerCase().includes(needle),
    );

    if (general.length > 0) {
      built.push({ id: "general", label: "General suggestions", items: general });
    }

    return built;
  }, [
    enabledFeatures,
    go,
    hasCrm,
    hasSchools,
    needle,
    now,
    recents,
    searchQuery.data,
    todayQuery.data,
    toggleSidebar,
  ]);

  return (
    <>
      {/*
        A phone gets the icon, everything else gets the box.
        ===================================================
        The comment here used to claim "on mobile the icon alone opens the bar",
        but the input rendered at every width — 144px of it, plus a bell and a
        primary action, on a 390px bar. What gave way was the page title, which
        is the one thing in that bar nothing else on the screen says: every CRM
        page with a "New …" button showed "C…" where its name should be.

        So there are two triggers into one bar. Which is not the same as two
        searches: both hand their text to the `CommandBar` below, so there is
        one query, one result shape and one keyboard contract.
      */}
      <IconButton
        aria-label="Search records and actions"
        size="lg"
        className="md:hidden"
        onClick={() => changeOpen(true)}
      >
        <Search />
      </IconButton>

      {/*
        A ghost field, not a bordered box.
        =================================
        The app bar carries one search affordance and the dialog carries the
        real one, so this is a trigger wearing a field's clothes: a filled
        ghost with no outline, which reads as part of the bar rather than as a
        control fenced off inside it. Clicking it opens the bar, whose own
        input autofocuses — one place to type, never two inputs holding two
        different queries.
      */}
      <button
        type="button"
        aria-label="Search records and actions"
        aria-keyshortcuts="Meta+K Control+K"
        onClick={() => changeOpen(true)}
        className="hidden h-9 w-36 items-center gap-2 rounded-[var(--radius-sm)] border-0 bg-[var(--surface-muted)] px-2.5 text-left text-sm text-[var(--text-muted)] outline-none transition-colors hover:bg-[var(--surface-subtle)] hover:text-[var(--text-body)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] md:flex lg:w-64"
      >
        <Search className="size-4 shrink-0 text-[var(--text-subtle)]" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">Search</span>
        <kbd className="hidden shrink-0 font-sans text-sm text-[var(--text-subtle)] lg:inline">
          ⌘K
        </kbd>
      </button>

      <CommandBar
        open={open}
        onOpenChange={changeOpen}
        query={query}
        onQueryChange={setQuery}
        groups={groups}
        loading={searchQuery.isFetching}
        emptyMessage={
          debounced.length >= 2
            ? `Nothing matches “${debounced}”.`
            : "Type to search records, or pick an action."
        }
      />
    </>
  );
}
