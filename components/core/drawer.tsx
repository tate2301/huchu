"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";

import { Button } from "./button";
import { Kit } from "./kit-root";

/**
 * A drawer from the right over a dimmed page: a title and Close, a body that
 * scrolls, and a footer with its actions. Esc and the scrim close it.
 */
export function Drawer({
  open,
  onOpenChange,
  title,
  sub,
  children,
  footer,
  width = 560,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  /** A line under the title: what the drawer acts on ("Closing 1 Jan to 31 Dec 2026, grouped by stage."). */
  sub?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Kit contents>
          <Dialog.Overlay className="over is-fixed" />
          <Dialog.Content className="drawer is-fixed" style={{ width, maxWidth: "100vw" }} aria-describedby={undefined}>
            <div className={sub ? "drawer-h has-sub" : "drawer-h"}>
              {sub ? (
                <div className="drawer-t">
                  <Dialog.Title asChild>
                    <span>{title}</span>
                  </Dialog.Title>
                  <span className="drawer-sub">{sub}</span>
                </div>
              ) : (
                <Dialog.Title asChild>
                  <span>{title}</span>
                </Dialog.Title>
              )}
              <Dialog.Close asChild>
                <Button variant="quiet" iconOnly icon="x" label="Close" />
              </Dialog.Close>
            </div>
            <div className="drawer-b">{children}</div>
            {footer ? <div className="drawer-f">{footer}</div> : null}
          </Dialog.Content>
        </Kit>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** A titled section inside a drawer. */
export function DrawerSection({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="dsec">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

/** A label and its value or control, side by side, inside a drawer section. */
export function DrawerRow({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="frow">
      <span>{label}</span>
      <span>{children}</span>
    </div>
  );
}
