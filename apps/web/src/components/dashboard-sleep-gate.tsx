"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useConvex } from "convex/react";
import { useSessionShell } from "@/components/session-shell-provider";
import { Button } from "@/components/ui/button";

/** How long the live socket can stay down before we treat the dashboard as asleep. */
const DISCONNECT_BEFORE_SLEEP_MS = 12_000;
/** How long the session shell can be missing (after we once had it) before sleep. */
const SHELL_MISSING_BEFORE_SLEEP_MS = 8_000;
/** Returning to a tab hidden this long should wake-check even if the socket still looks fine. */
const LONG_HIDDEN_MS = 30 * 60 * 1000;

/**
 * Overnight / long-idle tabs often lose the Convex websocket (or auth) while the
 * page chrome stays mounted. Org guards then render `null` for `shell === undefined`,
 * which looks like empty lists. This gate turns that into an explicit sleep state
 * with a one-click wake (full reload restores auth + subscriptions).
 */
export function DashboardSleepGate({ children }: { children: React.ReactNode }) {
  const convex = useConvex();
  const shell = useSessionShell();
  const [asleep, setAsleep] = useState(false);

  const hadConnectedRef = useRef(false);
  const hadShellRef = useRef(false);
  const hiddenAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (shell !== undefined) {
      hadShellRef.current = true;
    }
  }, [shell]);

  useEffect(() => {
    let disconnectTimer: number | null = null;

    function clearDisconnectTimer() {
      if (disconnectTimer != null) {
        window.clearTimeout(disconnectTimer);
        disconnectTimer = null;
      }
    }

    function scheduleSleepFromDisconnect() {
      if (disconnectTimer != null) return;
      disconnectTimer = window.setTimeout(() => {
        setAsleep(true);
      }, DISCONNECT_BEFORE_SLEEP_MS);
    }

    const unsubscribe = convex.subscribeToConnectionState((state) => {
      if (state.isWebSocketConnected) {
        hadConnectedRef.current = true;
        clearDisconnectTimer();
        return;
      }
      if (!hadConnectedRef.current && !state.hasEverConnected) return;
      hadConnectedRef.current = true;
      scheduleSleepFromDisconnect();
    });

    const initial = convex.connectionState();
    if (initial.isWebSocketConnected) {
      hadConnectedRef.current = true;
    } else if (initial.hasEverConnected) {
      hadConnectedRef.current = true;
      scheduleSleepFromDisconnect();
    }

    return () => {
      unsubscribe();
      clearDisconnectTimer();
    };
  }, [convex]);

  useEffect(() => {
    if (shell !== undefined) return;
    if (!hadShellRef.current) return;

    const timer = window.setTimeout(() => {
      setAsleep(true);
    }, SHELL_MISSING_BEFORE_SLEEP_MS);

    return () => window.clearTimeout(timer);
  }, [shell]);

  useEffect(() => {
    if (!asleep) return;
    if (shell === undefined) return;
    if (!convex.connectionState().isWebSocketConnected) return;
    setAsleep(false);
  }, [asleep, shell, convex]);

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        return;
      }

      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;
      if (hiddenAt == null) return;

      const hiddenFor = Date.now() - hiddenAt;
      if (hiddenFor < LONG_HIDDEN_MS) return;

      const connected = convex.connectionState().isWebSocketConnected;
      if (!connected || shell === undefined) {
        setAsleep(true);
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [convex, shell]);

  if (!asleep) return <>{children}</>;

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <Image
        src="/icon.svg"
        alt="Arbor Live"
        width={56}
        height={74}
        className="h-14 w-auto brightness-0 dark:invert"
        priority
      />
      <div className="space-y-2">
        <h2
          className="font-heading text-2xl font-semibold tracking-tight"
          style={{ fontFamily: "var(--font-space-grotesk)" }}
        >
          Dashboard is in sleep mode
        </h2>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          The live connection paused after being idle. Wake it to reload your data.
        </p>
      </div>
      <Button type="button" onClick={() => window.location.reload()}>
        Wake dashboard
      </Button>
    </div>
  );
}
