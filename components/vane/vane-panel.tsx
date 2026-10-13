"use client";

import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { Empty, Kit } from "@/components/core";
import { useShell } from "@/components/layout/shell-state";
import { VANE_SETTINGS_ROLES } from "@/lib/vane/roles";

import { moduleForPath, useVaneActions, useVanePanel } from "./use-vane";
import { isVanePath } from "./vane-nav";
import { VanePanelView } from "./vane-panel-view";

/** The Vane panel beside the page, fed from the workspace. Not beside Vane's own pages, which are what it shows. */
export function VanePanel() {
  const shell = useShell();
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const pageModule = moduleForPath(pathname);
  const onVane = isVanePath(pathname);
  const { data, isError } = useVanePanel(pageModule, shell.vaneOpen && !onVane);
  const { notNow, act, giveJob, pause } = useVaneActions();
  const close = () => shell.setVaneOpen(false);

  if (!shell.vaneOpen || onVane) return null;
  return (
    <Kit className="vane-col">
      {data ? (
        <VanePanelView
          panel={data}
          canPause={VANE_SETTINGS_ROLES.includes(session?.user?.role ?? "")}
          onPause={(paused) => pause.mutate(paused)}
          onClose={close}
          onAct={(card, target) => {
            // The card's own act goes to Done with this person's name; "Read them first" only looks.
            if (!target) act.mutate({ id: card.id });
            const to = target ?? card.action?.target;
            if (to) router.push(to);
          }}
          onNotNow={(card) => notNow.mutate({ id: card.id })}
          onGiveJob={(text) => giveJob.mutate(text)}
          giving={giveJob.isPending}
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
