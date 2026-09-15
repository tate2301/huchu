"use client";

import { useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Callout,
  SettingRow,
  Switch,
} from "@corelithzw/react";
import { NavRailGroup, NavRailItem } from "@/components/ui/nav-rail";
import { dsConfirm } from "@/components/ui/ds-confirm";
import { TableSearch } from "@/components/records/table-controls";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  SavingOverlay,
  TableRowsSkeleton,
} from "@/components/records/states";
import {
  fetchNotificationPreferences,
  updateNotificationPreferences,
} from "@/lib/api";
import { Bell, Lock, Palette, Shield, Upload } from "@/lib/icons";

type SectionId =
  | "notifications"
  | "publishing"
  | "appearance"
  | "security"
  | "privacy";

const SECTIONS: Array<{
  id: SectionId;
  label: string;
  icon: typeof Bell;
  /** Every row title in the panel, so the search box can find a setting by
   *  its own name rather than by the section it happens to live under. */
  rows: string[];
}> = [
  {
    id: "notifications",
    label: "Notifications",
    icon: Bell,
    rows: ["Notifications in the portal", "Browser push"],
  },
  {
    id: "publishing",
    label: "Mark publishing",
    icon: Upload,
    rows: [
      "Who publishes marks",
      "Approval before parents see a mark",
      "Publish window",
    ],
  },
  {
    id: "appearance",
    label: "Appearance",
    icon: Palette,
    rows: ["Reduced motion"],
  },
  {
    id: "security",
    label: "Security",
    icon: Lock,
    rows: ["Sign out on this device"],
  },
  {
    id: "privacy",
    label: "Privacy and data",
    icon: Shield,
    rows: ["Access to pupil records is logged", "Your photograph"],
  },
];

/**
 * Notification delivery, against the preference store this repo already has.
 *
 * `UserNotificationPreference` is per user and account-wide, and it holds two
 * things a teacher can act on: whether the notification centre is on, and
 * whether the browser may push. It also holds three category switches — HR,
 * operations, CRM — that belong to the admin dashboard's domains and would be
 * noise on a mark sheet, so they are left to the preferences screen that owns
 * them rather than repeated here under names a teacher would not recognise.
 *
 * The demo's four cadences (absence alerts, a daily digest, quiet hours,
 * school-wide announcements) have no column behind them and no school
 * notification category to hang from. They are listed, not faked.
 */
function NotificationsPanel() {
  const queryClient = useQueryClient();

  const preferences = useQuery({
    queryKey: ["preferences", "notifications"],
    queryFn: fetchNotificationPreferences,
  });

  const update = useMutation({
    mutationFn: updateNotificationPreferences,
    onSuccess: (next) => {
      queryClient.setQueryData(["preferences", "notifications"], next);
    },
  });

  const prefs = preferences.data;

  return (
    <>
      <section className="settings-section">
        <h2>Notifications</h2>
        <p className="t-body t-muted">
          How the portal reaches you. These apply to your account everywhere,
          not only in the staffroom.
        </p>

        {update.error ? (
          <SaveError what="That preference" error={update.error} />
        ) : null}

        {preferences.error ? (
          <LoadError
            what="your preferences"
            error={preferences.error}
            onRetry={() => void preferences.refetch()}
          />
        ) : preferences.isPending ? (
          /* Two setting rows: a label with its description under it, and a
             switch on the right. Matching that stops the panel jumping. */
          <TableRowsSkeleton
            columns={[{ twoLine: true }, { width: 44, align: "right" }]}
            rows={2}
          />
        ) : !prefs ? (
          <NothingYet
            title="No preferences are stored for your account yet"
            body="They are written the first time you change one. Until then the portal uses the school's defaults."
          />
        ) : (
          /* One switch at a time, and both write the same record — a second
             flip mid-save is a preference the response is about to overwrite. */
          <SavingOverlay saving={update.isPending} label="Saving…">
            <SettingRow
              label="Notifications in the portal"
              description="Shows the notification centre while you work. Turning it off silences the portal itself."
            >
              <Switch
                aria-label="Notifications in the portal"
                checked={prefs.inAppEnabled}
                disabled={update.isPending}
                onChange={(event) =>
                  update.mutate({ inAppEnabled: event.target.checked })
                }
              />
            </SettingRow>
            <SettingRow
              label="Browser push"
              description="Lets this device raise a notification when the portal is not open. The browser asks for its own permission the first time."
            >
              <Switch
                aria-label="Browser push"
                checked={prefs.webPushEnabled}
                disabled={update.isPending}
                onChange={(event) =>
                  update.mutate({ webPushEnabled: event.target.checked })
                }
              />
            </SettingRow>
          </SavingOverlay>
        )}
      </section>

    </>
  );
}

