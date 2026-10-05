"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { PANEL_COOKIE } from "@/lib/rail/panel-cookie";

/**
 * The shell's own state (00-foundations 5.3): whether the module panel is
 * open, the phone drawer, the command palette and the notification panel.
 *
 * Three widths (5.3.8):
 * - wide (≥1100px): rail and panel side by side; the panel's open state is the
 *   `sidebar:state` cookie, read by the root layout so the first paint agrees.
 * - mid (720–1099px): rail only; the panel opens over the page and closes on
 *   navigation.
 * - phone (<720px): no rail; the header's menu button opens a drawer.
 */
export type ShellWidth = "wide" | "mid" | "phone";

const PANEL_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

type ShellState = {
  width: ShellWidth;
  /** The panel is on screen beside or over the page. */
  panelShown: boolean;
  /** The panel sits over the page rather than beside it. */
  panelOverlay: boolean;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;
  notificationsOpen: boolean;
  setNotificationsOpen: (open: boolean) => void;
};

const ShellContext = React.createContext<ShellState | null>(null);

function useWidth(): ShellWidth {
  const [width, setWidth] = React.useState<ShellWidth>("wide");
  React.useEffect(() => {
    const wide = window.matchMedia("(min-width: 1100px)");
    const phone = window.matchMedia("(max-width: 719px)");
    const update = () => setWidth(wide.matches ? "wide" : phone.matches ? "phone" : "mid");
    update();
    wide.addEventListener("change", update);
    phone.addEventListener("change", update);
    return () => {
      wide.removeEventListener("change", update);
      phone.removeEventListener("change", update);
    };
  }, []);
  return width;
}

export function ShellProvider({
  defaultPanelOpen = true,
  children,
}: {
  defaultPanelOpen?: boolean;
  children: React.ReactNode;
}) {
  const width = useWidth();
  const pathname = usePathname();
  const [panelOpen, setPanelOpen] = React.useState(defaultPanelOpen);
  const [overlayOpen, setOverlayOpen] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [commandOpen, setCommandOpen] = React.useState(false);
  const [notificationsOpen, setNotificationsOpen] = React.useState(false);

  const persist = React.useCallback((open: boolean) => {
    setPanelOpen(open);
    document.cookie = `${PANEL_COOKIE}=${open}; path=/; max-age=${PANEL_COOKIE_MAX_AGE}`;
  }, []);

  // The overlay and the drawer close on navigation; the wide panel stays.
  const [lastPath, setLastPath] = React.useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOverlayOpen(false);
    setDrawerOpen(false);
  }

  const openPanel = React.useCallback(() => {
    if (width === "wide") persist(true);
    else if (width === "mid") setOverlayOpen(true);
    else setDrawerOpen(true);
  }, [persist, width]);

  const closePanel = React.useCallback(() => {
    if (width === "wide") persist(false);
    else if (width === "mid") setOverlayOpen(false);
    else setDrawerOpen(false);
  }, [persist, width]);

  const panelShown = width === "wide" ? panelOpen : width === "mid" ? overlayOpen : drawerOpen;

  const togglePanel = React.useCallback(() => {
    if (panelShown) closePanel();
    else openPanel();
  }, [closePanel, openPanel, panelShown]);

  // ⌘B / Ctrl+B toggles the panel from anywhere, as the chevron does.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "b" && (event.metaKey || event.ctrlKey) && !event.altKey) {
        event.preventDefault();
        togglePanel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [togglePanel]);

  const value = React.useMemo<ShellState>(
    () => ({
      width,
      panelShown,
      panelOverlay: width === "mid",
      openPanel,
      closePanel,
      togglePanel,
      drawerOpen,
      setDrawerOpen,
      commandOpen,
      setCommandOpen,
      notificationsOpen,
      setNotificationsOpen,
    }),
    [closePanel, commandOpen, drawerOpen, notificationsOpen, openPanel, panelShown, togglePanel, width],
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellState {
  const context = React.useContext(ShellContext);
  if (!context) throw new Error("useShell must be used within ShellProvider");
  return context;
}
