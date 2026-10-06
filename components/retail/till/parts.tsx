"use client";

/**
 * The till's parts, each the kit's markup with the kit's classes (till.css), so
 * every screen is composed from them and nothing is drawn fresh on a screen.
 */

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { Backspace, Check, User, WarningCircle, X } from "@/lib/icons";

/* ─── The root every overlay portals into, so the kit's styles reach it ── */

type TillRootValue = { element: HTMLElement | null; returnFocus: (event: Event) => void };

const TillRootContext = React.createContext<TillRootValue>({ element: null, returnFocus: () => {} });

/**
 * Also keeps where focus was before a dialog opened. Radix gives focus back to a
 * Dialog.Trigger only, and the till's dialogs open from state, so without this
 * closing one would leave a keyboard on the page body.
 */
export function TillRootProvider({ element, children }: { element: HTMLElement | null; children: React.ReactNode }) {
  const before = React.useRef<HTMLElement | null>(null);
  React.useEffect(() => {
    const remember = (event: FocusEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target && !target.closest('[role="dialog"]')) before.current = target;
    };
    document.addEventListener("focusin", remember);
    return () => document.removeEventListener("focusin", remember);
  }, []);
  const value = React.useMemo<TillRootValue>(
    () => ({
      element,
      returnFocus: (event) => {
        event.preventDefault();
        if (before.current?.isConnected) before.current.focus();
      },
    }),
    [element],
  );
  return <TillRootContext.Provider value={value}>{children}</TillRootContext.Provider>;
}

function useTillRoot() {
  return React.useContext(TillRootContext).element;
}

/** For a dialog's `onCloseAutoFocus`: puts focus back where it was before the dialog opened. */
export function useReturnFocus() {
  return React.useContext(TillRootContext).returnFocus;
}

/* ─── Small pieces ───────────────────────────────────────────────────── */

/** A face when there is one; a glyph otherwise, never initials. */
export function Avatar({ name, image, size = 32 }: { name: string; image?: string | null; size?: 24 | 32 | 40 }) {
  const cls = size === 24 ? "avatar" : `avatar avatar-${size}`;
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element -- a face from the user's own record, any host
    return <img className={cls} src={image} alt="" />;
  }
  return (
    <span className={`${cls} avatar-none`} aria-hidden="true" title={name}>
      <User className="ic" />
    </span>
  );
}

export function ErrorLine({ children, large, id }: { children: React.ReactNode; large?: boolean; id?: string }) {
  return (
    <span className={large ? "error is-large" : "error"} role="alert" id={id}>
      <WarningCircle className="ic" />
      {children}
    </span>
  );
}

