import {
  OnboardingAckCheckbox,
  OnboardingLinkCard,
  OnboardingYesNoChoice,
} from "@/components/onboarding/onboarding-ui";
import { FWS_JOB_INFO, ONBOARDING_LINKS } from "@/lib/onboarding-links";
import type { FormState } from "../types";

export function FwsStep({
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
        Do you have Federal Work Study (FWS) awarded through Stanford financial aid?
      </p>
      <OnboardingYesNoChoice
        value={form.hasFederalWorkStudy}
        onChange={(next) => patch({ hasFederalWorkStudy: next })}
      />

      {form.hasFederalWorkStudy ? (
        <div className="space-y-3 border border-border/50 bg-background/50 p-3 text-sm">
          <div className="space-y-2 text-foreground/70">
            <p className="font-medium text-foreground">Submit an FWS Authorization Request</p>
            <ol className="list-decimal space-y-1 pl-4">
              <li>
                Open the FWS page and click{" "}
                <span className="font-medium text-foreground">
                  &ldquo;FWS Authorization Request&rdquo;
                </span>
                .
              </li>
              <li>Enter the job, supervisor, and HR details shown below.</li>
              <li>
                Under{" "}
                <span className="font-medium text-foreground">
                  Department HR Administrator
                </span>
                , enter {FWS_JOB_INFO.hrAdminName}&apos;s info (she is different from your
                supervisor).
              </li>
            </ol>
          </div>

          <OnboardingLinkCard
            href={ONBOARDING_LINKS.fwsInfo}
            title="Open the FWS page"
            description='Then click “FWS Authorization Request”'
          />

          <div className="space-y-3 border-t border-border/50 pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              2. Job info
            </p>
            <dl className="grid gap-2 text-xs sm:grid-cols-2">
              <div>
                <dt className="font-medium text-foreground/80">Hiring Department</dt>
                <dd className="text-muted-foreground">{FWS_JOB_INFO.hiringDepartment}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground/80">Job Title</dt>
                <dd className="text-muted-foreground">{FWS_JOB_INFO.jobTitle}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="font-medium text-foreground/80">Brief Description of Duties</dt>
                <dd className="text-muted-foreground">{FWS_JOB_INFO.briefDescription}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground/80">Hourly Wage</dt>
                <dd className="text-muted-foreground">{FWS_JOB_INFO.hourlyWage}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground/80">Project Task Award</dt>
                <dd className="text-muted-foreground">{FWS_JOB_INFO.projectTaskAward}</dd>
              </div>
            </dl>
          </div>

          <div className="space-y-3 border-t border-border/50 pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              3. Supervisor
            </p>
            <dl className="grid gap-2 text-xs sm:grid-cols-2">
              <div>
                <dt className="font-medium text-foreground/80">Supervisor&apos;s Name</dt>
                <dd className="text-muted-foreground">{FWS_JOB_INFO.supervisorName}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground/80">Supervisor&apos;s Email</dt>
                <dd className="text-muted-foreground">{FWS_JOB_INFO.supervisorEmail}</dd>
              </div>
            </dl>
          </div>

          <div className="space-y-3 border-t border-border/50 pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              4. Department HR Administrator
            </p>
            <dl className="grid gap-2 text-xs sm:grid-cols-2">
              <div>
                <dt className="font-medium text-foreground/80">Administrator&apos;s Name</dt>
                <dd className="text-muted-foreground">{FWS_JOB_INFO.hrAdminName}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground/80">Administrator&apos;s Email</dt>
                <dd className="text-muted-foreground">{FWS_JOB_INFO.hrAdminEmail}</dd>
              </div>
            </dl>
          </div>
        </div>
      ) : null}

      {form.hasFederalWorkStudy !== null ? (
        <OnboardingAckCheckbox
          checked={form.fwsAcknowledged}
          onChange={(next) => patch({ fwsAcknowledged: next })}
          label={
            form.hasFederalWorkStudy
              ? "I've submitted (or will submit) the FWS Authorization Request with the details above."
              : "I understand I don't have Federal Work Study and will be paid through Arbor's standard process."
          }
        />
      ) : null}

      {fieldError ? <p className="text-sm text-destructive">{fieldError}</p> : null}
    </div>
  );
}
