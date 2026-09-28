"use client";

import * as React from "react";

/**
 * A person.
 *
 * A photograph when there is one, and this silhouette when there is not —
 * never initials on a coloured disc. Two letters in a circle is a table cell
 * wearing a face; initials belong to the *company* mark, which is not a
 * person. The design system's `Avatar` falls back to initials, which is why
 * this is drawn here instead.
 */
export function RailAvatar({
  src,
  name,
  size = 30,
}: {
  src?: string | null;
  name?: string | null;
  size?: number;
}) {
  const [failed, setFailed] = React.useState(false);
  const showPhoto = Boolean(src) && !failed;

  return (
    <span
      style={{
        display: "grid",
        placeItems: "center",
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: 9999,
        background: "var(--surface-sunken)",
        overflow: "hidden",
      }}
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src as string}
          alt={name ?? ""}
          width={size}
          height={size}
          onError={() => setFailed(true)}
          style={{ width: size, height: size, objectFit: "cover" }}
        />
      ) : (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          aria-hidden="true"
          focusable="false"
        >
          <circle cx="16" cy="12.4" r="5.4" fill="var(--text-subtle)" />
          <path
            d="M4.6 30.4a11.9 11.9 0 0 1 22.8 0 16 16 0 0 1-22.8 0Z"
            fill="var(--text-subtle)"
          />
        </svg>
      )}
    </span>
  );
}
