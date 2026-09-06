import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The session reaches `SessionProvider` from the server.
 *
 * A source-shape test, not a behaviour test, because the thing being protected is
 * a wiring decision that nothing else fails loudly about. Without it,
 * `useSession()` has no data during SSR, every client component that reads it
 * renders its signed-out shape into the HTML, and React throws a hydration error
 * on the first paint of every page. The sidebar was the visible casualty — the
 * workspace model falls back to the first profile when given no role and no
 * features, so the server sent one module's label and icon and the browser
 * replaced them with another's.
 *
 * That failure is invisible to unit tests, invisible to typecheck, and easy to
 * reintroduce by "tidying" an unused-looking prop. Hence this.
 */

const LAYOUT = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");
const PROVIDERS = readFileSync(
  join(process.cwd(), "components/providers/app-providers.tsx"),
  "utf8",
);

describe("session during SSR", () => {
  it("the root layout resolves the session on the server", () => {
    expect(LAYOUT).toMatch(/getServerSession\(authOptions\)/);
  });

  it("the root layout hands it to the providers", () => {
    expect(LAYOUT).toMatch(/<AppProviders session=\{session\}>/);
  });

  it("the providers hand it to SessionProvider", () => {
    // Not merely accepted as a prop: forwarded. An `AppProviders` that takes
    // `session` and drops it typechecks and reintroduces the bug.
    expect(PROVIDERS).toMatch(/<SessionProvider[\s\S]{0,200}session=\{session\}/);
  });
});
