import { cn } from "@/lib/utils";
import type { SettingsAsideSection } from "@/lib/retail/settings-pages";

/**
 * The aside beside a settings page's form (00-foundations 5.10.1): what the
 * page changes, who can change it, what is coming. Each section a 14/600
 * heading over bullets (a 6px `--faint` dot each) or a paragraph.
 */
export function SettingsAside({ sections, under = false }: { sections: SettingsAsideSection[]; under?: boolean }) {
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
          {section.text ? <p>{section.text}</p> : null}
        </section>
      ))}
    </aside>
  );
}
