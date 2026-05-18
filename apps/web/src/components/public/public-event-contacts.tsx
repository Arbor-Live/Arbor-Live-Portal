"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Contact = {
  name: string;
  email?: string;
  phone?: string;
} | null;

function ContactCard({ title, contact }: { title: string; contact: Contact }) {
  return (
    <div className="rounded-md border p-3 text-sm">
      <p className="font-medium">{title}</p>
      {contact ? (
        <div className="mt-1 space-y-1">
          <p>{contact.name}</p>
          {contact.email ? (
            <p>
              <a className="underline" href={`mailto:${contact.email}`}>
                {contact.email}
              </a>
            </p>
          ) : null}
          {contact.phone ? (
            <p>
              <a className="underline" href={`tel:${contact.phone}`}>
                {contact.phone}
              </a>
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-1 text-muted-foreground">Not assigned</p>
      )}
    </div>
  );
}

export function PublicEventContacts({
  manager,
  dayOfLead,
}: {
  manager: Contact;
  dayOfLead: Contact;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Contacts</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        <ContactCard title="Event Manager" contact={manager} />
        <ContactCard title="Day-Of Lead" contact={dayOfLead} />
      </CardContent>
    </Card>
  );
}
