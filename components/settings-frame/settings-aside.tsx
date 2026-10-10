import type * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import type { SettingsAsideSection } from "@/lib/retail/settings-pages";

/**
 * The aside beside a settings page's form (00-foundations 5.10.1): what the
 * page changes, who can change it, what is coming. Each section a 14/600
 * heading over bullets (a 6px `--faint` dot each) or a paragraph.
 */
export function SettingsAside({
  sections,
  under = false,
  slots = {},
}: {
  sections: SettingsAsideSection[];
  under?: boolean;
  /** What the page draws live under a section with a `slot`. */
  slots?: Record<string, React.ReactNode>;
}) {
  return (
    <aside className={cn("cx-sf-aside", under && "cx-sf-aside--under")} aria-label="About this page">
      {sections.map((section) => (
        <section key={section.title} className="cx-sf-aside__section">
          <h2>{section.title}</h2>
          {section.bullets ? (
            <ul>
              {section.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          ) : null}
          {section.text || section.link ? (
            <p>
              {section.text}
              {section.link ? (
                <>
                  {section.text ? " " : null}
                  <Link href={section.link.href}>{section.link.label}</Link>.
                </>
              ) : null}
            </p>
          ) : null}
          {section.slot ? slots[section.slot] : null}
        </section>
      ))}
    </aside>
  );
}
