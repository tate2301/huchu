import {
  canTransitionOfflineLifecycle,
  resolveReadyOfflineLifecycleState,
  transitionOfflineLifecycle,
} from "@/lib/offline/lifecycle-machine";

describe("offline lifecycle machine", () => {
  it("allows expected transitions", () => {
    expect(canTransitionOfflineLifecycle("booting", "hydrating_cache")).toBe(true);
    expect(canTransitionOfflineLifecycle("ready_online", "warming")).toBe(true);
    expect(canTransitionOfflineLifecycle("syncing", "ready_offline")).toBe(true);
  });

  it("rejects invalid transitions", () => {
    expect(canTransitionOfflineLifecycle("booting", "warming")).toBe(false);
    expect(transitionOfflineLifecycle("booting", "warming")).toBe("booting");
  });

  it("resolves ready state from connectivity", () => {
    expect(resolveReadyOfflineLifecycleState(true)).toBe("ready_offline");
    expect(resolveReadyOfflineLifecycleState(false)).toBe("ready_online");
  });
});
