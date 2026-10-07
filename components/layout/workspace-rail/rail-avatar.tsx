"use client";

import * as React from "react";

import { logoInitials } from "@/lib/rail/initials";

import styles from "./workspace-rail.module.css";

/**
 * The person at the foot of the rail (`Main.dc.html`): a 28px circle on
 * `--tray` with their initials, or their photo when there is one and it loads.
 */
export function RailAvatar({ src, name }: { src?: string | null; name?: string | null }) {
  const [failedSrc, setFailedSrc] = React.useState<string | null>(null);
  const showPhoto = Boolean(src) && failedSrc !== src;

  return (
    <span className={styles.avatar}>
      {showPhoto ? (
        // A profile photo is an arbitrary URL, not one `next/image` can list.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src as string} alt="" className={styles.avatarPhoto} onError={() => setFailedSrc(src ?? null)} />
      ) : (
        logoInitials(null, name)
      )}
    </span>
  );
}
