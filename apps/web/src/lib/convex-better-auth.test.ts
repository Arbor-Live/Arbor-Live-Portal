import { describe, expect, it } from "vitest";
import { fetchConvexToken, initialAuthBinding, nextAuthBinding } from "./convex-better-auth";

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

describe("fetchConvexToken", () => {
  const noWait = async () => {};

  it("retries through network failures until a token arrives", async () => {
    const responses = [
      () => Promise.reject(new TypeError("Load failed")),
      () => Promise.resolve({ data: null, error: { status: 502 } }),
      () => Promise.resolve({ data: { token: "jwt" }, error: null }),
    ];
    let calls = 0;
    const token = await fetchConvexToken(() => responses[calls++](), noWait);
    expect(token).toBe("jwt");
    expect(calls).toBe(3);
  });

  it("returns null at once when there is no session", async () => {
    let calls = 0;
    const token = await fetchConvexToken(async () => {
      calls++;
      return { data: null, error: { status: 401 } };
    }, noWait);
    expect(token).toBeNull();
    expect(calls).toBe(1);
  });

  it("gives up after the last retry", async () => {
    let calls = 0;
    const token = await fetchConvexToken(async () => {
      calls++;
      throw new TypeError("Load failed");
    }, noWait);
    expect(token).toBeNull();
    expect(calls).toBe(8);
  });
});
