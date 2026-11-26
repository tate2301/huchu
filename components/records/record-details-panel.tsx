"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";

import { IconButton } from "@/components/ui/icon-button";
import { Kbd } from "@/components/ui/kbd";
import { SidebarRight, X } from "@/lib/icons";
import { cn } from "@/lib/utils";

/** Where the panel's open state and width are remembered, across records. */
const OPEN_KEY = "record-details-open";
const WIDTH_KEY = "record-details-width";

const MIN_WIDTH = 340;
const MAX_WIDTH = 720;
const DEFAULT_WIDTH = 420;
/** What the record itself keeps beside an open panel before the panel gives way. */
const MAIN_MIN = 520;
/** Below this record width the panel floats over the record instead of pushing it. */
const OVERLAY_BELOW = 1100;
/** How far an arrow key moves the edge. */
const KEY_STEP = 24;

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Everything on the page reading a stored value, told when one changes. */
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function store(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private windows and blocked storage: the panel still works for this
    // page, it just forgets.
  }
  listeners.forEach((listener) => listener());
}

/**
 * A remembered value, read without a hydration mismatch: the server and the
 * first client render both see `null`, and the stored value arrives straight
 * after.
 */
function useStored(key: string) {
  return useSyncExternalStore(
    subscribe,
    () => readStored(key),
    () => null,
  );
}

/** Typing somewhere, where a bare letter is a letter and not a shortcut. */
function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) ||
    Boolean(target.closest("[contenteditable='true']"))
  );
}

/** A dialog, sheet or menu is up, and the keyboard is its. */
function overlayOpen() {
  return Boolean(
    document.querySelector(
      "[role='dialog'][data-state='open'], [role='alertdialog'][data-state='open'], [role='menu'][data-state='open']",
    ),
  );
}

/**
 * The record's Details panel: open, shut, how wide.
 *
 * Shut by default. The record's own page already carries its name, its figures
 * and its next move; the panel is where its properties and side facts are, and
 * it is opened on purpose — with D, or the button in the corner — and stays
 * open from record to record once somebody wants it.
 *
 * Both live in storage rather than in state, so every record reads the same
 * answer; while the edge is being dragged the width is the drag's own.
 */
export function useRecordDetailsPanel(recordRef: RefObject<HTMLElement | null>) {
  const open = useStored(OPEN_KEY) === "open";
  const saved = Number.parseInt(useStored(WIDTH_KEY) ?? "", 10);
  const storedWidth = Number.isFinite(saved)
    ? Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, saved))
    : DEFAULT_WIDTH;
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const width = dragWidth ?? storedWidth;
  const [resizing, setResizing] = useState(false);
  const [snapping, setSnapping] = useState(false);
  const [overlay, setOverlay] = useState(false);

  // Whether the panel floats, from the record's own width rather than the
  // window's: the app's sidebar and Vane both take room from the record, and
  // a 1280px window with both open has less space than a 1024px one without.
  useEffect(() => {
    const element = recordRef.current;
    if (!element) return;
    const measure = () => setOverlay(element.clientWidth < OVERLAY_BELOW);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [recordRef]);

  const setOpen = useCallback((next: boolean) => {
    store(OPEN_KEY, next ? "open" : "closed");
  }, []);

  const toggle = useCallback(() => {
    store(OPEN_KEY, readStored(OPEN_KEY) === "open" ? "closed" : "open");
  }, []);

  // D anywhere on the record; Escape shuts a floating panel. Not while
  // somebody is typing, and not while a dialog owns the keyboard.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTyping(event.target) || overlayOpen()) return;
      if (event.key === "d" || event.key === "D") {
        event.preventDefault();
        toggle();
      } else if (event.key === "Escape" && overlay && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, overlay, setOpen, toggle]);

  /** The widest the panel may be with the record still readable beside it. */
  const maxWidth = useCallback(() => {
    const total = recordRef.current?.clientWidth ?? 0;
    if (overlay) return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, total));
    return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, total - MAIN_MIN));
  }, [overlay, recordRef]);

  const clamp = useCallback(
    (value: number) => Math.max(MIN_WIDTH, Math.min(maxWidth(), value)),
    [maxWidth],
  );

  const commit = useCallback((value: number) => {
    store(WIDTH_KEY, String(Math.round(value)));
    setDragWidth(null);
  }, []);

  const drag = useRef<{ x: number; width: number } | null>(null);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, width };
    setResizing(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const wanted = drag.current.width + (drag.current.x - event.clientX);
    const max = maxWidth();
    // Past either limit the edge still follows the pointer, a fifth as far, so
    // the limit is felt rather than hit — and springs back on release.
    const banded =
      wanted < MIN_WIDTH
        ? MIN_WIDTH - (MIN_WIDTH - wanted) * 0.18
        : wanted > max
          ? max + (wanted - max) * 0.18
          : wanted;
    setDragWidth(banded);
  };

  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    setResizing(false);
    const settled = clamp(width);
    if (Math.abs(settled - width) > 0.5) {
      setSnapping(true);
      window.setTimeout(() => setSnapping(false), 260);
    }
    commit(settled);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    commit(clamp(width + (event.key === "ArrowLeft" ? KEY_STEP : -KEY_STEP)));
  };

  return {
    open,
    setOpen,
    toggle,
    width,
    overlay,
    resizing,
    snapping,
    handle: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onDoubleClick: () => commit(clamp(DEFAULT_WIDTH)),
      onKeyDown,
      "aria-valuemin": MIN_WIDTH,
      "aria-valuemax": MAX_WIDTH,
      "aria-valuenow": Math.round(width),
    },
  };
}

