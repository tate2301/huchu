"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import {
  FormPage,
  RecordHeader,
  RegisterLayout,
  SettingsRail,
  SettingsSurface,
  type SettingsRailGroup,
} from "@/components/management/ui";
import { useActiveWorkspace } from "@/components/layout/workspace-rail/use-active-workspace";
import {
  findActiveSettingsNavEntry,
  getSettingsRailGroups,
} from "@/lib/settings/management-nav";
import { cn } from "@/lib/utils";
import { getComputedWorkspaceHomeHref } from "@/lib/workspaces";

/**
 * Whether a settings screen is already on the reader's screen.
 *
 * Module scope, deliberately. Every settings route renders its own
 * `SettingsFrame`, and moving between two of them is a page change, so React
 * tears the whole surface down and builds it again — which replays the
 * dialog's 200ms fade-and-zoom on every single rail click. `Opening.dc.html`
 * annotates that transition as the surface *arriving* over the app; a rail
 * click is movement inside a surface that is already there, and re-running it
 * reads as the screen flinching.
 *
 * The flag survives a client-side navigation because the module is not
 * re-evaluated, and the mount of the incoming page renders before the outgoing
 * one's cleanup runs — so the incoming frame sees `true` and opens without the
 * animation. Leaving the surface altogether clears it on the next task, so the
 * following entry animates again. A full page load re-evaluates the module and
 * the flag starts `false`, which is also correct: that is an arrival.
 */
let surfaceIsOnScreen = false;
let surfaceLeavingTimer: ReturnType<typeof setTimeout> | undefined;

export type SettingsFrameProps = {
  /**
   * The screen. A `<RegisterLayout />` or a `<FormPage />` is passed straight
   * through as the surface's content column and draws its own chrome.
   * Anything else is wrapped in the record column and given the title line
   * below, which is how a page that has not been rebuilt yet still gets a
   * rule-3 header instead of the band this shell used to draw.
   */
  children: React.ReactNode;
  /** The fallback title line's text. Ignored once children draw their own. */
  title?: string;
  /** The fallback title line's one verb. Ignored once children draw their own. */
  actions?: React.ReactNode;
  /**
   * Counts for the rail, keyed by nav entry id (`users`, `job-grades`, …).
   *
   * A prop, not a query. `Rail.dc.html` draws a figure beside most entries,
   * but resolving twenty-three of them would mean twenty-three new requests
   * fired from the shell on every settings page — new data fetching, which
   * this refactor does not do. A page that has already loaded a figure can
   * hand it over; the rest render without one, which the rail supports.
   */
  railCounts?: Record<string, number>;
  /** Entry ids with something needing attention — the amber dot. */
  railAttention?: string[];
};

/**
 * Management and account preferences, as one surface over the app.
 *
 * ## Why there is one shell now and not two
 *
 * There were two: this one, and `PreferencesShell`. They drew the same grid
 * with different chrome — one put the section name and its verb in a sticky
 * band, the other teleported both into the app bar through `PageChrome`, and
 * Branding and Templates managed to use the management shell from inside a
 * `/preferences` route, so the rail changed out from under you mid-surface.
 * `PreferencesShell` now calls this, and both keep their own exported name so
 * no call site had to move.
 *
 * ## Why the band is gone
 *
 * Rule 4. A title is followed by its rule and then its content; a strip under
 * the heading repeating facts the fields already carry is a band spent on
 * nothing. The section's name and its one verb moved into the record header,
 * where the thing they act on is. `PageChrome` is gone for the same reason —
 * there is no app bar under the surface, so a title registered into it is a title
 * drawn behind a scrim.
 *
 * ## Why it is a dialog
 *
 * `Opening.dc.html` draws the surface arriving as an inset card over a scrim,
 * and the transition it annotates — `fade-in-0`, `zoom-in .985`, 200ms,
 * no zoom under `prefers-reduced-motion` — is `components/ui/dialog.tsx`'s
 * own at `size="full"`. `SettingsSurface` wraps exactly that.
 *
 * Nothing is drawn under it: `AppShell` renders these routes bare
 * (`isSettingsSurfacePath`), so the dialog is the only UI on screen, and
 * closing it navigates to the workspace's landing screen.
 *
 * Presentation only: no query, no mutation and no gate lives here. The rail's
 * entries arrive already filtered by the same two predicates that guarded
 * them before, and every route still gates itself on the server exactly as it
 * did.
 */
