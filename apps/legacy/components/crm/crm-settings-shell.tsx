"use client";

import { useState } from "react";

import { CrmPage } from "@/components/crm/crm-page";
import {
  CrmSettingsContent,
  useActiveSettingsSection,
} from "@/components/crm/crm-settings-content";
import { Button } from "@corelithzw/ui/components/button";
import { Plus } from "@corelithzw/ui/lib/icons";

/**
 * The band names the section you are in, not the module you are in.
 *
 * The artboards title a setup page "Pipelines" with that section's own lede,
 * and the reason is that the band is the only permanent label on the page: the
 * rail highlight scrolls away with the rail on a narrow window, and "CRM setup"
 * is already what the sidebar entry you clicked says. Repeating it in the band
 * spends the one line that never scrolls on information the reader used to get
 * here.
 *
 * The band also carries the section's primary action and "saves as you go".
 * Both belong here rather than in the panel: the action is the one thing you
 * can do on any setup section, so it should sit in the same place on all six,
 * and the note about saving is a property of the page rather than of any panel
 * on it — which is why there is no sticky unsaved bar anywhere below.
 *
 * This exists as a wrapper because the band belongs to `CrmPage`, which sits
 * above the content — and the active section lives in the query string, which
 * only a client component can read. The route itself stays a server component
 * so the session check happens before any of this renders.
 */
export function CrmSettingsShell() {
  const active = useActiveSettingsSection();

  /*
    Which section's create flow is open, rather than whether one is.

    The state is shared by all six panels but the dialogs are not, so a plain
    boolean left over from Pipelines would open the *Custom fields* dialog the
    moment you switched rail entry. Holding the section id instead makes moving
    away close it by derivation — no effect writing state back on navigation.
  */
  const [createFor, setCreateFor] = useState<string | null>(null);
  const createOpen = createFor === active.id;
  const setCreateOpen = (open: boolean) => setCreateFor(open ? active.id : null);

  return (
    <CrmPage
      title={active.label}
      description={active.description}
      bandSlot={
        <>
          <span className="acct-caption hidden sm:inline">saves as you go</span>
          <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden="true" className="size-3.5" />
            {active.addLabel}
          </Button>
        </>
      }
    >
      <CrmSettingsContent createOpen={createOpen} onCreateOpenChange={setCreateOpen} />
    </CrmPage>
  );
}
