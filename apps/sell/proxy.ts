/**
 * The Sell host's edge proxy: the kernel's, over the manifests this host
 * registers. The matcher is here because Next reads it statically; the
 * payroll and compliance APIs it names authenticate with a bare session and
 * need the proxy's gates.
 */
// The route registry reads the manifests, and the edge runtime has no boot hook.
import "@/manifests";
import { createProxy } from "@corelithzw/platform/proxy";

export default createProxy();

export const config = {
  matcher: [
    "/((?!api/auth|api|_next/static|_next/image|favicon.ico|manifest.json|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2|ttf|otf|eot|js|json|webmanifest|txt|xml)).*)",
    "/api/payroll/:path*",
    "/api/compliance/:path*",
  ],
};
