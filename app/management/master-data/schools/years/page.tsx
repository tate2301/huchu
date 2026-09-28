"use client";

import { YearsRegister } from "./years-register";

/**
 * Years, terms and the frame everything else is dated against.
 *
 * Set up once a year by an administrator, which is what makes it master data
 * rather than daily work. The old `/schools/academics` route redirects here.
 */
export default function SchoolsYearsMasterDataPage() {
  return <YearsRegister />;
}
