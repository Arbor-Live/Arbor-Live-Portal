"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { CopyIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";

export const RING_AUTH_COMMAND = "npx -p ring-client-api ring-auth-cli";

async function copyCommand() {
  try {
    await navigator.clipboard.writeText(RING_AUTH_COMMAND);
    notify.success("Command copied.");
  } catch {
    notify.error("Could not copy to the clipboard.");
  }
}

/** The `ring-auth-cli` command that prints a new refresh token, with a copy button. */
export function RingAuthCommand() {
  return (
    <span className="inline-flex max-w-full items-center gap-1 align-middle">
      <code className="truncate rounded-md bg-muted px-1.5 py-0.5 text-xs text-foreground">{RING_AUTH_COMMAND}</code>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label="Copy the Ring sign-in command"
        title="Copy command"
        onClick={() => void copyCommand()}
      >
        <CopyIcon />
      </Button>
    </span>
  );
}

/** Paste a `ring-auth-cli` refresh token. Calls `onConnected` once Ring accepts it. */
export function RingConnectForm({ idPrefix, onConnected }: { idPrefix: string; onConnected?: () => void }) {
  const connect = useAction(api.ringCameraActions.connect);
  const [token, setToken] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const { cameraName } = await connect({ refreshToken: token });
      setToken("");
      notify.success(`Connected to ${cameraName}. Loading the last 30 days of clips…`);
      onConnected?.();
    } catch (caught) {
      setError(getConvexErrorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={(event) => void submit(event)}>
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        <li>
          In a terminal on your computer, run <RingAuthCommand /> and sign in with the Ring account. It asks for
          the two-factor code Ring sends you. It needs Node.js installed.
        </li>
        <li>Paste the refresh token it prints below.</li>
      </ol>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-token`}>Refresh token</Label>
        <Input
          id={`${idPrefix}-token`}
          type="password"
          autoComplete="off"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="Paste the token"
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
      <p className="text-xs text-muted-foreground">
        The token stays on the server and is only used to read this camera&apos;s clips.
      </p>
      <Button type="submit" disabled={pending || !token.trim()}>
        {pending ? "Connecting…" : "Connect Ring"}
      </Button>
    </form>
  );
}
