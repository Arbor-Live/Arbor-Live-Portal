import { describe, expect, it } from "vitest";
import { initialAuthBinding, nextAuthBinding } from "./convex-better-auth";

describe("nextAuthBinding", () => {
  it("keeps the key when the session loads behind a server-rendered token", () => {
    const start = initialAuthBinding(true);
    const loaded = nextAuthBinding(start, "session-a");
    expect(loaded.sessionId).toBe("session-a");
    expect(loaded.key).toBe(start.key);
  });

  it("ignores a still-loading or signed-out session", () => {
    const start = initialAuthBinding(true);
    expect(nextAuthBinding(start, undefined)).toBe(start);
    expect(nextAuthBinding(start, null)).toBe(start);
  });

  it("re-keys when a different session takes over", () => {
    const loaded = nextAuthBinding(initialAuthBinding(true), "session-a");
    const switched = nextAuthBinding(loaded, "session-b");
    expect(switched).toEqual({ sessionId: "session-b", key: "session-b" });
  });

  it("keys on the session when there was no server token", () => {
    const start = initialAuthBinding(false);
    expect(start.key).toBeNull();
    expect(nextAuthBinding(start, "session-a")).toEqual({ sessionId: "session-a", key: "session-a" });
  });

  it("returns the same binding for the same session", () => {
    const loaded = nextAuthBinding(initialAuthBinding(false), "session-a");
    expect(nextAuthBinding(loaded, "session-a")).toBe(loaded);
  });
});
