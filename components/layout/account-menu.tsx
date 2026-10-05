"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

import { useGuidedMode } from "@/hooks/use-guided-mode";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/workspace/menu";
import { CountPill } from "@/components/workspace/count-pill";
import { Switch } from "@/components/workspace/switch";
import { useShellNav } from "@/components/layout/shell-nav";
import { useShell } from "@/components/layout/shell-state";
import {
  DEVICE_TONE_COLOR,
  OfflineStatusDialog,
  useDeviceStatus,
} from "@/components/layout/offline-status-row";
import {
  NotificationCenter,
  useNotificationsEnabled,
  useUnreadNotificationCount,
} from "@/components/notifications/notification-center";

import styles from "./workspace-rail/workspace-rail.module.css";

const noopSubscribe = () => () => {};

/**
 * The company mark's face: the branding logo when it loads, else the initials.
 */
function TileFace({ initials, logoUrl }: { initials: string; logoUrl: string | null }) {
  const [failedUrl, setFailedUrl] = React.useState<string | null>(null);
  if (!logoUrl || failedUrl === logoUrl) return <>{initials}</>;
  return (
    // A tenant's logo is an arbitrary URL, not one `next/image` can list.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logoUrl} alt="" className={styles.tileLogo} onError={() => setFailedUrl(logoUrl)} />
  );
}

/**
 * The logo tile and the account menu it opens (00-foundations 5.3.7): who is
 * signed in, Search, Notifications, This device, Profile, Appearance, Guided
 * tips, Help, the other workspaces, Sign out. The tile carries a dot while
 * anything is unread (`--action`) or the device is not ready (`--warn`,
 * `--bad` for Needs attention).
 */
export function AccountMenu() {
  const router = useRouter();
  const { data: session } = useSession();
  const nav = useShellNav();
  const shell = useShell();
  const { enabled: guided, setGuidedMode } = useGuidedMode();
  const notificationsEnabled = useNotificationsEnabled();
  const unread = useUnreadNotificationCount();
  const device = useDeviceStatus();
  const [deviceOpen, setDeviceOpen] = React.useState(false);
  // Search, Notifications and This device open a surface of their own. They
  // open once the menu has closed and handed focus back, or the returning
  // focus would read as a click outside and close them again.
  const next = React.useRef<(() => void) | null>(null);
  const after = (open: () => void) => () => {
    next.current = open;
  };
  // The dot reads the browser's own state (the device, the unread count), so
  // it is drawn after hydration rather than guessed on the server.
  const mounted = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const user = session?.user as { name?: string | null; email?: string | null } | undefined;
  const dot = !mounted ? null : !device.ready ? DEVICE_TONE_COLOR[device.tone] : unread > 0 ? "var(--action)" : null;
  const others = nav.workspaces.filter((workspace) => workspace.id !== nav.activeWorkspaceId);

  return (
    <>
      <NotificationCenter open={shell.notificationsOpen} onOpenChange={shell.setNotificationsOpen}>
        {/* The panel's anchor: a real element, since the menu root draws none. */}
        <div>
          <Menu>
            <MenuTrigger asChild>
              <button type="button" className={styles.tile} aria-label={`${nav.companyName}, your account`}>
                <TileFace initials={nav.initials} logoUrl={nav.logoUrl} />
                {dot ? <span aria-hidden="true" className={styles.tileDot} style={{ background: dot }} /> : null}
              </button>
            </MenuTrigger>
            <MenuContent
              side="right"
              align="start"
              sideOffset={8}
              style={{ width: 260 }}
              onCloseAutoFocus={(event) => {
                const open = next.current;
                next.current = null;
                if (!open) return;
                event.preventDefault();
                open();
              }}
            >
              <div style={{ padding: "6px 8px 8px" }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{user?.name ?? "Signed in"}</div>
                {user?.email ? <div style={{ fontSize: 13, color: "var(--ink-3)" }}>{user.email}</div> : null}
                <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{nav.companyName}</div>
              </div>
              <MenuSeparator />
              <MenuItem hint="⌘K" onSelect={after(() => shell.setCommandOpen(true))}>
                Search
              </MenuItem>
              {notificationsEnabled ? (
                <MenuItem
                  hint={
                    unread > 0 ? (
                      <CountPill>{unread > 99 ? "99+" : unread}</CountPill>
                    ) : undefined
                  }
                  onSelect={after(() => shell.setNotificationsOpen(true))}
                >
                  Notifications
                </MenuItem>
              ) : null}
              <MenuItem
                hint={
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}>
                    <span
                      aria-hidden="true"
                      style={{ width: 6, height: 6, borderRadius: 99, background: DEVICE_TONE_COLOR[device.tone] }}
                    />
                    {device.word}
                  </span>
                }
                onSelect={after(() => setDeviceOpen(true))}
              >
                This device
              </MenuItem>
              <MenuSeparator />
              <MenuItem onSelect={() => router.push("/preferences/profile")}>Profile</MenuItem>
              <MenuItem onSelect={() => router.push("/preferences/appearance")}>Appearance</MenuItem>
              <MenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  setGuidedMode(!guided);
                }}
                hint={<Switch checked={guided} tabIndex={-1} aria-label="Guided tips" />}
              >
                Guided tips
              </MenuItem>
              <MenuItem onSelect={() => router.push("/help")}>Help</MenuItem>
              {others.length > 0 ? (
                <>
                  <MenuSeparator />
                  {others.map((workspace) => (
                    <MenuItem key={workspace.id} onSelect={() => nav.selectWorkspace(workspace.id)}>
                      Switch to {workspace.label}
                    </MenuItem>
                  ))}
                </>
              ) : null}
              <MenuSeparator />
              <MenuItem danger onSelect={() => void signOut({ callbackUrl: "/login" })}>
                Sign out
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </NotificationCenter>
      <OfflineStatusDialog open={deviceOpen} onOpenChange={setDeviceOpen} />
    </>
  );
}