export type RecordDetailsPanelState = ReturnType<typeof useRecordDetailsPanel>;

/**
 * The panel itself: a resize edge, a head naming the record, and its sections.
 *
 * Kept mounted while shut, and `inert`, so opening it is a width change rather
 * than a remount — scroll position and any half-edited property survive a
 * toggle.
 */
export function RecordDetailsPanel({
  panel,
  title,
  reference,
  quickActions,
  children,
}: {
  panel: RecordDetailsPanelState;
  title: string;
  reference?: string | null;
  /** One row of the things done *to* the record from here — Call, Email, Message. */
  quickActions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className="rec-pw"
      data-open={panel.open || undefined}
      aria-hidden={!panel.open}
      inert={!panel.open}
    >
      <div
        className="rec-rz"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize details"
        tabIndex={0}
        {...panel.handle}
      />
      <aside className="rec-panel" aria-label="Details">
        <div className="rec-ph">
          <div className="min-w-0 flex-1">
            <b className="block truncate">{title}</b>
            {reference ? <span className="rec-ph-ref">{reference}</span> : null}
          </div>
          <IconButton size="sm" aria-label="Close details" onClick={() => panel.setOpen(false)}>
            <X />
          </IconButton>
        </div>
        {quickActions ? <div className="rec-pq">{quickActions}</div> : null}
        {children}
      </aside>
    </div>
  );
}

/**
 * The corner button that opens and shuts the panel.
 *
 * It says what it does and the key that does the same, because the key is the
 * faster way and a control is where people learn one. While a floating panel
 * is open it steps aside: the panel's own close is right there.
 */
export function RecordDetailsFab({ panel }: { panel: RecordDetailsPanelState }) {
  return (
    <button
      type="button"
      className={cn("rec-fab", panel.open && "is-open")}
      onClick={panel.toggle}
      aria-label={panel.open ? "Close details" : "Open details"}
      aria-keyshortcuts="D"
      aria-expanded={panel.open}
    >
      <span className="rec-fab-i" aria-hidden="true">
        <SidebarRight className="rec-fab-p" weight="regular" />
        <X className="rec-fab-x" />
      </span>
      <span className="rec-fab-l">{panel.open ? "Close" : "Details"}</span>
      <Kbd className="rec-fab-k">D</Kbd>
    </button>
  );
}
