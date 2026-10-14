import type { ActivityItem } from "@/lib/admin/activity";
import { formatTime } from "@/lib/admin/format";
import { Badge as OperatorIcon, Buildings, User } from "@/lib/icons";

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Harare" });
const KEY = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Harare" });

function dayLabel(at: Date, now: Date) {
  const key = KEY.format(at);
  if (key === KEY.format(now)) return "Today";
  if (key === KEY.format(new Date(now.getTime() - 24 * 60 * 60 * 1000))) return "Yesterday";
  return DAY.format(at);
}

const ICON = { operator: OperatorIcon, member: User, system: Buildings };

/**
 * A workspace's history, a day at a time. Who did it comes first and in ink;
 * an operator's actions carry their badge mark, so staff work stands out
 * from the customer's own.
 */
export function ActivityFeed({ items, now = new Date() }: { items: ActivityItem[]; now?: Date }) {
  if (items.length === 0) {
    return <p className="t-body text-[var(--text-muted)]">Nothing has happened here yet.</p>;
  }

  const days: Array<{ label: string; items: ActivityItem[] }> = [];
  for (const item of items) {
    const label = dayLabel(item.at, now);
    const last = days[days.length - 1];
    if (last?.label === label) last.items.push(item);
    else days.push({ label, items: [item] });
  }

  return (
    <div className="space-y-6">
      {days.map((day) => (
        <section key={day.label} aria-label={day.label}>
          <h2 className="t-label-sm mb-2 text-[var(--text-muted)]">{day.label}</h2>
          <ol className="space-y-0">
            {day.items.map((item) => {
              const Icon = ICON[item.actor.kind];
              return (
                <li key={item.id} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-start gap-3 py-2">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 inline-flex size-6 items-center justify-center rounded-full bg-[var(--tray)] text-[var(--ink-2)] [&_svg]:size-3.5"
                  >
                    <Icon />
                  </span>
                  <div className="min-w-0 t-body text-[var(--text-body)]">
                    <span className="font-semibold text-[var(--ink)]">{item.actor.name}</span> {item.did}
                    {item.actor.kind === "operator" ? <span className="text-[var(--text-muted)]"> (Corelith staff)</span> : null}
                    {item.reason ? <p className="t-body-sm text-[var(--text-muted)]">“{item.reason}”</p> : null}
                  </div>
                  <time dateTime={item.at.toISOString()} className="font-mono text-xs tabular-nums text-[var(--text-subtle)]">
                    {formatTime(item.at)}
                  </time>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
