"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { getConvexErrorMessage } from "@/lib/convex-error";

type RunnerSignup = {
  _id: Id<"openMicSignups">;
  status: "queued" | "current" | "performed" | "removed";
  position: number;
  skipsCount: number;
  name: string;
  email: string;
  whatTheyreDoing: string;
  equipment: string[];
  bgMusicLink?: string;
  notes?: string;
  performedAt?: number;
  submittedAt: number;
};

function EquipmentChips({ equipment }: { equipment: string[] }) {
  if (equipment.length === 0) {
    return <span className="text-xs text-muted-foreground">No equipment needed</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {equipment.map((item) => (
        <span key={item} className="rounded bg-muted px-2 py-0.5 text-xs">
          {item}
        </span>
      ))}
    </div>
  );
}

export function OpenMicRunner({ nightId }: { nightId: Id<"openMicNights"> }) {
  const state = useQuery(api.openMic.getRunnerState, { nightId });
  const leaderboard = useQuery(api.openMic.getLeaderboard, {});
  const advance = useMutation(api.openMic.advanceCurrent);
  const markNotHere = useMutation(api.openMic.markNotHere);
  const remove = useMutation(api.openMic.removeSignup);

  const { current, queued, performed } = useMemo(() => {
    const signups = (state?.signups ?? []) as RunnerSignup[];
    const current = signups.find((signup) => signup.status === "current") ?? null;
    const queued = signups.filter((signup) => signup.status === "queued");
    const performed = signups
      .filter((signup) => signup.status === "performed")
      .sort((a, b) => (b.performedAt ?? 0) - (a.performedAt ?? 0));
    return { current, queued, performed };
  }, [state]);

  if (state === undefined) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (state === null) {
    return <p className="text-sm text-muted-foreground">This open mic night no longer exists.</p>;
  }

  const night = state.night;
  const nightIsLive = night.status === "live";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <p className="font-medium">{night.title}</p>
          <p className="text-xs text-muted-foreground">
            {formatDateTime(night.startAt)} · {night.status}
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="ml-auto">
          <Link href="/dashboard/events/open-mic">Back to open mic</Link>
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Now performing */}
        <Card>
          <CardHeader>
            <CardTitle>Now performing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {current ? (
              <div className="space-y-3 rounded-md border p-3">
                <div>
                  <p className="text-lg font-medium">{current.name}</p>
                  <p className="text-xs text-muted-foreground">{current.email}</p>
                </div>
                <p className="text-sm">{current.whatTheyreDoing}</p>
                <EquipmentChips equipment={current.equipment} />
                {current.bgMusicLink ? (
                  <Button asChild type="button" variant="outline" size="sm">
                    <a href={current.bgMusicLink} target="_blank" rel="noopener noreferrer">
                      Open background music
                    </a>
                  </Button>
                ) : null}
                {current.notes ? (
                  <p className="text-sm text-muted-foreground">Notes: {current.notes}</p>
                ) : null}
                {current.skipsCount > 0 ? (
                  <p className="text-xs text-amber-700">
                    Strikes: {current.skipsCount}
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    type="button"
                    disabled={!nightIsLive && night.status !== "scheduled"}
                    onClick={() => void advance({ nightId })}
                  >
                    Next performer
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      void markNotHere({ signupId: current._id }).catch((err) => {
                        window.alert(getConvexErrorMessage(err));
                      })
                    }
                  >
                    Not here
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => {
                      if (window.confirm(`Remove ${current.name} from the queue?`)) {
                        void remove({ signupId: current._id });
                      }
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ) : queued.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  No one is on stage. Call up the next performer to start.
                </p>
                <Button
                  type="button"
                  disabled={night.status === "completed" || night.status === "cancelled"}
                  onClick={() => void advance({ nightId })}
                >
                  Call up next performer
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Queue is empty. New sign-ups will appear here as they come in.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Next up */}
        <Card>
          <CardHeader>
            <CardTitle>Next up ({queued.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {queued.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No one queued. Share the public sign-up link.
              </p>
            ) : (
              queued.map((signup, index) => (
                <div key={signup._id} className="rounded-md border p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        <span className="text-muted-foreground">{index + 1}.</span> {signup.name}
                      </p>
                      <p className="text-xs text-muted-foreground">{signup.whatTheyreDoing}</p>
                      <EquipmentChips equipment={signup.equipment} />
                      {signup.skipsCount > 0 ? (
                        <p className="mt-1 text-xs text-amber-700">
                          Strikes: {signup.skipsCount}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => {
                        if (window.confirm(`Remove ${signup.name} from the queue?`)) {
                          void remove({ signupId: signup._id });
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Performer leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle>Participation leaderboard</CardTitle>
        </CardHeader>
        <CardContent>
          {leaderboard === undefined ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : leaderboard.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No one has performed yet. Performers show up here after they finish a set.
            </p>
          ) : (
            <ol className="space-y-1 text-sm">
              {leaderboard.map((entry, index) => (
                <li
                  key={entry.email}
                  className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2"
                >
                  <span className="w-6 text-muted-foreground">{index + 1}.</span>
                  <span className="font-medium">{entry.name}</span>
                  <span className="text-xs text-muted-foreground">{entry.email}</span>
                  <span className="ml-auto rounded bg-muted px-2 py-0.5 text-xs">
                    {entry.count} {entry.count === 1 ? "set" : "sets"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    last {formatDateTime(entry.lastPerformedAt)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* Recently performed (admin memory aid) */}
      {performed.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Recently performed ({performed.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {performed.slice(0, 10).map((signup) => (
                <li key={signup._id}>
                  {signup.name} · {signup.whatTheyreDoing}
                  {signup.performedAt ? ` · ${formatDateTime(signup.performedAt)}` : ""}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}