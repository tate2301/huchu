/**
 * Whether the design routes (`/kit`, `/design/<slug>`) are served: in
 * development and on preview deployments, never in production. They show the
 * kit and the fixture screens the visual test compares with the references.
 */
export function designRoutesEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV === "preview";
}
