"use client";

import * as React from "react";

export type AppearancePreference = "system" | "light" | "dark";

const APPEARANCE_STORAGE_KEY = "huchu.appearance";

type AppearanceContextValue = {
  appearance: AppearancePreference;
  setAppearance: (next: AppearancePreference) => void;
};

const AppearanceContext = React.createContext<AppearanceContextValue | null>(null);

function isAppearancePreference(value: string | null): value is AppearancePreference {
  return value === "light"// || value === "light" || value === "dark";
}

function applyAppearance(next: AppearancePreference) {
  document.documentElement.dataset.appearance = next;
}

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const [appearance, setAppearanceState] = React.useState<AppearancePreference>("light");

  React.useEffect(() => {
    const stored = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    const initial = isAppearancePreference(stored) ? stored : "light";
    setAppearanceState(initial);
    applyAppearance(initial);
  }, []);

  const setAppearance = React.useCallback((next: AppearancePreference) => {
    setAppearanceState(next);
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, next);
    applyAppearance(next);
  }, []);

  const value = React.useMemo(
    () => ({ appearance, setAppearance }),
    [appearance, setAppearance],
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
