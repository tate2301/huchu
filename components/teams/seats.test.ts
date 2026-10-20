import { describe, expect, it } from "vitest";

import {
  addMemberLabel,
  canInvite,
  canRestore,
  fullLine,
  INVITE_WAYS_OUT,
  invitesHoldSeat,
  seatLine,
  seatsUsed,
  seatState,
} from "./seats";

describe("seatsUsed", () => {
  it("counts active members and open invites, nothing else", () => {
    const counted = seatsUsed({
      members: [{ status: "active" }, { status: "active" }, { status: "suspended" }, { status: "removed" }],
      invites: [
        { status: "sent" },
        { status: "not_delivered" },
        { status: "accepted" },
        { status: "expired" },
        { status: "revoked" },
      ],
    });
    expect(counted).toEqual({ members: 2, invites: 2, used: 4 });
  });

  it("frees the seat when an invite is revoked or a member suspended", () => {
    const before = seatsUsed({ members: [{ status: "active" }], invites: [{ status: "sent" }] });
    const after = seatsUsed({ members: [{ status: "suspended" }], invites: [{ status: "revoked" }] });
    expect(before.used).toBe(2);
    expect(after.used).toBe(0);
  });
});

describe("seatState", () => {
  it("warns on the last seat and not before", () => {
    expect(seatState(3, 5)).toBe("room");
    expect(seatState(4, 5)).toBe("last");
    expect(seatState(5, 5)).toBe("full");
    expect(seatState(6, 5)).toBe("over");
  });

  it("works out the words", () => {
    expect(seatLine(4, 5)).toBe("4 of 5 seats used");
    expect(fullLine(5)).toBe("All 5 seats are taken");
    expect(addMemberLabel(5)).toBe("Add a sixth member");
    expect(addMemberLabel(7)).toBe("Add an eighth member");
  });

  it("lets nobody invite or restore past the limit", () => {
    expect(canInvite(4, 5)).toBe(true);
    expect(canInvite(5, 5)).toBe(false);
    expect(canRestore(5, 5)).toBe(false);
    expect(canRestore(4, 5)).toBe(true);
  });
});

describe("invites", () => {
  it("holds a seat only while open", () => {
    expect(invitesHoldSeat("sent")).toBe(true);
    expect(invitesHoldSeat("not_delivered")).toBe(true);
    expect(invitesHoldSeat("accepted")).toBe(false);
    expect(invitesHoldSeat("expired")).toBe(false);
    expect(invitesHoldSeat("revoked")).toBe(false);
  });

  it("gives every state its way out", () => {
    expect(INVITE_WAYS_OUT.sent).toEqual(["Resend", "Revoke"]);
    expect(INVITE_WAYS_OUT.not_delivered).toContain("Copy the link");
    expect(INVITE_WAYS_OUT.expired).toEqual(["Send again"]);
    expect(INVITE_WAYS_OUT.accepted).toEqual([]);
  });
});
