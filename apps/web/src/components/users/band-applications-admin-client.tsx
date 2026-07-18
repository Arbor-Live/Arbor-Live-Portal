"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getConvexErrorMessage } from "@/lib/convex-error";

type StatusFilter = "submitted" | "approved" | "declined" | "all";

export function BandApplicationsAdminClient() {
  const [status, setStatus] = useState<StatusFilter>("submitted");
  const [declineReasons, setDeclineReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const applications = useQuery(
    api.bandApplications.listAdmin,
    status === "all" ? {} : { status },
  );
  const approve = useMutation(api.bandApplications.approve);
  const decline = useMutation(api.bandApplications.decline);

  async function onApprove(applicationId: Id<"bandApplications">) {
    setError(null);
    setBusyId(applicationId);
    try {
      await approve({ applicationId });
    } catch (err) {
      setError(getConvexErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function onDecline(applicationId: Id<"bandApplications">) {
    setError(null);
    setBusyId(applicationId);
    try {
      await decline({
        applicationId,
        declineReason: declineReasons[applicationId]?.trim() || undefined,
      });
    } catch (err) {
      setError(getConvexErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["submitted", "Pending"],
            ["approved", "Approved"],
            ["declined", "Declined"],
            ["all", "All"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={status === value ? "default" : "secondary"}
            onClick={() => setStatus(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {applications === undefined ? (
        <p className="text-sm text-muted-foreground">Loading applications…</p>
      ) : null}

      {applications && applications.length === 0 ? (
        <p className="text-sm text-muted-foreground">No applications in this view.</p>
      ) : null}

      <div className="space-y-4">
        {(applications ?? []).map((app) => (
          <article
            key={app._id}
            className="space-y-3 border border-border/60 bg-background/60 p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-heading text-lg font-semibold">{app.bandDisplayName}</h2>
                <p className="text-sm text-muted-foreground">
                  {app.contactName} · {app.contactEmail}
                  {app.contactPhone ? ` · ${app.contactPhone}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  Submitted {new Date(app.submittedAt).toLocaleString()} · {app.status}
                </p>
              </div>
              {app.status === "submitted" ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={busyId === app._id}
                    onClick={() => void onApprove(app._id)}
                  >
                    Approve
                  </Button>
                </div>
              ) : null}
            </div>

            {app.oneLiner ? <p className="text-sm">{app.oneLiner}</p> : null}
            {app.bio ? <p className="text-sm text-foreground/70">{app.bio}</p> : null}

            <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
              {app.genres?.length ? (
                <div>
                  <dt className="font-medium text-foreground/80">Genres</dt>
                  <dd>{app.genres.join(", ")}</dd>
                </div>
              ) : null}
              {app.demoURL ? (
                <div>
                  <dt className="font-medium text-foreground/80">Demo</dt>
                  <dd>
                    <a
                      href={app.demoURL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {app.demoURL}
                    </a>
                  </dd>
                </div>
              ) : null}
              {app.publicInstagramUrl ? (
                <div>
                  <dt className="font-medium text-foreground/80">Instagram</dt>
                  <dd className="truncate">{app.publicInstagramUrl}</dd>
                </div>
              ) : null}
              {app.publicWebsiteUrl ? (
                <div>
                  <dt className="font-medium text-foreground/80">Website</dt>
                  <dd className="truncate">{app.publicWebsiteUrl}</dd>
                </div>
              ) : null}
            </dl>

            <div className="text-sm">
              <p className="font-medium">Members</p>
              {app.isSolo ? (
                <p className="text-muted-foreground">Solo performer</p>
              ) : (
                <ul className="list-disc pl-5 text-muted-foreground">
                  {app.members.map((member, index) => (
                    <li key={`${member.name}-${index}`}>
                      {member.name}
                      {member.email ? ` (${member.email})` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {app.status === "submitted" ? (
              <div className="space-y-2 border-t border-border/50 pt-3">
                <Label htmlFor={`decline-${app._id}`}>Decline reason (optional)</Label>
                <Input
                  id={`decline-${app._id}`}
                  value={declineReasons[app._id] ?? ""}
                  onChange={(event) =>
                    setDeclineReasons((prev) => ({ ...prev, [app._id]: event.target.value }))
                  }
                  placeholder="Shared with the applicant by email"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={busyId === app._id}
                  onClick={() => void onDecline(app._id)}
                >
                  Decline
                </Button>
              </div>
            ) : null}

            {app.declineReason ? (
              <p className="text-sm text-muted-foreground">Decline reason: {app.declineReason}</p>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