export function Empty({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Icon className="glyph" />
      <h2>{title}</h2>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

/**
 * One of a few, side by side: a radio group, so Tab lands on the chosen one
 * and the arrow keys move the choice.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
  disabled,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: React.ReactNode }>;
  onChange: (value: T) => void;
  className?: string;
  disabled?: boolean;
}) {
  const buttons = React.useRef<Array<HTMLButtonElement | null>>([]);
  const at = options.findIndex((option) => option.value === value);
  const move = (event: React.KeyboardEvent) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (Math.max(at, 0) + step + options.length) % options.length;
    onChange(options[next].value);
    buttons.current[next]?.focus();
  };
  return (
    <div className={className ? `seg ${className}` : "seg"} role="radiogroup" aria-label={label} onKeyDown={move}>
      {options.map((option, index) => (
        <button
          key={option.value}
          ref={(element) => {
            buttons.current[index] = element;
          }}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          tabIndex={option.value === value || (at < 0 && index === 0) ? 0 : -1}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ─── Keypad, PIN dots, code boxes ───────────────────────────────────── */

export type KeypadKey = { kind: "digit"; value: string } | { kind: "delete" } | { kind: "clear" } | { kind: "dot" };

/**
 * Digits for amounts and PINs on a touch till. A keyboard works as well: the
 * screen that owns the keypad listens with `useKeypadKeys`.
 */
export function Keypad({
  onKey,
  left = "none",
  disabled,
}: {
  onKey: (key: KeypadKey) => void;
  /** What the bottom-left key is: a decimal point, Clear, or nothing. */
  left?: "dot" | "clear" | "none";
  disabled?: boolean;
}) {
  const digit = (value: string) => (
    <button key={value} type="button" disabled={disabled} onClick={() => onKey({ kind: "digit", value })}>
      {value}
    </button>
  );
  return (
    <div className="keypad" role="group" aria-label="Number pad">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(digit)}
      {left === "dot" ? (
        <button type="button" disabled={disabled} onClick={() => onKey({ kind: "dot" })} aria-label="Decimal point">
          .
        </button>
      ) : left === "clear" ? (
        <button type="button" className="quiet" disabled={disabled} onClick={() => onKey({ kind: "clear" })}>
          Clear
        </button>
      ) : (
        <span />
      )}
      {digit("0")}
      <button type="button" disabled={disabled} aria-label="Delete the last digit" onClick={() => onKey({ kind: "delete" })}>
        <Backspace className="ic" />
      </button>
    </div>
  );
}

/**
 * True under the lock: the screens it hides stay mounted but stop listening to
 * the keyboard, so a PIN typed on the lock never lands in a count or a float.
 */
const KeysPausedContext = React.createContext(false);

export function KeysPaused({ paused, children }: { paused: boolean; children: React.ReactNode }) {
  return <KeysPausedContext.Provider value={paused}>{children}</KeysPausedContext.Provider>;
}

/** A dialog, menu or popover the key was pressed in, unless it holds a keypad of its own. */
function inLayerWithoutKeypad(target: EventTarget | null) {
  // A key pressed with nothing focused targets the document or the window, which are no layer.
  if (!(target instanceof Element)) return false;
  const layer = target.closest(
    '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]',
  );
  return Boolean(layer && !layer.querySelector(".keypad"));
}

/**
 * The physical keyboard, for the same keys. Off while `enabled` is false, under
 * the lock, and while a dialog or popover without a keypad has focus: Escape
 * there closes the overlay and leaves the amount under it alone.
 */
export function useKeypadKeys(onKey: (key: KeypadKey) => void, enabled = true) {
  const paused = React.useContext(KeysPausedContext);
  const handler = React.useRef(onKey);
  React.useEffect(() => {
    handler.current = onKey;
  });
  React.useEffect(() => {
    if (!enabled || paused) return;
    const listen = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (inLayerWithoutKeypad(target)) return;
      if (/^\d$/.test(event.key)) handler.current({ kind: "digit", value: event.key });
      else if (event.key === "Backspace") handler.current({ kind: "delete" });
      else if (event.key === "." || event.key === ",") handler.current({ kind: "dot" });
      else if (event.key === "Escape") handler.current({ kind: "clear" });
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", listen);
    return () => window.removeEventListener("keydown", listen);
  }, [enabled, paused]);
}

/** One window key listener for a screen's shortcuts, always calling the latest handler. Off under the lock. */
export function useWindowKeys(onKey: (event: KeyboardEvent) => void) {
  const paused = React.useContext(KeysPausedContext);
  const handler = React.useRef(onKey);
  React.useEffect(() => {
    handler.current = onKey;
  });
  React.useEffect(() => {
    if (paused) return;
    const listen = (event: KeyboardEvent) => handler.current(event);
    window.addEventListener("keydown", listen);
    return () => window.removeEventListener("keydown", listen);
  }, [paused]);
}

/** Applies a key to an amount being typed: two decimals at most, no leading zeros. */
export function typeAmount(current: string, key: KeypadKey): string {
  if (key.kind === "clear") return "";
  if (key.kind === "delete") return current.slice(0, -1);
  if (key.kind === "dot") return current.includes(".") ? current : `${current || "0"}.`;
  const [, cents] = current.split(".");
  if (cents !== undefined && cents.length >= 2) return current;
  if (current === "0") return key.value;
  if (current.replace(".", "").length >= 8) return current;
  return current + key.value;
}

export function PinDots({ length, wrong, label }: { length: number; wrong?: boolean; label?: string }) {
  return (
    <div
      className={`pin${wrong ? " is-wrong" : ""}`}
      role="img"
      aria-label={label ?? `${length} of 4 digits typed`}
    >
      {[0, 1, 2, 3].map((index) => (
        <i key={index} className={index < length ? "on" : ""} />
      ))}
    </div>
  );
}

/** Six boxes for a pairing code, the next one ringed. */
export function CodeBoxes({ value, wrong }: { value: string; wrong?: boolean }) {
  const boxes = [0, 1, 2, 3, 4, 5].map((index) => (
    <span key={index} className={wrong ? "wrong" : index === value.length ? "at" : ""}>
      {value[index] ?? ""}
    </span>
  ));
  return (
    <div className="code-boxes" role="img" aria-label={`Pairing code, ${value.length} of 6 digits typed`}>
      {boxes.slice(0, 3)}
      <span className="gap" />
      {boxes.slice(3)}
    </div>
  );
}

/* ─── The gate: the first screens, before anyone sells ───────────────── */

export type GateStep = 1 | 2 | 3;

const GATE_STEPS = [
  { title: "Pair this device", sub: "A manager’s code makes it a till" },
  { title: "Who is selling?", sub: "Your name and your PIN" },
  { title: "Open the shift", sub: "Count the float into the drawer" },
];

/**
 * The side of a gate screen: where this device is, and the three steps to selling.
 * A paired device names its till in the first step.
 */
export function GateSide({
  lede,
  quiet,
  step,
  till,
}: {
  lede: React.ReactNode;
  quiet: React.ReactNode;
  step: GateStep | "done";
  till?: string;
}) {
  return (
    <aside className="gate-side" aria-label="Where this device is">
      <p className="lede-figure lede-20">
        {lede} <span className="q">{quiet}</span>
      </p>
      <div className="steps">
        {GATE_STEPS.map((entry, index) => {
          const n = (index + 1) as GateStep;
          const done = step === "done" || n < step;
          return (
            <div key={entry.title} className={`step${done ? " is-done" : n === step ? " is-now" : ""}`}>
              <span className="n">{done ? <Check className="ic" /> : n}</span>
              <b>{entry.title}</b>
              <span>{index === 0 && till ? `A manager’s code makes it ${till}` : entry.sub}</span>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

/* ─── Overlays ───────────────────────────────────────────────────────── */

/**
 * A modal, for the few things that must be answered before anything else:
 * an approval, something irreversible. Escape and the scrim close it.
 */
export function TillDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  foot,
  large,
  compact,
  meta,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  foot: React.ReactNode;
  large?: boolean;
  /** A large dialog at 560 wide, for a short form. */
  compact?: boolean;
  /** A quiet line beside a large dialog's title: whose sale, which shift. */
  meta?: React.ReactNode;
}) {
  const root = useTillRoot();
  const returnFocus = useReturnFocus();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal container={root ?? undefined}>
        <DialogPrimitive.Overlay className="scrim is-dialog" />
        <div className="dialog-place">
          <DialogPrimitive.Content
            className={large ? `dialog dialog-lg${compact ? " is-compact" : ""}` : "dialog"}
            onCloseAutoFocus={returnFocus}
            {...(description ? {} : { "aria-describedby": undefined })}
          >
            {large ? (
              <>
                <div className="dialog-head">
                  <DialogPrimitive.Title asChild>
                    <h2>{title}</h2>
                  </DialogPrimitive.Title>
                  {meta ? <span className="note">{meta}</span> : null}
                  <span className="end">
                    <DialogPrimitive.Close className="btn btn-quiet btn-icon" aria-label="Close">
                      <X className="ic" />
                    </DialogPrimitive.Close>
                  </span>
                </div>
                <div className="dialog-scroll">
                  {description ? (
                    <DialogPrimitive.Description asChild>
                      <p>{description}</p>
                    </DialogPrimitive.Description>
                  ) : null}
                  {children}
                </div>
              </>
            ) : (
              <div className="dialog-body">
                <DialogPrimitive.Title asChild>
                  <h2>{title}</h2>
                </DialogPrimitive.Title>
                {description ? (
                  <DialogPrimitive.Description asChild>
                    <p>{description}</p>
                  </DialogPrimitive.Description>
                ) : null}
                {children}
              </div>
            )}
            <div className="dialog-foot">{foot}</div>
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export const DialogClose = DialogPrimitive.Close;

/** A popover from the thing it is about: a line, the customer, a tile. */
export function TillPopover({
  open,
  onOpenChange,
  trigger,
  children,
  label,
  align = "start",
  side = "bottom",
  size = "md",
  arrow,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger: React.ReactNode;
  children: React.ReactNode;
  label: string;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  /** 260, 320 or 368 wide: a menu, a short form, a line or a customer. */
  size?: "sm" | "md" | "lg";
  /** A tip pointing at the thing: a line, the customer, the hold. */
  arrow?: boolean;
}) {
  const root = useTillRoot();
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal container={root ?? undefined}>
        <PopoverPrimitive.Content
          className={`pop is-till is-${size}${arrow ? " has-arrow" : ""}`}
          aria-label={label}
          align={align}
          side={side}
          sideOffset={6}
          collisionPadding={12}
        >
          {children}
          {arrow ? <PopoverPrimitive.Arrow width={10} height={5} className="pop-tip" /> : null}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export const PopoverClose = PopoverPrimitive.Close;
