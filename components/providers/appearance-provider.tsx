"use client";

import * as React from "react";

import {
  APPEARANCE_STORAGE_KEY,
  PRODUCT_THEMES,
  type AppearanceChoice,
  type Product,
  isAppearanceChoice,
  paintAppearance,
  themesForProduct,
} from "@/lib/theme/products";

export type AppearancePreference = AppearanceChoice;

type AppearanceContextValue = {
  /** The person's choice, or "light" until the device has been read. */
  appearance: AppearancePreference;
  setAppearance: (next: AppearancePreference) => void;
  /** Whether the product has a dark theme to choose (retail's Tender dark). */
  canChoose: boolean;
};

const AppearanceContext = React.createContext<AppearanceContextValue | null>(null);

function readStoredChoice(): AppearancePreference {
  try {
    const stored = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    return isAppearanceChoice(stored) ? stored : "light";
  } catch {
    return "light";
  }
}

/**
 * Light, Dark or Match the device (F-4, 00-foundations 5.1.4).
 *
 * The inline head script in `app/layout.tsx` has already painted the stored
 * choice before the first frame; this keeps `<html data-theme>` in step when
 * the choice changes and, for "Match the device", when the device does. A
 * product without a dark theme accepts only "light".
 */
export function AppearanceProvider({
  product,
  children,
}: {
  product: Product;
  children: React.ReactNode;
}) {
  const canChoose = themesForProduct(product).dark !== null;
  // Null until the stored choice is read, so the first effect pass cannot
  // repaint light over the dark the head script already put on the page.
  const [choice, setChoice] = React.useState<AppearancePreference | null>(null);

  React.useEffect(() => {
    setChoice(canChoose ? readStoredChoice() : "light");
  }, [canChoose]);

  React.useEffect(() => {
    if (choice === null) {
      return;
    }
    paintAppearance(choice, PRODUCT_THEMES);
    if (choice !== "system") {
      return;
    }
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const follow = () => paintAppearance("system", PRODUCT_THEMES);
    query.addEventListener("change", follow);
    return () => query.removeEventListener("change", follow);
  }, [choice]);

  const setAppearance = React.useCallback(
    (next: AppearancePreference) => {
      const accepted = canChoose ? next : "light";
      setChoice(accepted);
      try {
        window.localStorage.setItem(APPEARANCE_STORAGE_KEY, accepted);
      } catch {
        // Storage blocked: the choice holds for this visit only.
      }
    },
    [canChoose],
  );

  const value = React.useMemo(
    () => ({ appearance: choice ?? "light", setAppearance, canChoose }),
    [choice, setAppearance, canChoose],
  );

  return (
    <AppearanceContext.Provider value={value}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const context = React.useContext(AppearanceContext);
  if (!context) {
    throw new Error("useAppearance must be used inside AppearanceProvider");
  }
  return context;
}
