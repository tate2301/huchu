"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";

import { Button } from "@/components/workspace/button";

import { Glyph, type GlyphName } from "./glyph";
import { Teams } from "./teams-root";
import "./w-people.css";

/** Dialogs, the side sheet, the phone sheet and the toast with Undo, for the people screens. They sit under <Teams> so the kit's tokens reach them. */

export function WDialog({
  open,
  onOpenChange,
  title,
  icon,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  icon?: GlyphName;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Teams className="tm--portal">
          <Dialog.Overlay className="wp-scrim" />
          <Dialog.Content
            className="wp-dlg"
            aria-describedby={undefined}
            onOpenAutoFocus={(event) => {
              const primary = (event.currentTarget as HTMLElement).querySelector<HTMLElement>("[data-primary]");
              if (primary) {
                event.preventDefault();
                primary.focus();
              }
            }}
          >
            <div className="wp-dlg__h">
              {icon ? (
                <span className="wp-dlg__mark">
                  <Glyph name={icon} />
                </span>
              ) : null}
              <Dialog.Title className="wp-dlg__t">{title}</Dialog.Title>
            </div>
            <div className="wp-dlg__b">{children}</div>
            {footer ? <div className="wp-dlg__f">{footer}</div> : null}
          </Dialog.Content>
        </Teams>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function WDrawer({
  open,
  onOpenChange,
  title,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Teams className="tm--portal">
          <Dialog.Overlay className="wp-scrim" />
          <Dialog.Content className="wp-drawer" aria-describedby={undefined}>
            <div className="wp-drawer__h">
              <Dialog.Title className="wp-drawer__t">{title}</Dialog.Title>
              <Dialog.Close asChild>
                <Button iconOnly aria-label="Close" icon={<Glyph name="x" />} />
              </Dialog.Close>
            </div>
            <div className="wp-drawer__b">{children}</div>
            {footer ? <div className="wp-drawer__f">{footer}</div> : null}
          </Dialog.Content>
        </Teams>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function WSheet({ open, onOpenChange, title, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; children: React.ReactNode }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Teams className="tm--portal">
          <Dialog.Overlay className="wp-scrim" />
          <Dialog.Content className="wp-psheet" aria-describedby={undefined}>
            <span className="wp-grab" />
            <Dialog.Title className="wp-dlg__t">{title}</Dialog.Title>
            {children}
          </Dialog.Content>
        </Teams>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export type ToastState = { text: string; undo?: () => void; at?: string } | null;

/** One toast at a time, six seconds, Undo with Ctrl Z while it shows. */
export function useToast6() {
  const [toast, setToast] = React.useState<ToastState>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = React.useCallback((next: NonNullable<ToastState>) => {
    if (timer.current) clearTimeout(timer.current);
    setToast(next);
    timer.current = setTimeout(() => setToast(null), 6000);
  }, []);
  const clear = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setToast(null);
  }, []);
  React.useEffect(() => {
    if (!toast?.undo) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        toast.undo?.();
        clear();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toast, clear]);
  return { toast, show, clear };
}

export function WToast({ toast, onClear }: { toast: ToastState; onClear: () => void }) {
  if (!toast) return null;
  return (
    <Teams className="tm--portal">
      <div className="wp-toast" role="status">
        <span>{toast.text}</span>
        {toast.undo ? (
          <button
            type="button"
            onClick={() => {
              toast.undo?.();
              onClear();
            }}
          >
            Undo <span className="kbd">Ctrl Z</span>
          </button>
        ) : null}
      </div>
    </Teams>
  );
}
