export type MobileDateGroup<T> = {
  key: string;
  label: string;
  items: T[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(value: Date) {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

function formatDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatOlderDateLabel(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(value);
}

export function formatTicketTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "--:--";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

export function groupMobileRowsByDate<T>(
  items: T[],
  getDate: (item: T) => string,
  now = new Date(),
): MobileDateGroup<T>[] {
  const todayItems: T[] = [];
  const yesterdayItems: T[] = [];
  const olderGroups = new Map<string, MobileDateGroup<T> & { timestamp: number }>();
  const sortedItems = [...items].sort(
    (left, right) =>
      new Date(getDate(right)).getTime() - new Date(getDate(left)).getTime(),
  );
  const today = startOfDay(now);

  for (const item of sortedItems) {
    const parsed = new Date(getDate(item));
    if (Number.isNaN(parsed.getTime())) continue;

    const rowDay = startOfDay(parsed);
    const dayOffset = Math.round((today.getTime() - rowDay.getTime()) / DAY_MS);
    if (dayOffset === 0) {
      todayItems.push(item);
      continue;
    }
    if (dayOffset === 1) {
      yesterdayItems.push(item);
      continue;
    }

    const key = formatDateKey(rowDay);
    const existing = olderGroups.get(key);
    if (existing) {
      existing.items.push(item);
      continue;
    }
    olderGroups.set(key, {
      key,
      label: formatOlderDateLabel(parsed),
      items: [item],
      timestamp: rowDay.getTime(),
    });
  }

  const groups: MobileDateGroup<T>[] = [];
  if (todayItems.length > 0) {
    groups.push({ key: "today", label: "Today", items: todayItems });
  }
  if (yesterdayItems.length > 0) {
    groups.push({ key: "yesterday", label: "Yesterday", items: yesterdayItems });
  }

  groups.push(
    ...Array.from(olderGroups.values())
      .sort((left, right) => right.timestamp - left.timestamp)
      .map(({ key, label, items: groupItems }) => ({
        key,
        label,
        items: groupItems,
      })),
  );

  return groups;
}
