import { Icon, type IconName } from "@/components/core";

/** Each module's icon, by the key the app gives it; its hue is `[data-module]` in parts.css. */
const MODULE_ICONS: Record<string, IconName> = {
  books: "books",
  crm: "pipeline",
  retail: "store",
  reports: "reports",
  people: "person",
  payroll: "money",
  schools: "users",
  gold: "grade",
  assets: "inspections",
  vane: "foryou",
};

export function moduleIcon(module: string | null | undefined): IconName {
  return (module && MODULE_ICONS[module]) || "foryou";
}

/** The module a card or action is about, as a pill in its hue: "Books", "Tender". */
export function VaneModuleTag({ module, name }: { module: string; name: string }) {
  return (
    <span className="vn-tag" data-module={module}>
      <Icon name={moduleIcon(module)} />
      {name}
    </span>
  );
}
