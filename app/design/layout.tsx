import { notFound } from "next/navigation";

import { Kit } from "@/components/core";
import { designRoutesEnabled } from "@/lib/design/routes";

/**
 * `/design/<slug>`: each core modules screen with the fixed Floorcode data it
 * was drawn with, full page and outside the app's shell, so the visual test
 * (design/core-modules/tests/visual.spec.ts) compares like with like. Real
 * routes use real data. Development and previews only.
 *
 * The test asks for dark by setting `data-theme="dark"` on <html>; the app's
 * dark theme is `corelith-dark`, so the script below answers one with the
 * other.
 */
const DARK_SCRIPT = `(function(){var r=document.documentElement;function f(){if(r.getAttribute("data-theme")==="dark"){r.setAttribute("data-theme","corelith-dark");r.style.colorScheme="dark";}}new MutationObserver(f).observe(r,{attributes:true,attributeFilter:["data-theme"]});f();})();`;

export default function DesignLayout({ children }: { children: React.ReactNode }) {
  if (!designRoutesEnabled()) notFound();
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: DARK_SCRIPT }} />
      <Kit className="design-fixture">{children}</Kit>
    </>
  );
}
