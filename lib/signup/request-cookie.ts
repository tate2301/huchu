import { cookies } from "next/headers";

import { getSignupRequest } from "@/lib/signup/service";
import { SIGNUP_COOKIE } from "@/lib/signup/http";

/** The signup this browser is part way through, read on a page render. */
export async function readCurrentSignupRequest() {
  const cookieStore = await cookies();
  return getSignupRequest(cookieStore.get(SIGNUP_COOKIE)?.value);
}
