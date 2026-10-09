import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  OnboardingAckCheckbox,
  OnboardingLinkCard,
  OnboardingYesNoChoice,
} from "@/components/onboarding/onboarding-ui";
import { ONBOARDING_LINKS } from "@/lib/onboarding-links";
import type { FormState } from "../types";

export function GettingPaidStep({
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
        Two offices get you set up: the Office of Student Engagement (OSE) for your hire
        paperwork, and HR for your I-9. Add the details OSE needs below, and complete your I-9
        with HR before your first shift.
      </p>

      <div className="space-y-3 border border-border/50 bg-background/50 p-3">
        <p className="text-sm font-medium text-foreground">What OSE needs</p>
        <ul className="list-disc space-y-1 pl-4 text-sm text-foreground/70">
          <li>Your student ID number</li>
          <li>Your full legal name and start date</li>
          <li>
            Your FWS Authorization Form, if you said you have Federal Work Study (see the
            Federal Work Study step)
          </li>
          <li>Any other campus employment and how many hours a week</li>
        </ul>

        <div className="space-y-2">
          <Label htmlFor="crew-student-id">Student ID number</Label>
          <Input
            id="crew-student-id"
            inputMode="numeric"
            value={form.studentId}
            onChange={(event) => patch({ studentId: event.target.value })}
            placeholder="8 digits"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="crew-start-date">Start date</Label>
          <Input
            id="crew-start-date"
            type="date"
            value={form.employmentStartDate}
            onChange={(event) => patch({ employmentStartDate: event.target.value })}
          />
        </div>

        <div className="space-y-2">
          <p className="text-sm text-foreground/70">Do you have other campus employment?</p>
          <OnboardingYesNoChoice
            value={form.hasOtherCampusEmployment}
            onChange={(next) =>
              patch({
                hasOtherCampusEmployment: next,
                otherCampusEmploymentHours: next ? form.otherCampusEmploymentHours : "",
              })
            }
          />
          {form.hasOtherCampusEmployment ? (
            <div className="space-y-2">
              <Label htmlFor="crew-other-hours">Hours per week</Label>
              <Input
                id="crew-other-hours"
                inputMode="numeric"
                value={form.otherCampusEmploymentHours}
                onChange={(event) => patch({ otherCampusEmploymentHours: event.target.value })}
                placeholder="e.g. 10"
              />
            </div>
          ) : null}
        </div>

      </div>

      <div className="space-y-3 border border-border/50 bg-background/50 p-3">
        <p className="text-sm font-medium text-foreground">What HR needs</p>
        <p className="text-sm text-foreground/70">
          Schedule an I-9 appointment with HR by your first day of employment. Bring{" "}
          <span className="font-medium text-foreground">original documents</span> — copies
          aren&apos;t accepted.
        </p>
        <div className="space-y-2">
          <OnboardingLinkCard
            href={ONBOARDING_LINKS.i9Appointment}
            title="Schedule your I-9 appointment"
          />
          <OnboardingLinkCard
            href={ONBOARDING_LINKS.i9AcceptableDocuments}
            title="See acceptable I-9 documents"
            description="Original documents only"
          />
        </div>
        <OnboardingAckCheckbox
          checked={form.i9Acknowledged}
          onChange={(next) => patch({ i9Acknowledged: next })}
          label="I'll schedule my I-9 appointment by my first day and bring original documents."
        />
      </div>

      {fieldError ? <p className="text-sm text-destructive">{fieldError}</p> : null}
    </div>
  );
}
