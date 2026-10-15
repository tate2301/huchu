import type { ListActionRun } from "@/lib/retail/asks/runs";

import { FEATURE_RUNS } from "./feature-words";
import { MEMBER_RUNS } from "./member-words";
import { OPERATOR_RUNS } from "./operator-words";
import { PAYMENT_RUNS } from "./payment-words";
import { SITE_RUNS } from "./site-words";
import { WORKSPACE_RUNS } from "./workspace-words";

/** Every admin list action that posts to the server (`do: { run }`), by name. */
export const ADMIN_LIST_RUNS: Readonly<Record<string, ListActionRun>> = {
  ...WORKSPACE_RUNS,
  ...MEMBER_RUNS,
  ...FEATURE_RUNS,
  ...SITE_RUNS,
  ...PAYMENT_RUNS,
  ...OPERATOR_RUNS,
};
