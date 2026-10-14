"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";

import { Empty, Kit, useShortcut, type IconName } from "@/components/core";
import { useShell } from "@/components/layout/shell-state";
import { useToast } from "@/components/ui/use-toast";
import { getApiErrorMessage } from "@/lib/api-client";
import type { VaneCard } from "@/lib/vane/panel";
import { VANE_SETTINGS_ROLES } from "@/lib/vane/roles";

import { moduleForPath, useDecideAction, useVaneActions, useVaneAsk, useVaneChat, useVaneExplain, useVanePanel } from "./use-vane";
import { VaneExplainAnswer } from "./vane-explain";
import { VanePanelView } from "./vane-panel-view";

/** A suggestion: what to ask, the icon it shows, and the module whose hue it takes (none: Vane's own). */
export type VaneSuggestion = { text: string; icon: IconName; module: string | null };

/** What a person might ask from the module they are in. */
const MODULE_SUGGESTIONS: Record<string, Array<{ text: string; icon: IconName }>> = {
  books: [
    { text: "Which invoices have no due date?", icon: "invoice" },
    { text: "Who should I chase this week?", icon: "remind" },
  ],
  crm: [
    { text: "Which quotes have waited more than a week?", icon: "docs" },
    { text: "Which deals went quiet this month?", icon: "pipeline" },
  ],
  retail: [
    { text: "Check last week's cash-ups for shortfalls", icon: "takings" },
    { text: "What should we reorder this week?", icon: "store" },
  ],
  reports: [{ text: "What changed in sales since last month?", icon: "reports" }],
  people: [{ text: "Who has leave due before December?", icon: "calendar" }],
  payroll: [{ text: "Check this month's pay run against last month's", icon: "money" }],
  schools: [{ text: "Which families have paid nothing this term?", icon: "users" }],
  gold: [{ text: "Why was Mill 1 down this month?", icon: "insights" }],
};
const ANYWHERE: Array<{ text: string; icon: IconName }> = [
  { text: "What needs me today?", icon: "foryou" },
  { text: "What should I do first?", icon: "list" },
  { text: "Get the month's close ready", icon: "calendar" },
];

/** On one CRM record's page, the first thing to ask is about it. */
const RECORD_PAGES: Array<[RegExp, string]> = [
  [/^\/crm\/deals\/[^/]+$/, "What should I do next on this deal?"],
  [/^\/crm\/leads\/[^/]+$/, "What should I do next with this lead?"],
  [/^\/crm\/companies\/[^/]+$/, "What is open with this company?"],
  [/^\/crm\/people\/[^/]+$/, "When did we last hear from this person?"],
  [/^\/crm\/quotes\/[^/]+$/, "Check this quote before it goes"],
];

function recordSuggestion(path: string): VaneSuggestion | null {
  const found = RECORD_PAGES.find(([pattern]) => pattern.test(path));
  return found ? { text: found[1], icon: "foryou", module: "crm" } : null;
}

/**
 * What to ask next, always three: about the record on screen, then the first card,
 * then from the module the person is in, then what any page can ask.
 */
export function vaneSuggestions(cards: VaneCard[], pageModule: string | null, path: string | null = null): VaneSuggestion[] {
  const record = path ? recordSuggestion(path) : null;
  const fromCards = cards.slice(0, 1).map<VaneSuggestion>((card) => ({
    text: `Help me with: ${card.headline.replace(/\.$/, "")}`,
    icon: card.kind === "issue" ? "issue" : "suggestion",
    module: card.module,
  }));
  const fromModule = (pageModule ? (MODULE_SUGGESTIONS[pageModule] ?? []) : []).map((row) => ({ ...row, module: pageModule }));
  const all = [...(record ? [record] : []), ...fromCards, ...fromModule, ...ANYWHERE.map((row) => ({ ...row, module: null }))];
  return all.filter((row, index) => all.findIndex((other) => other.text === row.text) === index).slice(0, 3);
}

/**
 * The Vane panel beside the page, fed from the workspace. Ctrl J opens it at
 * the box, from any page. An address with `?explain=<job>` opens it on Vane's
 * answer to a figure someone asked about on a report (PageVaneReport), and
 * one with `?vane=open` opens it beside the page.
 */
export function VanePanel() {
  const shell = useShell();
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const explainId = search.get("explain");
  // `?vane=open`: a link that opens the page with Vane beside it (Vane's drafts, PageVaneRetail).
  const openedByLink = search.get("vane") === "open";
  const { setVaneOpen } = shell;
  React.useEffect(() => {
    if (explainId || openedByLink) setVaneOpen(true);
  }, [explainId, openedByLink, setVaneOpen]);
  const explained = useVaneExplain(explainId);
  const { toast } = useToast();
  const { data: session } = useSession();
  const pageModule = moduleForPath(pathname);
  const open = shell.vaneOpen || Boolean(explainId);
  const { data, isError } = useVanePanel(pageModule, open);
  const chat = useVaneChat(open);
  const { ask, working, error } = useVaneAsk();
  const { notNow, act, pause } = useVaneActions();
  const decide = useDecideAction();
  const [focusKey, setFocusKey] = React.useState(0);
  const close = () => {
    shell.setVaneOpen(false);
    // Closed, the answer leaves the address too, so it does not open again on its own.
    if (explainId || openedByLink) {
      const next = new URLSearchParams(search.toString());
      next.delete("explain");
      next.delete("vane");
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }
  };

  useShortcut("Ctrl J", () => {
    shell.setVaneOpen(true);
    setFocusKey((key) => key + 1);
  });

  if (!open) return null;
  return (
    <Kit className="vane-col">
      {data ? (
        <VanePanelView
          panel={data}
          chat={chat.data ?? []}
          suggestions={vaneSuggestions(data.items, pageModule, pathname)}
          working={working}
          askError={error}
          focusKey={focusKey}
          canPause={VANE_SETTINGS_ROLES.includes(session?.user?.role ?? "")}
          deciding={decide.isPending ? (decide.variables?.id ?? null) : null}
          onPause={(paused) => pause.mutate(paused)}
          onClose={close}
          onAct={(card, target) => {
            // The card's own act goes to Done with this person's name; "Read them first" only looks.
            if (!target) act.mutate({ id: card.id });
            const to = target ?? card.action?.target;
            if (to) router.push(to);
          }}
          onMute={(card, reason) => notNow.mutate({ id: card.id, reason })}
          onDecide={(action, decision) =>
            decide.mutate(
              { id: action.id, ...decision },
              {
                onError: (failure) =>
                  toast({
                    title: decision.approve ? "That did not happen" : "Not recorded",
                    description: getApiErrorMessage(failure, "Check the connection and try again."),
                    variant: "destructive",
                  }),
              },
            )
          }
          draft={shell.vaneDraft}
          explain={
            explainId ? (
              <VaneExplainAnswer job={explained.data} failed={explained.isError} onRetry={() => void explained.refetch()} />
            ) : null
          }
          onAsk={(text) => void ask(text, pageModule, pathname)}
        />
      ) : (
        <aside className="ask" aria-label="Vane" aria-busy={!isError}>
          {isError ? (
            <Empty icon="warn" title="Vane's panel did not load">
              Check the connection and open it again.
            </Empty>
          ) : (
            <div className="ask-b">
              <div className="skeleton" style={{ height: 96 }} />
              <div className="skeleton" style={{ height: 96 }} />
            </div>
          )}
        </aside>
      )}
    </Kit>
  );
}
