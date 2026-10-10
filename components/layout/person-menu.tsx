"use client";

import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

import { useGuidedMode } from "@/hooks/use-guided-mode";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/workspace/menu";
import { Switch } from "@/components/workspace/switch";
import { RailAvatar } from "@/components/layout/workspace-rail";

import styles from "./workspace-rail/workspace-rail.module.css";

/**
 * The person at the foot of the rail and their menu: Profile, Notifications,
 * Appearance, Users, Guided tips, Sign out. The logo tile's account menu
 * reaches the same places from the top of the rail.
 */
export function PersonMenu() {
  const router = useRouter();
  const { data: session } = useSession();
  const { enabled: guided, setGuidedMode } = useGuidedMode();
  const user = session?.user as { name?: string | null; email?: string | null; image?: string | null } | undefined;

  return (
    <Menu>
      <MenuTrigger asChild>
        <button type="button" className={styles.avatarButton} aria-label={`${user?.name ?? user?.email ?? "Account"}, your menu`}>
          <RailAvatar src={user?.image} name={user?.name ?? user?.email} />
        </button>
      </MenuTrigger>
      <MenuContent side="right" align="end" sideOffset={14} style={{ width: 240 }}>
        <div style={{ padding: "6px 8px 8px" }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{user?.name ?? "Signed in"}</div>
          {user?.email ? <div style={{ fontSize: 13, color: "var(--ink-3)" }}>{user.email}</div> : null}
        </div>
        <MenuSeparator />
        <MenuItem onSelect={() => router.push("/preferences/profile")}>Profile</MenuItem>
        <MenuItem onSelect={() => router.push("/preferences/notifications")}>Notifications</MenuItem>
        <MenuItem onSelect={() => router.push("/preferences/appearance")}>Appearance</MenuItem>
        <MenuItem onSelect={() => router.push("/preferences/organization/users")}>Users</MenuItem>
        <MenuItem
          onSelect={(event) => {
            event.preventDefault();
            setGuidedMode(!guided);
          }}
          hint={<Switch checked={guided} tabIndex={-1} aria-label="Guided tips" />}
        >
          Guided tips
        </MenuItem>
        <MenuSeparator />
        <MenuItem danger onSelect={() => void signOut({ callbackUrl: "/login" })}>
          Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
