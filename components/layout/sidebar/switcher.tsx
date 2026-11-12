"use client";

import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

import { useGuidedMode } from "@/hooks/use-guided-mode";
import { useShellNav } from "@/components/layout/shell-nav";
import { useShell } from "@/components/layout/shell-state";
import { Switch } from "@/components/workspace/switch";
import { cn } from "@/lib/utils";

import { ChromeIcon, Face, personLine, roleWord } from "./parts";
import styles from "./sidebar.module.css";

type User = { name?: string | null; email?: string | null; image?: string | null; role?: string | null };

/**
 * The workspace and the person, one switcher (Switcher.dc.html): the
 * workspace's mark with the person's face on its corner, the workspace's name
 * and who is signed in. It opens the workspaces and the person's own places.
 */
export function Switcher({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const nav = useShellNav();
  const shell = useShell();
  const { data: session } = useSession();
  const { enabled: guided, setGuidedMode } = useGuidedMode();
  const user = session?.user as User | undefined;
  const line = personLine(user?.name ?? user?.email, user?.role);

  const mark = (size?: number) => (
    <span className={styles.wsMark} style={size ? { width: size, height: size } : undefined}>
      {nav.logoUrl ? <Face src={nav.logoUrl} name={nav.companyName} className={styles.wsLogo} /> : nav.initials}
      {size ? null : <Face src={user?.image} name={user?.name ?? user?.email} className={styles.wsFace} />}
    </span>
  );

  const go = (href: string) => () => {
    if (shell.drawerOpen) shell.setDrawerOpen(false);
    router.push(href);
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        {compact ? (
          <button type="button" className={styles.ib} style={{ width: "auto", height: "auto" }} aria-label="Switch workspace or account">
            {mark()}
          </button>
        ) : (
          <button type="button" className={styles.ws} aria-label="Switch workspace or account">
            {mark()}
            <span className={styles.wsT}>
              <span className={styles.wsN}>{nav.companyName}</span>
              <span className={styles.wsP}>{line}</span>
            </span>
            <ChromeIcon name="switch" className={styles.sel} />
          </button>
        )}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={cn(styles.fly, "cx")}
          side={compact ? "right" : "bottom"}
          align="start"
          sideOffset={compact ? 14 : 4}
          collisionPadding={8}
          onKeyDown={(event) => {
            if (event.shiftKey && event.key.toLowerCase() === "q") {
              event.preventDefault();
              void signOut({ callbackUrl: "/login" });
            }
          }}
        >
          <div className={styles.flyHead}>Workspaces</div>
          <DropdownMenu.Item asChild onSelect={go(nav.homeHref)}>
            <a className={cn(styles.it, styles.current)} style={{ height: 44, gap: 10, padding: "0 8px 0 10px" }} href={nav.homeHref} aria-current="page">
              {mark(26)}
              <span className={styles.lbl} style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
                <span>{nav.companyName}</span>
                {roleWord(user?.role) ? <span style={{ fontSize: 12, opacity: 0.75, fontWeight: 400 }}>{roleWord(user?.role)}</span> : null}
              </span>
              <ChromeIcon name="ready" className={styles.ic14} />
            </a>
          </DropdownMenu.Item>
          <div className={styles.flySep} />
          <div className={styles.who}>
            <Face src={user?.image} name={user?.name ?? user?.email} className={styles.av24} />
            <div className={styles.n2}>
              {user?.name ?? "Signed in"}
              {user?.email ? <span>{user.email}</span> : null}
            </div>
          </div>
          <DropdownMenu.Item asChild onSelect={go("/preferences/profile")}>
            <a className={styles.kid} href="/preferences/profile">
              <ChromeIcon name="person" className={styles.ic14} />
              <span className={styles.lbl}>Your profile</span>
            </a>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild onSelect={go("/preferences/notifications")}>
            <a className={styles.kid} href="/preferences/notifications">
              <ChromeIcon name="bell" className={styles.ic14} />
              <span className={styles.lbl}>Notifications</span>
            </a>
          </DropdownMenu.Item>
          {shell.width === "phone" ? null : (
            <DropdownMenu.Item
              className={styles.kid}
              onSelect={() => {
                if (!shell.panelShown) shell.openPanel();
                shell.setArranging(true);
              }}
            >
              <ChromeIcon name="menu" className={styles.ic14} />
              <span className={styles.lbl}>Arrange your sidebar</span>
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item
            className={styles.kid}
            onSelect={(event) => {
              event.preventDefault();
              setGuidedMode(!guided);
            }}
          >
            <ChromeIcon name="help" className={styles.ic14} />
            <span className={styles.lbl}>Guided tips</span>
            <Switch checked={guided} tabIndex={-1} aria-label="Guided tips" />
          </DropdownMenu.Item>
          <DropdownMenu.Item className={styles.kid} onSelect={() => void signOut({ callbackUrl: "/login" })}>
            <ChromeIcon name="sign-out" className={styles.ic14} />
            <span className={styles.lbl}>Sign out</span>
            <span className={styles.kbd}>⇧Q</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
