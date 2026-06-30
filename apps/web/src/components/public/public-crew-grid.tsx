"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Reveal, Stagger, StaggerItem } from "@/components/landing/landing-motion";
import { PublicAvatar } from "@/components/public/public-avatar";
import { cn } from "@/lib/utils";

const ALL_TEAMS = "All";

export function PublicCrewGrid() {
  const crew = useQuery(api.publicDirectory.listPublicCrew, {});
  const [teamFilter, setTeamFilter] = useState(ALL_TEAMS);

  const teams = useMemo(() => {
    const set = new Set<string>();
    for (const member of crew ?? []) {
      for (const team of member.teams) set.add(team);
    }
    return [...set].sort();
  }, [crew]);

  const filtered = useMemo(() => {
    if (!crew) return undefined;
    if (teamFilter === ALL_TEAMS) return crew;
    return crew.filter((member) => member.teams.includes(teamFilter as (typeof member.teams)[number]));
  }, [crew, teamFilter]);

  return (
    <section className="py-12 sm:py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {teams.length > 0 ? (
          <Reveal className="mb-8 flex flex-wrap gap-2">
            {[ALL_TEAMS, ...teams].map((team) => (
              <button
                key={team}
                type="button"
                onClick={() => setTeamFilter(team)}
                className={cn(
                  "rounded-none border px-3 py-1.5 text-sm font-medium transition-colors",
                  teamFilter === team
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-card text-foreground hover:bg-muted",
                )}
              >
                {team}
              </button>
            ))}
          </Reveal>
        ) : null}

        {crew === undefined ? (
          <p className="text-sm text-muted-foreground">Loading crew…</p>
        ) : null}

        {crew && crew.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Coming soon</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Crew profiles will appear here once team members opt in from the portal.
            </CardContent>
          </Card>
        ) : null}

        {filtered && filtered.length > 0 ? (
          <Stagger className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((member) => (
              <StaggerItem key={member.id}>
                <Card className="h-full">
                  <CardContent className="flex flex-col items-center px-4 py-6 text-center">
                    <PublicAvatar name={member.name} imageUrl={member.imageUrl} size={88} />
                    <p className="mt-4 font-semibold">{member.name}</p>
                    {member.teams.length > 0 ? (
                      <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                        {member.teams.map((team) => (
                          <span
                            key={team}
                            className="rounded-none border bg-muted/50 px-2 py-0.5 text-xs font-medium text-muted-foreground"
                          >
                            {team}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </StaggerItem>
            ))}
          </Stagger>
        ) : null}

        {filtered && crew && crew.length > 0 && filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No crew members in this team yet.</p>
        ) : null}
      </div>
    </section>
  );
}
