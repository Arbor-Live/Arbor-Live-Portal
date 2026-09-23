"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OnboardingAckCheckbox, OnboardingTextarea } from "@/components/onboarding/onboarding-ui";
import {
  submitCrewApplication,
  type CrewApplicationFormValues,
} from "@/app/(site)/crew/apply/actions";

const EMPTY: CrewApplicationFormValues = {
  website: "",
  name: "",
  email: "",
  phone: "",
  heardAboutUs: "",
  experience: "",
  vertical: "Crew",
  discipline: "",
  friday: false,
  saturday: false,
  stanfordPosition: "undergrad",
  gradYear: "",
};

const VERTICALS: CrewApplicationFormValues["vertical"][] = [
  "Operations",
  "Crew",
  "Trivia",
  "Marketing",
];

const SPECIALTY_UNSURE = { value: "unsure" as const, label: "I'm not sure" };

const DISCIPLINES_BY_VERTICAL: Partial<
  Record<
    CrewApplicationFormValues["vertical"],
    Array<{ value: Exclude<CrewApplicationFormValues["discipline"], "">; label: string }>
  >
> = {
  Crew: [
    { value: "Sound", label: "Sound" },
    { value: "Lights", label: "Lights" },
    { value: "Photography", label: "Photography" },
    { value: "Videography", label: "Videography" },
    SPECIALTY_UNSURE,
  ],
  Marketing: [
    { value: "Design", label: "Design" },
    { value: "Photography", label: "Photography" },
    { value: "Videography", label: "Videography" },
    SPECIALTY_UNSURE,
  ],
};

const POSITIONS: Array<{
  value: CrewApplicationFormValues["stanfordPosition"];
  label: string;
}> = [
  { value: "undergrad", label: "Undergrad" },
  { value: "coterm", label: "Coterm" },
  { value: "masters", label: "Master's" },
  { value: "phd", label: "PhD" },
  { value: "postdoc", label: "Postdoc" },
  { value: "other", label: "Other" },
];

export function CrewApplicationForm() {
  const [form, setForm] = useState<CrewApplicationFormValues>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  function patch(next: Partial<CrewApplicationFormValues>) {
    setForm((prev) => ({ ...prev, ...next }));
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await submitCrewApplication(form);
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
        <h2 className="font-heading text-xl font-semibold">Thanks for applying</h2>
        <p className="text-sm text-foreground/70">
          We got your application. Our team will review it and follow up by email when there&apos;s
          a next step.
        </p>
        <Button asChild variant="secondary">
          <Link href="/crew">Back to crew</Link>
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-8 border border-border/60 bg-background/70 p-6 shadow-sm"
    >
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
        <h2 className="font-heading text-lg font-semibold">About you</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="crew-name">Full name</Label>
            <Input
              id="crew-name"
              required
              value={form.name}
              onChange={(event) => patch({ name: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="crew-email">Stanford email</Label>
            <Input
              id="crew-email"
              type="email"
              required
              value={form.email}
              onChange={(event) => patch({ email: event.target.value })}
              placeholder="you@stanford.edu"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="crew-phone">Phone</Label>
            <Input
              id="crew-phone"
              required
              value={form.phone}
              onChange={(event) => patch({ phone: event.target.value })}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="heard-about">How did you hear about us?</Label>
          <OnboardingTextarea
            id="heard-about"
            required
            value={form.heardAboutUs}
            onChange={(event) => patch({ heardAboutUs: event.target.value })}
            rows={3}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="experience">
            Explain your experience if you have any, or why you are interested
          </Label>
          <OnboardingTextarea
            id="experience"
            required
            value={form.experience}
            onChange={(event) => patch({ experience: event.target.value })}
            rows={4}
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-heading text-lg font-semibold">Team interest</h2>
        <div className="space-y-2">
          <Label htmlFor="vertical">Area of interest</Label>
          <select
            id="vertical"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
            value={form.vertical}
            onChange={(event) => {
              const vertical = event.target.value as CrewApplicationFormValues["vertical"];
              const options = DISCIPLINES_BY_VERTICAL[vertical] ?? [];
              const keepDiscipline = options.some((option) => option.value === form.discipline);
              patch({
                vertical,
                discipline: keepDiscipline ? form.discipline : "",
                friday: vertical === "Crew" ? form.friday : false,
                saturday: vertical === "Crew" ? form.saturday : false,
              });
            }}
          >
            {VERTICALS.map((vertical) => (
              <option key={vertical} value={vertical}>
                {vertical}
              </option>
            ))}
          </select>
        </div>

        {(DISCIPLINES_BY_VERTICAL[form.vertical] ?? []).length > 0 ? (
          <div className="space-y-2">
            <Label htmlFor="discipline">Specialty</Label>
            <select
              id="discipline"
              required
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
              value={form.discipline}
              onChange={(event) =>
                patch({
                  discipline: event.target.value as CrewApplicationFormValues["discipline"],
                })
              }
            >
              <option value="" disabled>
                Select a specialty
              </option>
              {(DISCIPLINES_BY_VERTICAL[form.vertical] ?? []).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {form.vertical === "Crew" ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Standing availability (5pm–midnight PT)</p>
            <p className="text-xs text-muted-foreground">
              Tell us which nights you&apos;re usually free — we use this as a preference when
              scheduling.
            </p>
            <div className="flex flex-wrap gap-4">
              <OnboardingAckCheckbox
                checked={form.friday}
                onChange={(checked) => patch({ friday: checked })}
                label="Friday"
              />
              <OnboardingAckCheckbox
                checked={form.saturday}
                onChange={(checked) => patch({ saturday: checked })}
                label="Saturday"
              />
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-4">
        <h2 className="font-heading text-lg font-semibold">Stanford status</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="position">Position</Label>
            <select
              id="position"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
              value={form.stanfordPosition}
              onChange={(event) =>
                patch({
                  stanfordPosition: event.target
                    .value as CrewApplicationFormValues["stanfordPosition"],
                })
              }
            >
              {POSITIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {form.stanfordPosition !== "other" ? (
            <div className="space-y-2">
              <Label htmlFor="grad-year">Graduation year</Label>
              <Input
                id="grad-year"
                type="number"
                required
                min={2000}
                max={2100}
                value={form.gradYear}
                onChange={(event) => patch({ gradYear: event.target.value })}
                placeholder="2027"
              />
            </div>
          ) : null}
        </div>
      </section>

      <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
        {isPending ? "Submitting…" : "Submit application"}
      </Button>
    </form>
  );
}
