import { describe, expect, it } from "vitest";

import { PEOPLE_LIST_RUNS, inviteHandOverAsk } from "./people";

/**
 * "Send the invite again" from People's row menu (80-admin 5.1, 5.5.4): when
 * WhatsApp did not take it, the new link and PIN come up at once, shown once.
 */
describe("sending the invite again from the row", () => {
  const answer = {
    data: { name: "Ruvimbo Chari" },
    sent: { whatsapp: false, error: "WhatsApp is not set up" },
    handOver: { link: "https://hurudza.example/join/abc", pin: "4829" },
  };

  it("hands over the new link and PIN", () => {
    const ask = PEOPLE_LIST_RUNS.inviteagain!.after!(answer)!;
    expect(ask.title).toBe("Give Ruvimbo Chari the invite yourself");
    expect(ask.body).toContain("WhatsApp is not set up, so give Ruvimbo Chari these yourself. They are not shown again.");
    expect(ask.body).toContain("Link · https://hurudza.example/join/abc");
    expect(ask.body).toContain("Till PIN · 4 8 2 9");
    expect(ask.go).toBe("");
  });

  it("says the link alone when there is no PIN, and nothing when WhatsApp took it", () => {
    expect(inviteHandOverAsk("Kuda Banda", { link: "https://x/join/1", pin: null }, "timeout").body).toMatch(
      /^WhatsApp did not take it \(timeout\), so give Kuda Banda this yourself\. It is not shown again\./,
    );
    expect(PEOPLE_LIST_RUNS.inviteagain!.after!({ data: { name: "Kuda Banda" }, sent: { whatsapp: true } })).toBeNull();
    expect(PEOPLE_LIST_RUNS.inviteagain!.done(1, [], { data: { name: "Kuda Banda" }, sent: { whatsapp: true } })).toBe(
      "Invite sent again to Kuda Banda.",
    );
  });
});
