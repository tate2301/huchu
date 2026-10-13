"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { Empty, Kit, useShortcut } from "@/components/core";
import { useShell } from "@/components/layout/shell-state";
import { useToast } from "@/components/ui/use-toast";
import { getApiErrorMessage } from "@/lib/api-client";
import type { VaneCard } from "@/lib/vane/panel";
import { VANE_SETTINGS_ROLES } from "@/lib/vane/roles";

import { moduleForPath, useDecideAction, useVaneActions, useVaneAsk, useVaneChat, useVanePanel } from "./use-vane";
import { VanePanelView } from "./vane-panel-view";

/** What a person might ask from the module they are in. */
const MODULE_SUGGESTIONS: Record<string, string[]> = {
  books: ["Which invoices have no due date?", "Who should I chase this week?"],
  crm: ["Which quotes have waited more than a week?", "Which deals went quiet this month?"],
  retail: ["Check last week's cash-ups for shortfalls", "What should we reorder this week?"],
  reports: ["What changed in sales since last month?"],
  people: ["Who has leave due before December?"],
  payroll: ["Check this month's pay run against last month's"],
  schools: ["Which families have paid nothing this term?"],
  gold: ["Why was Mill 1 down this month?"],
};
const ANYWHERE = ["What needs me today?", "What should I do first?", "Get the month's close ready"];

/**
 * What to ask next, always three: about the first card when there is one,
 * then from the module the person is in, then what any page can ask.
 */
export function vaneSuggestions(cards: VaneCard[], pageModule: string | null): string[] {
  const fromCards = cards.slice(0, 1).map((card) => `Help me with: ${card.headline.replace(/\.$/, "")}`);
  const fromModule = pageModule ? (MODULE_SUGGESTIONS[pageModule] ?? []) : [];
  return [...new Set([...fromCards, ...fromModule, ...ANYWHERE])].slice(0, 3);
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
          suggestions={vaneSuggestions(data.items, pageModule)}
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
          onAsk={(text) => void ask(text, pageModule)}
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
