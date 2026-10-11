/**
 * What this device does for whoever sells on it: sounds, a dim screen, larger
 * text. Kept in the browser (one till, one counter), not in the back office;
 * Till settings changes them. Storage that is blocked gives the defaults.
 */

import { useSyncExternalStore } from "react";

export type DevicePrefs = {
  /** A tick on add, low blips for an unknown code, two notes when paid. */
  sounds: boolean;
  /** Tender dark, for a night shift or a bar with the lights down. */
  dim: boolean;
  /** Type a step larger and touch targets at 56px, for reading at arm's length. */
  large: boolean;
};

const DEFAULTS: DevicePrefs = { sounds: true, dim: false, large: false };
const KEY = "till:device";
const CHANGED = "till:device-changed";

let cached: { raw: string | null; prefs: DevicePrefs } = { raw: null, prefs: DEFAULTS };

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** The same object while nothing changed, as `useSyncExternalStore` needs. */
export function devicePrefs(): DevicePrefs {
  if (typeof window === "undefined") return DEFAULTS;
  const raw = readRaw();
  if (raw === cached.raw) return cached.prefs;
  let stored: Partial<DevicePrefs> = {};
  try {
    stored = raw ? (JSON.parse(raw) as Partial<DevicePrefs>) : {};
  } catch {
    // Not ours any more: the defaults.
  }
  const prefs: DevicePrefs = {
    sounds: typeof stored.sounds === "boolean" ? stored.sounds : DEFAULTS.sounds,
    dim: typeof stored.dim === "boolean" ? stored.dim : DEFAULTS.dim,
    large: typeof stored.large === "boolean" ? stored.large : DEFAULTS.large,
  };
  cached = { raw, prefs };
  return prefs;
}

export function setDevicePrefs(patch: Partial<DevicePrefs>) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...devicePrefs(), ...patch }));
  } catch {
    // Storage blocked: the setting goes back to its default with the next reload.
  }
  window.dispatchEvent(new Event(CHANGED));
}

function subscribe(callback: () => void) {
  window.addEventListener(CHANGED, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGED, callback);
    window.removeEventListener("storage", callback);
  };
}

/** The defaults on the server and the first paint, then this device's own. */
export function useDevicePrefs(): DevicePrefs {
  return useSyncExternalStore(subscribe, devicePrefs, () => DEFAULTS);
}