/**
 * Mark publishing — the school's rule, shown rather than offered.
 *
 * The demo puts a publish window, a sign-off toggle and an SMS format switch
 * under the teacher's own settings. Two of the three are decisions the school
 * has already made in code and cannot be reassigned from here: a result sheet
 * only publishes once the head of department has approved it, only inside a
 * window the office has opened, and only for a role that may publish results —
 * which a teacher is not. Showing that as a switch would offer the teacher a
 * lever attached to nothing. Showing it as the rule, with the owner named, is
 * what the screen is for.
 */
function PublishingPanel() {
  return (
    <>
      <section className="settings-section">
        <h2>Mark publishing</h2>
        <p className="t-body t-muted">
          The school sets these, not you. They decide when what you enter
          reaches a parent.
        </p>
        <SettingRow
          label="Who publishes marks"
          description="You enter and save marks, then submit the sheet. The head of department approves it and the office publishes it. Your role cannot publish results itself."
        >
          <Badge tone="neutral">The office</Badge>
        </SettingRow>
        <SettingRow
          label="Approval before parents see a mark"
          description="A result sheet moves from draft to submitted to approved before it can be published. Nothing reaches a parent from an unapproved sheet."
        >
          <Badge tone="success">Required</Badge>
        </SettingRow>
        <SettingRow
          label="Publish window"
          description="The office opens a window per term, and may narrow it to one class or stream. Outside an open window, publishing is refused even for an approved sheet."
        >
          <Badge tone="outline">Set by the office</Badge>
        </SettingRow>
      </section>

      <Callout tone="info" title="A mark you have saved is not a published mark">
        Saving records the score against the pupil. It stays inside the school
        until an approved sheet is published in an open window. If a parent is
        asking about a result you entered this morning, that is why.
      </Callout>
    </>
  );
}

/**
 * Appearance.
 *
 * `AppearanceProvider` only ever reads "light" back out of storage — the
 * package ships one palette — so a theme switch here would appear to work
 * until the next reload, and a row offering one option is not a choice.
 * Reduced motion is genuinely handled, and by the device rather than by us:
 * the design system honours `prefers-reduced-motion`, so the row points at the
 * system setting instead of adding a second, weaker one.
 */
function AppearancePanel() {
  return (
    <section className="settings-section">
      <h2>Appearance</h2>
      <SettingRow
        label="Reduced motion"
        description="Already handled. Turn on reduce motion in your device settings and the portal drops its transitions."
      >
        <Badge tone="success">Follows your device</Badge>
      </SettingRow>
    </section>
  );
}

/**
 * Security, on the assumption the tablet is shared.
 *
 * Signing out is the one control here that does something, and it is the one
 * that matters most: a teacher hands the tablet on between lessons, and the
 * next person must not inherit a signed-in register. It confirms first,
 * because a mis-tap in front of a class costs a sign-in.
 *
 * The rest is not built and is not pretended: this product has no self-service
 * password change (only an administrator can reset one), no second factor, and
 * no device session list to revoke, because sessions are stateless tokens.
 */
function SecurityPanel() {
  const [signingOut, setSigningOut] = useState(false);

  const confirmSignOut = async () => {
    const confirmed = await dsConfirm({
      title: "Sign out on this device",
      description:
        "The next person to pick up this tablet will have to sign in. Anything you have not saved is lost.",
      confirmLabel: "Sign out",
      variant: "warning",
    });
    if (!confirmed) return;
    setSigningOut(true);
    void signOut({ redirect: true, callbackUrl: "/portal/teacher" });
  };

  return (
    <section className="settings-section">
      <h2>Security</h2>
      <p className="t-body t-muted">
        Written for a device that is shared between lessons.
      </p>
      <SettingRow
        label="Sign out on this device"
        description="Use this before you hand the tablet on. It ends the session in this browser only."
      >
        <Button
          variant="secondary"
          loading={signingOut}
          onClick={() => void confirmSignOut()}
        >
          Sign out
        </Button>
      </SettingRow>
    </section>
  );
}

