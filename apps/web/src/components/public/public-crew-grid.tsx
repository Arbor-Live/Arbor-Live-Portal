"use client";

import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import BoringAvatar from "boring-avatars";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Reveal, Stagger, StaggerItem } from "@/components/landing/landing-motion";
import { useResolvedAssetUrl } from "@/components/files/stored-asset-image";

function CrewCard({ member }: { member: { id: string; name: string; imageUrl?: string; description?: string; secondaryTags: string[] } }) {
  const resolvedImageUrl = useResolvedAssetUrl(member.imageUrl);

  return (
    <Card className="h-full overflow-hidden ring-foreground/15">
      <div className="aspect-[4/5] w-full overflow-hidden bg-muted">
        {resolvedImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={resolvedImageUrl} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center" aria-hidden>
            <BoringAvatar
              size={400}
              name={member.name}
              variant="beam"
              colors={["#3d7a5c", "#1a3d2e", "#6b9e7a", "#0f1f17", "#a8d5ba"]}
            />
          </div>
        )}
      </div>
      <CardContent className="space-y-2 p-4">
        <h3 className="font-semibold">{member.name}</h3>
        {member.secondaryTags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {member.secondaryTags.map((tag) => (
              <span
                key={`${member.id}-${tag}`}
                className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        {member.description ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {member.description}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

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
                        <CrewCard member={member} />
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
