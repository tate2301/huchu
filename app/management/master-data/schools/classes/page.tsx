"use client";

import { ClassesRegister } from "./classes-register";

/**
 * The year-group ladder and the streams inside each one.
 *
 * The register draws its own shell, its own header and its own two columns, so
 * the route is the route and nothing else. No `description`: rule 1 deletes the
 * helper line and rule 4 deletes the band it sat in.
 */
export default function SchoolsClassesMasterDataPage() {
  return <ClassesRegister />;
}
