import type { LucideIcon } from "@/lib/icons";
import {
  Bed,
  CashRegister,
  ChartLineUp,
  ClipboardText,
  Coins,
  Drop,
  Factory,
  Flag,
  Funnel,
  IdentificationCard,
  Lightning,
  Medal,
  MedusaBookOpenIcon,
  MedusaCogSixToothIcon,
  MedusaHandTruckIcon,
  Money,
  Package,
  Storefront,
  Sun,
  Tag,
  TrayArrowDown,
  UsersThree,
} from "@/lib/icons";
import type { NavItem } from "@/lib/navigation";
import type { WorkspaceNavSection } from "@/lib/workspaces";

/**
 * An area: one mark in tier one, one panel of destinations in tier two.
 *
 * Areas are not a second navigation model. They are the one the product
 * already has, read at the level the rail can afford: a section that flattens
 * its groups contributes each group, a section that does not contributes
 * itself. Nothing here invents a destination or moves one between modules —
 * that all still happens in `getWorkspaceSidebarModel`.
 */
export type RailArea = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
};

/**
 * The mark an area is known by.
 *
 * Keyed by the group or section id the navigation model already uses, so a new
 * area arrives with a sensible icon the moment it is added there — a mapping
 * is only needed when the automatic choice (the first destination's icon)
 * would be wrong, or would collide with a neighbour.
 *
 * The collisions are the point. Results and Insights are both charts in the
 * generic set; Conduct and an overdue invoice are both warning triangles. In a
 * column of unlabelled marks that is the difference between navigating and
 * guessing, so each area below owns its mark outright.
 */
const AREA_ICONS: Record<string, LucideIcon> = {
  // Campus
  "school-day": Sun,
  students: UsersThree,
  teaching: MedusaBookOpenIcon,
  results: Medal,
  conduct: Flag,
  boarding: Bed,
  fees: Money,
  staff: IdentificationCard,
  school: MedusaCogSixToothIcon,
  // Retail and stock
  "retail-floor": Storefront,
  "retail-range": Tag,
  selling: Tag,
  stock: Package,
  "retail-buy": TrayArrowDown,
  "retail-control": ChartLineUp,
  pos: CashRegister,
  // CRM
  objects: Funnel,
  work: ClipboardText,
  documents: Money,
  learn: ChartLineUp,
  workflows: Lightning,
  setup: MedusaCogSixToothIcon,
  // Gold, plant and stores
  "gold-operations": Factory,
  "gold-chain": MedusaHandTruckIcon,
  "gold-control": ChartLineUp,
  stores: Package,
  fuel: Drop,
  // Payroll
  "payroll-month-end": Money,
  "payroll-statutory": ClipboardText,
  "payroll-compensation": Coins,
};

/**
 * Areas a rail draws as one.
 *
 * Staff and Families are two populations of adults, and neither is big enough
 * to earn a mark of its own beside eight others. The merge happens here rather
 * than in the navigation model because the model is also read by the page,
 * where the two lists are genuinely separate.
 */
const AREA_MERGES: Record<string, string> = {
  families: "staff",
};

/**
 * The name an area carries in the rail, where it differs from the navigation
 * model's own label.
 *
 * Every rename is the same rule: name the moment or the population, not the
 * module. "The school day" is what the timetable is called in a staff room;
 * "Today" is what it is at half past seven, which is when this area is opened.
 */
const AREA_LABELS: Record<string, string> = {
  "school-day": "Today",
  students: "Pupils",
  teaching: "Learning",
  staff: "Staff and families",
  school: "The school",
  "retail-floor": "The floor",
  "retail-range": "Products",
  selling: "Products",
  stock: "Stock",
  "retail-buy": "Buying",
  "retail-control": "Insights",
  objects: "Pipeline",
  documents: "Money",
  learn: "Insights",
  workflows: "Automation",
  "gold-operations": "Production",
  "gold-chain": "Movement",
  "gold-control": "Insights",
};

