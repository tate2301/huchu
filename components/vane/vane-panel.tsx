"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { Empty, Kit, useShortcut, type IconName } from "@/components/core";
import { useShell } from "@/components/layout/shell-state";
import { useToast } from "@/components/ui/use-toast";
import { getApiErrorMessage } from "@/lib/api-client";
import type { VaneCard } from "@/lib/vane/panel";
import { VANE_SETTINGS_ROLES } from "@/lib/vane/roles";

import { moduleForPath, useDecideAction, useVaneActions, useVaneAsk, useVaneChat, useVanePanel } from "./use-vane";
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

/** On one record's page, the first things to ask are about it. */
const RECORD_PAGES: Array<[RegExp, Array<{ text: string; icon: IconName }>]> = [
  [
    /^\/crm\/deals\/[^/]+$/,
    [
      { text: "What should I do next on this deal?", icon: "foryou" },
      { text: "Draft a quote for this deal from our price list", icon: "docs" },
    ],
  ],
  [
    /^\/crm\/leads\/[^/]+$/,
    [
      { text: "What should I do next with this lead?", icon: "foryou" },
      { text: "Draft a quote for this lead from our price list", icon: "docs" },
    ],
  ],
  [/^\/crm\/companies\/[^/]+$/, [{ text: "What is open with this company?", icon: "foryou" }]],
  [/^\/crm\/people\/[^/]+$/, [{ text: "When did we last hear from this person?", icon: "foryou" }]],
  [/^\/crm\/quotes\/[^/]+$/, [{ text: "Check this quote before it goes", icon: "foryou" }]],
  [/^\/crm\/knowledge\/[^/]+$/, [{ text: "What does this document say we charge?", icon: "docs" }]],
  [/^\/crm\/knowledge$/, [{ text: "What do we charge for our most common jobs?", icon: "docs" }]],
  [/^\/reports\/(built\/|custom\/)?[^/]+$/, [{ text: "What stands out in this report?", icon: "reports" }]],
];

function recordSuggestions(path: string): VaneSuggestion[] {
  const found = RECORD_PAGES.find(([pattern]) => pattern.test(path));
  const area = path.startsWith("/reports") ? "reports" : "crm";
  return found ? found[1].map((row) => ({ ...row, module: area })) : [];
}

/**
 * What to ask next, always three: about the record on screen (a deal's next step, then a quote
 * from the price list), then the first card,
 * then from the module the person is in, then what any page can ask.
 */
export function vaneSuggestions(cards: VaneCard[], pageModule: string | null, path: string | null = null): VaneSuggestion[] {
  const record = path ? recordSuggestions(path) : [];
  const fromCards = cards.slice(0, 1).map<VaneSuggestion>((card) => ({
    text: `Help me with: ${card.headline.replace(/\.$/, "")}`,
    icon: card.kind === "issue" ? "issue" : "suggestion",
    module: card.module,
  }));
  const fromModule = (pageModule ? (MODULE_SUGGESTIONS[pageModule] ?? []) : []).map((row) => ({ ...row, module: pageModule }));
  const all = [...record, ...fromCards, ...fromModule, ...ANYWHERE.map((row) => ({ ...row, module: null }))];
  return all.filter((row, index) => all.findIndex((other) => other.text === row.text) === index).slice(0, 3);
}

/** The Vane panel beside the page, fed from the workspace. Ctrl J opens it at the box, from any page. */
export function VanePanel() {
  const shell = useShell();
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const { data: session } = useSession();
  const pageModule = moduleForPath(pathname);
  const { data, isError } = useVanePanel(pageModule, shell.vaneOpen);
  const chat = useVaneChat(shell.vaneOpen);
  const { ask, working, error } = useVaneAsk();
  const { notNow, act, pause } = useVaneActions();
  const decide = useDecideAction();
  const [focusKey, setFocusKey] = React.useState(0);
  const close = () => shell.setVaneOpen(false);

  useShortcut("Ctrl J", () => {
    shell.setVaneOpen(true);
    setFocusKey((key) => key + 1);
  });

  if (!shell.vaneOpen) return null;
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
