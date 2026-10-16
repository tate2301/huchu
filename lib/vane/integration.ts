import type { Integration } from "@/lib/integrations/types";

/**
 * Vane, as an integration: Corelith's own, the first built on operations.
 * It proposes them, on its cards and in its answers, and each one waits for
 * a person to approve it; it then runs as that person (`lib/vane/actions/engine.ts`).
 */
export const VANE_INTEGRATION: Integration = {
  key: "vane",
  name: "Vane",
  maker: "Corelith",
  summary: "Reads the workspace, says what needs doing, and does it once a person approves.",
  uses: ["*"],
  runs: "on-approval",
};
