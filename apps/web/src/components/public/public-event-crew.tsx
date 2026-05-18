"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PublicEventCrew({
  crew,
}: {
  crew: Array<{
    name: string;
    role?: string;
    email?: string;
  }>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Crew</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {crew.length ? (
          crew.map((member, index) => (
            <div key={`${member.name}-${index}`} className="rounded-md border px-3 py-2 text-sm">
              <p className="font-medium">{member.name}</p>
              {member.role ? <p className="text-xs text-muted-foreground">{member.role}</p> : null}
              {member.email ? (
                <p className="text-xs">
                  <a className="underline" href={`mailto:${member.email}`}>
                    {member.email}
                  </a>
                </p>
              ) : null}
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No crew assignments published yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
