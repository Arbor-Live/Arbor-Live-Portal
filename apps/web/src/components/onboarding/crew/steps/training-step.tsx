import {
  OnboardingAckCheckbox,
  OnboardingLinkCard,
  OnboardingYesNoChoice,
} from "@/components/onboarding/onboarding-ui";
import { ONBOARDING_LINKS } from "@/lib/onboarding-links";
import type { FormState } from "../types";

export function TrainingStep({
  form,
  patch,
  fieldError,
}: {
  form: FormState;
  patch: (next: Partial<FormState>) => void;
  fieldError: string | null;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground/70">
        Complete each training item below. Some are quick videos or guides, others are short
        forms or tests.
      </p>

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Narcan training video</p>
        <div className="overflow-hidden border border-border/50 bg-black/5 aspect-video">
          <iframe
            title="Narcan training video"
            src={ONBOARDING_LINKS.narcanVideoEmbed}
            className="size-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
        <OnboardingLinkCard
          href={ONBOARDING_LINKS.narcanVideo}
          title="Open video in YouTube"
          description="If the embed doesn't load"
        />
        <OnboardingAckCheckbox
          checked={form.narcanCompleted}
          onChange={(next) => patch({ narcanCompleted: next })}
          label="I've watched the Narcan training video."
        />
      </div>

      <div className="space-y-2">
        <OnboardingLinkCard href={ONBOARDING_LINKS.soberMonitorsGuide} title="Sober monitors guide" />
        <OnboardingLinkCard href={ONBOARDING_LINKS.soberMonitorsTest} title="Sober monitors test" />
        <OnboardingAckCheckbox
          checked={form.soberMonitorCompleted}
          onChange={(next) => patch({ soberMonitorCompleted: next })}
          label="I've reviewed the sober monitors guide and completed the test."
        />
      </div>

      <div className="space-y-2">
        <OnboardingLinkCard href={ONBOARDING_LINKS.onboardingDoc} title="Emergency SOPs & crew expectations" description="Notion onboarding doc" />
        <OnboardingAckCheckbox
          checked={form.emergencySopsAcknowledged}
          onChange={(next) => patch({ emergencySopsAcknowledged: next })}
          label="I've read the emergency SOPs."
        />
        <OnboardingAckCheckbox
          checked={form.crewExpectationsAcknowledged}
          onChange={(next) => patch({ crewExpectationsAcknowledged: next })}
          label="I've read the crew expectations."
        />
      </div>

      <div className="space-y-2">
        <OnboardingLinkCard
          href={ONBOARDING_LINKS.liftingTrainingUrl}
          title="Lifting & material handling training"
          description={`STARS Express · ${ONBOARDING_LINKS.liftingTrainingCode}`}
        />
        <OnboardingAckCheckbox
          checked={form.liftingCompleted}
          onChange={(next) => patch({ liftingCompleted: next })}
          label="I've completed the lifting training."
        />
      </div>

      <div className="space-y-2 border-t border-border/50 pt-4">
        <p className="text-sm text-foreground/70">
          Do you have a valid driver&apos;s license? Crew with a license can also complete cart
          training.
        </p>
        <OnboardingYesNoChoice
          value={form.hasValidDriversLicense}
          onChange={(next) =>
            patch({
              hasValidDriversLicense: next,
              cartTrainingCompleted: next ? form.cartTrainingCompleted : false,
            })
          }
        />
        {form.hasValidDriversLicense ? (
          <>
            <OnboardingLinkCard
              href={ONBOARDING_LINKS.starsPortal}
              title="Cart training"
              description={`STARS code: ${ONBOARDING_LINKS.cartTrainingCode}`}
            />
            <OnboardingAckCheckbox
              checked={form.cartTrainingCompleted}
              onChange={(next) => patch({ cartTrainingCompleted: next })}
              label="I've completed cart training."
            />
          </>
        ) : null}
      </div>

      {fieldError ? <p className="text-sm text-destructive">{fieldError}</p> : null}
    </div>
  );
}
