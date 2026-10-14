import Link from "next/link";

import { WorkspaceMark } from "@/components/admin/workspace-mark";
import type { QueueItem } from "@/lib/admin/queue";
import { ChevronRight } from "@/lib/icons";

/**
 * Home's queue. An item that acts on a workspace wears that workspace's strip
 * — the same tint as the scope bar inside it — so it is plain, before opening
 * it, which workspace the work lands on.
 */
export function QueueList({ items }: { items: QueueItem[] }) {
  if (items.length === 0) {
    return <p className="py-10 text-center t-body text-[var(--text-muted)]">Nothing is waiting on Corelith staff.</p>;
  }
  return (
    <ul className="space-y-3 pb-10">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={item.href}
            className="group block overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] no-underline hover:border-[var(--line-strong)]"
          >
            {item.workspace ? (
              <span className="flex h-8 items-center gap-2 border-b border-[var(--sel-line)] bg-[var(--sel-bg)] px-3 text-[13px] text-[var(--ink)] shadow-[inset_3px_0_0_var(--action)]">
                <WorkspaceMark product={item.workspace.product} profile={item.workspace.profile} size="sm" className="size-5 [&_svg]:size-3" />
                Acts on <span className="font-semibold">{item.workspace.name}</span>
                <span className="font-mono text-xs text-[var(--ink-3)]">{item.workspace.slug}</span>
              </span>
            ) : (
              <span className="flex h-8 items-center gap-2 border-b border-[var(--line)] px-3 text-[13px] text-[var(--ink-2)]">The admin portal</span>
            )}
            <span className="flex items-start gap-3 px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-[var(--ink)]">{item.title}</span>
                <span className="block truncate text-[13px] text-[var(--text-muted)]">{item.detail}</span>
              </span>
              {item.meta ? <span className="whitespace-nowrap font-mono text-xs text-[var(--text-subtle)]">{item.meta}</span> : null}
              <ChevronRight className="mt-0.5 size-3.5 text-[var(--text-disabled)] group-hover:text-[var(--text-subtle)]" aria-hidden="true" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
