"use client";

import { useState } from "react";

import { CrmPage } from "@/components/crm/crm-page";
import {
  CrmSettingsContent,
  useActiveSettingsSection,
} from "@/components/crm/crm-settings-content";
import { PageChrome } from "@/components/layout/page-chrome";
import { Button } from "@/components/ui/button";
import { Plus } from "@/lib/icons";

/**
 * The app bar names the section you are in, not the module you are in.
 *
 * "Pipelines", not "CRM setup": the rail highlight scrolls away with the rail
 * on a narrow window, and "Settings" is already what the sidebar entry you
 * clicked says. The bar also carries the section's primary action — the one
 * thing you can do on any setup section sits in the same place on all of
 * them. There is no band under the bar repeating either.
 *
 * This exists as a wrapper because the active section lives in the query
 * string, which only a client component can read. The route itself stays a
 * server component so the session check happens before any of this renders.
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
    <CrmPage>
      <PageChrome title={active.label}>
        {/* A section that is one setting rather than a list has nothing to
            add; its own form holds its one action. */}
        {active.addLabel ? (
          <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden="true" className="size-3.5" />
            {active.addLabel}
          </Button>
        ) : null}
      </PageChrome>
      <CrmSettingsContent createOpen={createOpen} onCreateOpenChange={setCreateOpen} />
    </CrmPage>
  );
}
