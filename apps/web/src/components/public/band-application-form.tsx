"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { PlusIcon, XIcon } from "@phosphor-icons/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OnboardingAckCheckbox, OnboardingTextarea } from "@/components/onboarding/onboarding-ui";
import {
  submitBandApplication,
  type BandApplicationFormValues,
} from "@/app/(site)/artists/apply/actions";

const EMPTY: BandApplicationFormValues = {
  website: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  bandDisplayName: "",
  oneLiner: "",
  bio: "",
  publicWebsiteUrl: "",
  publicInstagramUrl: "",
  publicYoutubeUrl: "",
  publicSpotifyUrl: "",
  demoURL: "",
  genres: "",
  isSolo: false,
  members: [{ name: "", email: "" }],
};

export function BandApplicationForm() {
  const [form, setForm] = useState<BandApplicationFormValues>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  function patch(next: Partial<BandApplicationFormValues>) {
    setForm((prev) => ({ ...prev, ...next }));
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await submitBandApplication(form);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSubmitted(true);
    });
  }

  if (submitted) {
    return (
      <div className="space-y-4 border border-border/60 bg-background/70 p-6 shadow-sm">
        <h2 className="font-heading text-xl font-semibold">You&apos;re in the mix</h2>
        <p className="text-sm text-foreground/70">
          Thanks for joining — we can&apos;t wait to have you in the live music community at
          Stanford. We&apos;ll email you shortly with next steps.
        </p>
        <Button asChild variant="secondary">
          <Link href="/artists">Back to artists</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8 border border-border/60 bg-background/70 p-6 shadow-sm">
      {/* Honeypot */}
      <input
        type="text"
        name="website"
        value={form.website}
        onChange={(event) => patch({ website: event.target.value })}
        className="hidden"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
      />

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <section className="space-y-4">
        <h2 className="font-heading text-lg font-semibold">Your contact info</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="contact-name">Full name</Label>
            <Input
              id="contact-name"
              required
              value={form.contactName}
              onChange={(event) => patch({ contactName: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact-email">Stanford email</Label>
            <Input
              id="contact-email"
              type="email"
              required
              value={form.contactEmail}
              onChange={(event) => patch({ contactEmail: event.target.value })}
              placeholder="you@stanford.edu"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="contact-phone">Phone (optional)</Label>
            <Input
              id="contact-phone"
              value={form.contactPhone}
              onChange={(event) => patch({ contactPhone: event.target.value })}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-heading text-lg font-semibold">About the band</h2>
        <div className="space-y-2">
          <Label htmlFor="band-name">Band / artist name</Label>
          <Input
            id="band-name"
            required
            value={form.bandDisplayName}
            onChange={(event) => patch({ bandDisplayName: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="one-liner">One-liner (optional)</Label>
          <Input
            id="one-liner"
            value={form.oneLiner}
            onChange={(event) => patch({ oneLiner: event.target.value })}
            placeholder="Short vibe for the artists page"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bio">Bio (optional)</Label>
          <OnboardingTextarea
            id="bio"
            value={form.bio}
            onChange={(event) => patch({ bio: event.target.value })}
            placeholder="Tell us about your sound and experience…"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="genres">Genres (optional)</Label>
          <Input
            id="genres"
            value={form.genres}
            onChange={(event) => patch({ genres: event.target.value })}
            placeholder="Indie, funk, jazz — comma separated"
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-heading text-lg font-semibold">Links</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="website-url">Website</Label>
            <Input
              id="website-url"
              value={form.publicWebsiteUrl}
              onChange={(event) => patch({ publicWebsiteUrl: event.target.value })}
              placeholder="https://…"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="instagram-url">Instagram</Label>
            <Input
              id="instagram-url"
              value={form.publicInstagramUrl}
              onChange={(event) => patch({ publicInstagramUrl: event.target.value })}
              placeholder="https://instagram.com/…"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="youtube-url">YouTube</Label>
            <Input
              id="youtube-url"
              value={form.publicYoutubeUrl}
              onChange={(event) => patch({ publicYoutubeUrl: event.target.value })}
              placeholder="https://youtube.com/…"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="spotify-url">Spotify</Label>
            <Input
              id="spotify-url"
              value={form.publicSpotifyUrl}
              onChange={(event) => patch({ publicSpotifyUrl: event.target.value })}
              placeholder="https://open.spotify.com/…"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="demo-url">Demo / listening link</Label>
            <Input
              id="demo-url"
              value={form.demoURL}
              onChange={(event) => patch({ demoURL: event.target.value })}
              placeholder="SoundCloud, Drive…"
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-heading text-lg font-semibold">Bandmates</h2>
        <OnboardingAckCheckbox
          checked={form.isSolo}
          onChange={(next) =>
            patch({
              isSolo: next,
              members: next ? [] : form.members.length ? form.members : [{ name: "", email: "" }],
            })
          }
          label="I'm performing solo — no other members to list."
        />
        {!form.isSolo ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Add everyone in the band. Include emails when you can — we&apos;ll invite them to the
              portal. People can belong to more than one Arbor band.
            </p>
            {form.members.map((member, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-2 sm:items-start">
                <div className="min-w-0 space-y-2">
                  <Label htmlFor={`member-name-${index}`}>Name</Label>
                  <Input
                    id={`member-name-${index}`}
                    value={member.name}
                    onChange={(event) => {
                      const members = [...form.members];
                      members[index] = { ...member, name: event.target.value };
                      patch({ members });
                    }}
                  />
                </div>
                <div className="min-w-0 space-y-2">
                  <Label htmlFor={`member-email-${index}`}>Email (optional)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id={`member-email-${index}`}
                      type="email"
                      className="min-w-0 flex-1"
                      value={member.email}
                      onChange={(event) => {
                        const members = [...form.members];
                        members[index] = { ...member, email: event.target.value };
                        patch({ members });
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      disabled={form.members.length <= 1}
                      onClick={() =>
                        patch({ members: form.members.filter((_, i) => i !== index) })
                      }
                      aria-label="Remove member"
                    >
                      <XIcon className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              className="gap-1.5"
              onClick={() => patch({ members: [...form.members, { name: "", email: "" }] })}
            >
              <PlusIcon className="size-4" weight="bold" />
              Add member
            </Button>
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-border/50 pt-4">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Submitting…" : "Join the community"}
        </Button>
        <p className="text-xs text-muted-foreground">
          We&apos;ll follow up soon — can&apos;t wait to have you.
        </p>
      </div>
    </form>
  );
}
