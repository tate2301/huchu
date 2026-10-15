"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { Button, ButtonLink, Icon, Kit, VaneMark } from "@/components/core";
import { useVaneActions } from "@/components/vane/use-vane";
import { fetchJson } from "@/lib/api-client";
import { exploreHref } from "@/lib/explore/questions";
import type { VaneCard } from "@/lib/vane/panel";

import "./explore.css";

/** "Explore this list": the list's own question, opened in Explore. */
export function ExploreThisList({ sql, title }: { sql: string; title: string }) {
  return (
    <ButtonLink href={exploreHref({ sql, title })} icon="explore">
      Explore this list
    </ButtonLink>
  );
}

/**
 * Vane's suggestions for the list on screen (the ExploreSuggest board): the
 * toolbar's Vane slot with how many there are, and a popover of them, each
 * with its act and Not now. The cards are Vane's own (`subjectType` List, by
 * the list's path); Vane only proposes, and a person presses the act, which
 * goes to the page where they do it.
 */
export function ListVane({ path }: { path: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const wrap = React.useRef<HTMLDivElement>(null);
  const pop = React.useRef<HTMLDivElement>(null);
  // The toolbar scrolls sideways, so the popover is drawn over the page, under the button.
  const [at, setAt] = React.useState<{ top: number; right: number } | null>(null);
  const cards = useQuery({
    queryKey: ["vane", "record", "List", path],
    queryFn: () => fetchJson<VaneCard[]>(`/api/vane/record?type=List&id=${encodeURIComponent(path)}`),
    staleTime: 60_000,
  });
  const { notNow, act } = useVaneActions();
  const list = cards.data ?? [];

  React.useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!wrap.current?.contains(target) && !pop.current?.contains(target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={wrap} className="ex-listvane">
      <button
        type="button"
        className="btn is-vane"
        aria-label={list.length ? `Vane, ${list.length} for this list` : "Vane, nothing for this list"}
        aria-expanded={open}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setAt({ top: rect.bottom + 8, right: Math.max(16, window.innerWidth - rect.right) });
          setOpen((on) => !on);
        }}
      >
        <VaneMark size={16} />
        {list.length ? <span className="vn-c">{list.length}</span> : null}
      </button>
      {open && at
        ? createPortal(
        <Kit contents>
          <div ref={pop} className="popover ex-pop" role="dialog" aria-label="For this list" style={{ top: at.top, right: at.right }}>
            <div className="ex-pop-h">
              <VaneMark size={16} />
              <b>For this list</b>
              <span className="muted">{list.length}</span>
            </div>
            {list.length === 0 ? (
              <p className="muted ex-pop-none">
                Nothing yet. Vane suggests here when it sees you do the same thing with this list each week.
              </p>
            ) : (
              list.map((card, index) => (
                <div key={card.id} className="ex-pop-card">
                  <b>{card.headline}</b>
                  <p>{card.body}</p>
                  <div className="ex-pop-acts">
                    {card.action ? (
                      <Button
                        variant={index === 0 ? "primary" : "default"}
                        icon={card.action.type === "send" ? "send" : "explore"}
                        shortcut={index === 0 ? (card.action.shortcut ?? "S") : undefined}
                        onClick={() => {
                          act.mutate({ id: card.id });
                          setOpen(false);
                          router.push(card.action!.target);
                        }}
                      >
                        {card.action.label}
                      </Button>
                    ) : null}
                    <Button variant="quiet" icon="muted" onClick={() => notNow.mutate({ id: card.id, reason: "Not now" })}>
                      Not now
                    </Button>
                  </div>
                </div>
              ))
            )}
            <div className="ex-pop-foot">
              <Icon name="foryou" />
              <a href="/vane">Everything Vane has for you</a>
            </div>
          </div>
        </Kit>,
        document.body,
      )
        : null}
    </div>
  );
}