/**
 * Privacy — what is kept about the teacher, and who can look at it.
 *
 * The audit trail is real: every privileged action in this platform writes a
 * `PlatformAuditEvent`. What does not exist is a teacher-facing view of it, so
 * the row says who can read it rather than offering a button that opens
 * nothing.
 */
function PrivacyPanel() {
  return (
    <>
      <section className="settings-section">
        <h2>Privacy and data</h2>
        <p className="t-body t-muted">
          What the school holds about you, and who is able to look at it.
        </p>
        <SettingRow
          label="Access to pupil records is logged"
          description="Privileged actions across the platform are written to an append-only audit trail that the office can read."
        >
          <Badge tone="success">On</Badge>
        </SettingRow>
        <SettingRow
          label="Your photograph"
          description="Comes from your staff account and appears wherever you are listed. Ask the office to change or remove it."
        >
          <Badge tone="outline">Held by the office</Badge>
        </SettingRow>
      </section>

      <Callout tone="info" title="Ask the office">
        Anything you want corrected or removed goes through the school office.
        They hold the staff record this portal reads from.
      </Callout>
    </>
  );
}

/**
 * The teacher's own settings, in the design system's settings shell.
 *
 * SHL·02: a rail of sections beside one panel of rows. The rail switches a
 * panel rather than a route, which is what the demo does and what suits five
 * short panels — a teacher opening Settings between lessons should not be
 * navigating.
 *
 * Most of what the demo puts here is not the teacher's to set. Two of the five
 * panels are the school's rules and one is a property of the build, so the
 * screen's real job is to say who owns each decision and to be straight about
 * which switches are not connected to anything yet.
 */
export function TeacherSettingsScreen() {
  const [section, setSection] = useState<SectionId>("notifications");
  /**
   * Twenty-odd rows across five panels, and a teacher looking for "push" does
   * not know which panel holds it. The search narrows the RAIL to the sections
   * that contain a matching row, so the answer is one tap away rather than
   * five panels of reading.
   */
  const [search, setSearch] = useState("");

  const shownSections = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return SECTIONS;
    return SECTIONS.filter((item) =>
      `${item.label} ${item.rows.join(" ")}`.toLowerCase().includes(needle),
    );
  }, [search]);

  // A search that hides the open panel would leave the page showing rows the
  // teacher just filtered away, so the selection follows what is left.
  const openSection = shownSections.some((item) => item.id === section)
    ? section
    : (shownSections[0]?.id ?? null);

  return (
    <div className="settings-layout">
      <aside className="settings-rail" aria-label="Settings sections">
        <div className="mb-2">
          <TableSearch
            label="Find a setting"
            value={search}
            onChange={setSearch}
            placeholder="push, password, theme"
          />
        </div>
        <NavRailGroup label="Your account">
          {shownSections.map((item) => (
            <NavRailItem
              key={item.id}
              active={item.id === openSection}
              icon={<item.icon className="size-4" aria-hidden="true" />}
              onClick={() => setSection(item.id)}
            >
              {item.label}
            </NavRailItem>
          ))}
        </NavRailGroup>
      </aside>

      {/* A div, not a `main`: the portal's `AppShell` already owns the page's
          one `<main>`, and nesting a second inside it is invalid. */}
      <div className="settings-content">
        {openSection === null ? (
          <NothingMatched
            what="settings"
            filters={[search.trim()]}
            onClear={() => setSearch("")}
          />
        ) : null}
        {openSection === "notifications" ? <NotificationsPanel /> : null}
        {openSection === "publishing" ? <PublishingPanel /> : null}
        {openSection === "appearance" ? <AppearancePanel /> : null}
        {openSection === "security" ? <SecurityPanel /> : null}
        {openSection === "privacy" ? <PrivacyPanel /> : null}
      </div>
    </div>
  );
}
