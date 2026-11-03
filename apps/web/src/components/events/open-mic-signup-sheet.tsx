"use client";

import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import {
  DetailSheetFooter,
  DetailSheetHeader,
  RowFlag,
  SheetField,
  SheetFields,
  SheetSection,
} from "@/components/list-page";
import { StatusPill } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/format";
import type { RunnerSignup } from "@/lib/open-mic-runner-view";
import { formatNightStart } from "@/lib/open-mic-status";

function ordinal(n: number) {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function SignupPill({ signup, queueIndex }: { signup: RunnerSignup; queueIndex: number }) {
  if (signup.status === "current") return <StatusPill tone="emerald">On stage</StatusPill>;
  if (signup.status === "performed") {
    return (
      <StatusPill tone="neutral">
        Performed{signup.performedAt ? ` ${formatTime(signup.performedAt)}` : ""}
      </StatusPill>
    );
  }
  return <StatusPill tone="neutral">{ordinal(queueIndex + 1)} in queue</StatusPill>;
}

/** Render keyed on the sign-up id so the panel resets when another row opens. */
export function SignupSheetBody({
  signup,
  queueIndex,
  onRemove,
}: {
  signup: RunnerSignup;
  /** Zero-based place in the queue; unused unless the sign-up is queued. */
  queueIndex: number;
  /** Confirms and removes; the runner closes the panel once it succeeds. */
  onRemove: (signup: RunnerSignup) => Promise<boolean>;
}) {
  const removable = signup.status === "queued" || signup.status === "current";
  return (
    <>
      <DetailSheetHeader
        title={signup.name}
        pill={<SignupPill signup={signup} queueIndex={queueIndex} />}
        description={`Signed up ${formatNightStart(signup.submittedAt)}`}
      />

      <SheetSection title="Performance">
        <SheetFields>
          <SheetField label="Doing">{signup.whatTheyreDoing}</SheetField>
          <SheetField label="Equipment">
            {signup.equipment.length > 0 ? (
              <span className="flex flex-wrap gap-1.5">
                {signup.equipment.map((item) => (
                  <RowFlag key={item} tone="neutral">
                    {item}
                  </RowFlag>
                ))}
              </span>
            ) : (
              "None"
            )}
          </SheetField>
          <SheetField label="Background music">
            {signup.bgMusicLink ? (
              <a
                href={signup.bgMusicLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline underline-offset-2"
              >
                Open link
                <ArrowSquareOutIcon className="size-3" aria-hidden />
              </a>
            ) : (
              "None"
            )}
          </SheetField>
        </SheetFields>
      </SheetSection>

      <SheetSection title="Contact">
        <SheetFields>
          <SheetField label="Email">
            <a href={`mailto:${signup.email}`} className="underline-offset-4 hover:underline">
              {signup.email}
            </a>
          </SheetField>
        </SheetFields>
      </SheetSection>

      {signup.notes ? (
        <SheetSection title="Notes">
          <p className="text-sm whitespace-pre-wrap">{signup.notes}</p>
        </SheetSection>
      ) : null}

      <DetailSheetFooter
        start={
          removable ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive"
              onClick={() => void onRemove(signup)}
            >
              Remove from queue
            </Button>
          ) : undefined
        }
      />
    </>
  );
}
