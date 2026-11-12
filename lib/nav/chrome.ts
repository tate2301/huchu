/**
 * The icons the navigation chrome draws itself (the switcher, the foot, the
 * rail, the app bar and arrange mode), named so the icon build writes them.
 * Names are from the Corelith pack, design/nav/icons/icons.json.
 */
export const CHROME_ICONS = [
  { name: "switch", icon: "chevron-expand" },
  { name: "caret", icon: "chevron-right" },
  { name: "back", icon: "chevron-left" },
  { name: "previous", icon: "chevron-up" },
  { name: "next", icon: "chevron-down" },
  { name: "more", icon: "dots" },
  { name: "add", icon: "plus" },
  { name: "help", icon: "help" },
  { name: "collapse", icon: "sidebar" },
  { name: "management", icon: "management" },
  { name: "search", icon: "search" },
  { name: "bell", icon: "bell" },
  { name: "vane", icon: "vane" },
  { name: "menu", icon: "menu" },
  { name: "close", icon: "x" },
  { name: "ready", icon: "check-circle" },
  { name: "syncing", icon: "sync-pending" },
  { name: "attention", icon: "sync-error" },
  { name: "offline", icon: "cloud-off" },
  { name: "update", icon: "download" },
  { name: "show", icon: "eye" },
  { name: "hide", icon: "eye-off" },
  { name: "pin", icon: "bookmark" },
  { name: "reset", icon: "refresh" },
  { name: "person", icon: "person" },
  { name: "sign-out", icon: "pupil-slash" },
  { name: "print", icon: "printer" },
] as const;

export type ChromeIconName = (typeof CHROME_ICONS)[number]["name"];

export const CHROME_ICON: Record<ChromeIconName, string> = Object.fromEntries(
  CHROME_ICONS.map((entry) => [entry.name, entry.icon]),
) as Record<ChromeIconName, string>;
