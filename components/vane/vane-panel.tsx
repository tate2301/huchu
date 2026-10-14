"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";

import { Empty, Kit } from "@/components/core";
import { useShell } from "@/components/layout/shell-state";
import { VANE_SETTINGS_ROLES } from "@/lib/vane/roles";

import { moduleForPath, useVaneActions, useVaneJob, useVanePanel } from "./use-vane";
import { VaneExplainAnswer } from "./vane-explain";
import { VanePanelView } from "./vane-panel-view";

import "./vane.css";

/**
 * The Vane panel beside the page, fed from the workspace. An address with
 * `?vane=1` opens it; with `?explain=<job>` it opens on Vane's answer to a
 * figure someone asked about (PageVaneReport).
 */
export function VanePanel() {
  const shell = useShell();
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const { data: session } = useSession();
  const pageModule = moduleForPath(pathname);
  const explainId = search.get("explain");
  const asked = Boolean(explainId) || search.get("vane") === "1";
  const { setVaneOpen } = shell;
  React.useEffect(() => {
    if (asked) setVaneOpen(true);
  }, [asked, setVaneOpen]);

  const open = shell.vaneOpen || asked;
  const { data, isError } = useVanePanel(pageModule, open);
  const explained = useVaneJob(explainId);
  const { notNow, giveJob, pause } = useVaneActions();
  const close = () => {
    shell.setVaneOpen(false);
    if (asked) {
      const next = new URLSearchParams(search.toString());
      next.delete("explain");
      next.delete("vane");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  };

  if (!open) return null;
  const onAct = (card: { action?: { target?: string } | null }, target?: string) => {
    const to = target ?? card.action?.target;
    if (to) router.push(to);
  };
  return (
    <Kit className="vane-col">
      {data ? (
        <VanePanelView
          panel={data}
          canPause={VANE_SETTINGS_ROLES.includes(session?.user?.role ?? "")}
          onPause={(paused) => pause.mutate(paused)}
          onClose={close}
          onAct={onAct}
          onNotNow={(card) => notNow.mutate({ id: card.id })}
          onGiveJob={(text) => giveJob.mutate(text)}
          giving={giveJob.isPending}
          answer={
            explainId ? (
              <VaneExplainAnswer
                job={explained.data}
                failed={explained.isError}
                onRetry={() => void explained.refetch()}
                onAct={onAct}
                onNotNow={(card) => notNow.mutate({ id: card.id }, { onSettled: () => void explained.refetch() })}
              />
            ) : undefined
          }
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
