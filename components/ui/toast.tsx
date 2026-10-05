"use client";

import * as React from "react";

import { AlertCircle, AlertTriangle, CheckCircle } from "@/lib/icons";

/**
 * Toast — the done message after a sheet, a bulk action or a confirm
 * (00-foundations 5.9): `--surface`, a `--line` edge, radius 12,
 * `--shadow-float`, padding 12 14, at most 420 wide. A 16px check-circle in
 * `--ok` (a warn triangle in `--warn` for a partial result, an alert circle in
 * `--bad` when it failed), the sentence in 14 `--ink`, and an optional action
 * ("Open", "Undo") as an underlined button. `toaster.tsx` hosts one at a time.
 */
export type ToastTone = "default" | "success" | "warn" | "danger";

export type ToastCardProps = {
  tone?: ToastTone;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: { label: string; onClick: () => void };
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
};

export function ToastCard({ tone = "default", title, description, action, onPointerEnter, onPointerLeave }: ToastCardProps) {
  const [mark, Icon] =
    tone === "warn" ? ["warn", AlertTriangle] : tone === "danger" ? ["bad", AlertCircle] : ["ok", CheckCircle];

  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className="cx-toast"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <span className={`cx-toast__icon cx-toast__icon--${mark}`} aria-hidden="true">
        <Icon />
      </span>
      <div className="cx-toast__text">
        <span>{title}</span>
        {description ? <span className="cx-toast__body">{description}</span> : null}
      </div>
      {action ? (
        <button type="button" className="cx-toast__action" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