export function SettingsFrame({
  children,
  title,
  actions,
  railCounts,
  railAttention,
}: SettingsFrameProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();

  const user = session?.user as
    | {
        role?: string;
        enabledFeatures?: string[];
        workspaceProfile?: string;
        companySlug?: string;
      }
    | undefined;
  const role = user?.role;
  const enabledFeatures = user?.enabledFeatures;

  /*
    Where closing the surface goes: the landing screen of the workspace the
    reader was in — the same front door the sidebar's workspace switch lands
    on. A fixed destination rather than `router.back()`: the surface is
    reachable from a sidebar entry and a handful of in-page links, and half of
    those arrive with a history entry that is another settings page. Going
    "back" from Billing to Job grades is not leaving the surface.
  */
  const { activeWorkspaceId } = useActiveWorkspace(user?.companySlug ?? "default");
  const landingHref = React.useMemo(
    () =>
      getComputedWorkspaceHomeHref({
        role,
        enabledFeatures,
        workspaceProfile: user?.workspaceProfile,
        activeWorkspaceId,
      }),
    [activeWorkspaceId, enabledFeatures, role, user?.workspaceProfile],
  );

  // Open on mount and closed by leaving: the surface is a route, so its
  // "closed" state is a different page rather than a different render.
  const [open, setOpen] = React.useState(true);

  // Read once, at the first render of this frame, before the flag is raised:
  // the outgoing frame has not cleaned up yet, so `true` here means the reader
  // is moving within the surface rather than opening it.
  const [arriving] = React.useState(() => !surfaceIsOnScreen);
  React.useEffect(() => {
    // Cancels the clear the outgoing frame scheduled a moment ago: the two
    // frames of a rail click share one commit, cleanup first and mount second,
    // so a navigation is exactly "a frame left and another arrived before the
    // task ran". Leaving the surface for the app schedules the same clear and
    // nothing cancels it, so the next entry animates.
    clearTimeout(surfaceLeavingTimer);
    surfaceLeavingTimer = undefined;
    surfaceIsOnScreen = true;

    return () => {
      surfaceLeavingTimer = setTimeout(() => {
        surfaceIsOnScreen = false;
        surfaceLeavingTimer = undefined;
      }, 0);
    };
  }, []);

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next) router.push(landingHref);
    },
    [landingHref, router],
  );

  const groups = React.useMemo<SettingsRailGroup[]>(() => {
    const visible = getSettingsRailGroups({ role, enabledFeatures });
    const active = findActiveSettingsNavEntry(
      pathname ?? "",
      visible.flatMap((group) => group.items),
    );
    const attention = new Set(railAttention ?? []);

    return visible.map((group) => ({
      id: group.id,
      label: group.label,
      items: group.items.map((entry) => ({
        id: entry.id,
        label: entry.label,
        href: entry.href,
        icon: entry.icon,
        count: railCounts?.[entry.id],
        attention: attention.has(entry.id),
        /* Named, not the component's generic default. The dot is drawn on a
           row whose own label is already read out, but a screen reader moving
           through a rail with two of them would otherwise hear "Needs
           attention" twice with nothing to tell the two apart. */
        attentionLabel: `${entry.label} needs attention`,
        active: entry.id === active?.id,
      })),
    }));
  }, [enabledFeatures, pathname, railAttention, railCounts, role]);

  return (
    <SettingsSurface
      open={open}
      onOpenChange={handleOpenChange}
      rail={<SettingsRail groups={groups} backHref={landingHref} />}
      /* The surface's single grid row is implicit and therefore `auto`, which
         a tall form would grow past and `overflow: hidden` would then clip.
         Pinning it to the surface's own height is what lets each column below
         own its scrolling — the list and the record separately, as the board
         draws them. A utility because utilities outrank the module's layer. */
      className={cn(
        "grid-rows-[minmax(0,1fr)]",
        /* `!important`, and an arbitrary property rather than `animate-none`,
           because the class it has to beat is `animate-in` from
           `tw-animate-css` — a plugin utility, so tailwind-merge does not
           know the two conflict and both survive `cn`. Two plain utilities
           setting `animation` would then be decided by their order in the
           generated stylesheet, which is not something a call site can rely
           on. `fade-in-0` and `zoom-in` survive too but only set the
           `--tw-enter-*` variables the stopped animation read.

           The panel only. The scrim is the dialog's own element with its fade
           hard-coded in `components/ui/dialog.tsx`, so it still re-fades on a
           rail click — but the panel covers everything except the 24px gutter,
           so what is left of the flash is a thin frame, not the whole
           screen. */
        arriving ? undefined : "[animation:none]!",
      )}
    >
      <SettingsContent title={title} actions={actions}>
        {children}
      </SettingsContent>
    </SettingsSurface>
  );
}

/**
 * The surface's second grid child.
 *
 * A register manages its own two scrollers, so it is handed the row whole. A
 * form page has one column and no scroller of its own, so the row scrolls for
 * it. Both cases need the row bounded, which is what `min-h-0` buys.
 */
function SettingsContent({
  title,
  actions,
  children,
}: {
  title?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  /* `some`, not "the only child": a converted page is routinely a register
     beside a `Sheet` or a `Dialog` that creates the record. Those portal out
     and occupy no row, so what decides is whether the screen itself is one of
     the two layouts that draw their own header and own their own scrolling. */
  const drawsOwnChrome = React.Children.toArray(children).some(
    (child) =>
      React.isValidElement(child) &&
      (child.type === RegisterLayout || child.type === FormPage),
  );

  return (
    <div className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)] overflow-y-auto">
      {drawsOwnChrome ? (
        children
      ) : (
        /* The record column's own padding, for a page still composing its
           body itself. `title` becomes a real record header rather than the
           band it used to be, so an unconverted page reads the same way a
           converted one does. */
        <div style={{ padding: "24px 40px 40px" }}>
          {title ? <RecordHeader title={title} action={actions} /> : null}
          {children}
        </div>
      )}
    </div>
  );
}

export type ManagementShellProps = {
  /** The fallback title line. A converted page puts its own `RecordHeader` in `children` instead. */
  title?: string;
  /** The fallback title line's verb. */
  actions?: React.ReactNode;
  railCounts?: Record<string, number>;
  railAttention?: string[];
  children: React.ReactNode;
};

/**
 * The management entry point into the surface. See {@link SettingsFrame}.
 *
 * It used to carry `area` and `description` as well. Neither was read: the
 * rail is the whole surface's and is not scoped to an area, and rule 1
 * deleted the descriptions. A prop that is declared, passed and never read is
 * a prop the next reader has to go and check, so both are gone from the type
 * and from the call sites that were still handing them over.
 */
export function ManagementShell(props: ManagementShellProps) {
  return (
    <SettingsFrame
      title={props.title}
      actions={props.actions}
      railCounts={props.railCounts}
      railAttention={props.railAttention}
    >
      {props.children}
    </SettingsFrame>
  );
}
