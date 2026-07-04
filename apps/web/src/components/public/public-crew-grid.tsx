"use client";

import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Reveal, Stagger, StaggerItem } from "@/components/landing/landing-motion";
import { PublicAvatar } from "@/components/public/public-avatar";

export function PublicCrewGrid() {
  const crew = useQuery(api.publicDirectory.listPublicCrew, {});
  const sections = crew?.sections ?? [];

  return (
    <section className="py-12 sm:py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {crew === undefined ? (
          <p className="text-sm text-muted-foreground">Loading crew…</p>
        ) : null}

        {crew && sections.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Coming soon</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Crew profiles will appear here once team members opt in from the portal.
            </CardContent>
          </Card>
        ) : null}

        {sections.length > 0 ? (
          <div className="space-y-14">
            {sections.map((section) => (
              <Reveal key={section.team}>
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">{section.label}</h2>
                  <Stagger className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {section.members.map((member) => (
                      <StaggerItem key={`${section.team}-${member.id}`}>
                        <Card className="h-full">
                          <CardContent className="flex flex-col items-center px-4 py-6 text-center">
                            <PublicAvatar name={member.name} imageUrl={member.imageUrl} size={88} />
                            <p className="mt-4 font-semibold">{member.name}</p>
                            {member.description ? (
                              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                                {member.description}
                              </p>
                            ) : null}
                          </CardContent>
                        </Card>
                      </StaggerItem>
                    ))}
                  </Stagger>
                </div>
              </Reveal>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