function iconFor(id: string, items: NavItem[]): LucideIcon {
  return AREA_ICONS[id] ?? items[0]?.icon ?? MedusaCogSixToothIcon;
}

/**
 * The name an area is known by in the maps above.
 *
 * A workspace recipe builds its own sections and prefixes their ids with the
 * module that owns them — the campus bands arrive as `schools-students`, not
 * `students`. The maps are keyed on the bare name because that is what the
 * band is called everywhere else, so the key is resolved in three steps: the
 * section's own id, then the id with its module prefix removed, then the group
 * every one of its items shares. First hit wins; nothing hits, and the area
 * keeps its own id and its first destination's icon, which is the behaviour
 * any new section gets for free.
 */
function keyFor(id: string, items: NavItem[]): string {
  if (id in AREA_LABELS || id in AREA_ICONS || id in AREA_MERGES) return id;
  const withoutPrefix = id.includes("-") ? id.slice(id.indexOf("-") + 1) : id;
  if (
    withoutPrefix in AREA_LABELS ||
    withoutPrefix in AREA_ICONS ||
    withoutPrefix in AREA_MERGES
  ) {
    return withoutPrefix;
  }
  const groups = new Set(items.map((item) => item.group).filter(Boolean));
  if (groups.size === 1) {
    const only = [...groups][0] as string;
    if (only in AREA_LABELS || only in AREA_ICONS || only in AREA_MERGES) {
      return only;
    }
  }
  return id;
}

/**
 * Read a workspace's sections as areas.
 *
 * A section that flattens its groups was already saying that its groups are
 * the destinations people think in — the campus rail has said so since
 * `flattenGroups` was added. This takes it at its word.
 */
export function areasFromSections(
  sections: WorkspaceNavSection[],
  { flatten = true }: { flatten?: boolean } = {},
): RailArea[] {
  const areas: RailArea[] = [];
  const byId = new Map<string, RailArea>();

  const push = (rawId: string, label: string, items: NavItem[]) => {
    if (items.length === 0) return;
    const id = keyFor(rawId, items);
    const targetId = AREA_MERGES[id] ?? id;
    const existing = byId.get(targetId);
    if (existing) {
      existing.items = [...existing.items, ...items];
      return;
    }
    const area: RailArea = {
      id: targetId,
      label: AREA_LABELS[targetId] ?? label,
      icon: iconFor(targetId, items),
      items,
    };
    byId.set(targetId, area);
    areas.push(area);
  };

  for (const section of sections) {
    const groups = section.groups ?? [];
    const populated = groups.filter((group) =>
      section.items.some((item) => item.group === group.id),
    );
    // A section that declares more than one populated group is telling us its
    // items divide — Range & Stock is what we sell *and* what we hold, which
    // is two questions and therefore two areas. One group is just a heading
    // over the whole section, and the section stays whole.
    if (flatten && (section.flattenGroups || populated.length > 1)) {
      const ungrouped = section.items.filter((item) => !item.group);
      if (ungrouped.length > 0) {
        push(section.id, AREA_LABELS[section.id] ?? section.title, ungrouped);
      }
      for (const group of populated) {
        push(
          group.id,
          AREA_LABELS[group.id] ?? group.label,
          section.items.filter((item) => item.group === group.id),
        );
      }
      continue;
    }
    push(section.id, AREA_LABELS[section.id] ?? section.title, section.items);
  }

  return areas;
}

/**
 * An area of one is a row, not a mark.
 *
 * A single destination does not earn a slot in a column of eight — it is one
 * row in the map and nothing else. Campus arrives with two of them (Overview
 * and School reports), which is the difference between ten areas and twelve.
 */
export function splitLooseAreas(areas: RailArea[]): {
  areas: RailArea[];
  loose: NavItem[];
} {
  const kept: RailArea[] = [];
  const loose: NavItem[] = [];
  for (const area of areas) {
    if (area.items.length <= 1) {
      loose.push(...area.items);
      continue;
    }
    kept.push(area);
  }
  return { areas: kept, loose };
}
