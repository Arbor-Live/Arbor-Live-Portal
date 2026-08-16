"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "convex/react";
import { FormProvider, useForm, useFormContext, type Resolver } from "react-hook-form";
import type { QuestionnaireItemDefinition } from "@shadcn/react/questionnaire";
import { api } from "@/lib/convex-api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PublicMarketingLayout } from "@/components/public/public-marketing-layout";
import { submitOpenMicSignup } from "@/app/(site)/open-mic/actions";
import { RequestWizardShell } from "@/components/request/request-wizard-shell";
import { TextField } from "@/components/request/fields/text-field";
import { TextareaField } from "@/components/request/fields/textarea-field";
import { OpenMicIntroSlide } from "@/components/request/open-mic-intro-slide";
import {
  Questionnaire,
  QuestionnaireChoice,
  QuestionnaireChoices,
  QuestionnaireDescription,
  QuestionnaireError,
  QuestionnaireItem,
  QuestionnaireTitle,
} from "@/components/ui/questionnaire";
import {
  QUESTIONNAIRE_CHOICE_CLASSNAME,
  QUESTIONNAIRE_ITEM_CLASSNAME,
  QUESTIONNAIRE_TITLE_CLASSNAME,
  handleQuestionnaireEnter,
  MarkStepAnswered,
  QuestionnaireWizardFooter,
  QuestionnaireWizardProgress,
} from "@/components/ui/questionnaire-wizard";
import { formatDateTime } from "@/lib/format";
import {
  OPEN_MIC_EQUIPMENT_OPTIONS,
  openMicSignupDefaultValues,
  openMicSignupSchema,
  getActiveSteps,
  type OpenMicSignupFormValues,
  type OpenMicStepId,
} from "@/lib/validations/open-mic";

const QUESTION_STEPS = [
  "intro",
  "welcome",
  "name",
  "email",
  "whatYoureDoing",
  "equipment",
  "bgMusicLink",
  "notes",
] as const satisfies readonly OpenMicStepId[];

type QuestionStepId = (typeof QUESTION_STEPS)[number];

function StepSubheader({ text }: { text: string }) {
  const paragraphs = text.split("\n\n");
  return (
    <QuestionnaireDescription className="text-sm/relaxed text-foreground/70 whitespace-pre-line">
      {paragraphs.join("\n\n")}
    </QuestionnaireDescription>
  );
}

export function OpenMicWizard() {
  const marketingSettings = useQuery(api.marketingSettings.get, {});
  const activeNight = useQuery(api.openMic.getActiveNight, {});
  const showIntro = marketingSettings?.openMicMarketingBoost === true;

  const form = useForm<OpenMicSignupFormValues>({
    resolver: zodResolver(openMicSignupSchema as never) as Resolver<OpenMicSignupFormValues>,
    defaultValues: openMicSignupDefaultValues,
    mode: "onTouched",
  });

  const [item, setItem] = useState<QuestionStepId | null>(null);
  const resolvedItem: QuestionStepId = item ?? (showIntro ? "intro" : "welcome");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    nightTitle: string;
    nightStartAt: number;
  } | null>(null);
  const didFocusActiveItem = useRef(false);

  // eslint-disable-next-line react-hooks/incompatible-library -- React Hook Form watch() is intentionally used for step routing
  const equipment = form.watch("equipment");
  const showBgMusicLink = equipment.includes("Background Music");

  const activeSteps = useMemo(
    () => getActiveSteps({ showBgMusicLink }),
    [showBgMusicLink],
  );

  const items = useMemo<QuestionnaireItemDefinition[]>(
    () =>
      QUESTION_STEPS.map((name) => {
        const step = activeSteps.find((entry) => entry.id === name);
        const introDisabled = name === "intro" && !showIntro;
        return {
          name,
          required: name !== "equipment" && Boolean(step || name === "intro"),
          disabled: introDisabled || (name !== "intro" && !step),
          choices:
            name === "equipment"
              ? OPEN_MIC_EQUIPMENT_OPTIONS.map((value) => ({ value }))
              : undefined,
        };
      }),
    [activeSteps, showIntro],
  );

  useEffect(() => {
    if (didFocusActiveItem.current) return;
    const active = document.querySelector<HTMLElement>(
      "[data-slot=questionnaire-item][data-active]",
    );
    if (!active) return;
    active.focus();
    didFocusActiveItem.current = true;
  }, [resolvedItem]);

  const handleItemChange = useCallback(
    async (next: string) => {
      setSubmitError(null);
      const enabled = QUESTION_STEPS.filter((name) => {
        if (name === "intro") return showIntro;
        return Boolean(activeSteps.find((step) => step.id === name));
      });
      const currentIndex = enabled.indexOf(resolvedItem);
      const requestedIndex = enabled.indexOf(next as QuestionStepId);
      const goingBack = requestedIndex !== -1 && requestedIndex < currentIndex;

      if (goingBack) {
        setItem(next as QuestionStepId);
        return;
      }

      const step = activeSteps.find((entry) => entry.id === resolvedItem);
      if (resolvedItem !== "intro" && step?.fields.length && !step.skippable) {
        const valid = await form.trigger(step.fields);
        if (!valid) return;
      }

      setItem(next as QuestionStepId);
    },
    [activeSteps, form, resolvedItem, showIntro],
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSubmitError(null);
      const notesStep = activeSteps.find((step) => step.id === "notes");
      if (notesStep?.fields.length) {
        const valid = await form.trigger(notesStep.fields);
        if (!valid) return;
      }
      if (!activeNight) {
        setSubmitError(
          "No upcoming open mic night is open for sign-ups right now. Check back soon!",
        );
        return;
      }
      setIsSubmitting(true);
      const result = await submitOpenMicSignup(activeNight._id, form.getValues());
      setIsSubmitting(false);
      if (!result.ok) {
        setSubmitError(result.message);
        if (result.fieldErrors) {
          for (const [field, message] of Object.entries(result.fieldErrors)) {
            form.setError(field as keyof OpenMicSignupFormValues, { message });
          }
        }
        return;
      }
      setConfirmation({ nightTitle: result.nightTitle, nightStartAt: result.nightStartAt });
    },
    [activeNight, activeSteps, form],
  );

  const hideFooter = Boolean(confirmation) || resolvedItem === "intro";

  if (activeNight === undefined) {
    return (
      <PublicMarketingLayout hideFooter>
        <RequestWizardShell eyebrow="Open Mic sign-up" progressPercent={0}>
          <div className="px-4 py-8 sm:px-6">
            <p className="text-sm text-foreground/70">Loading…</p>
          </div>
        </RequestWizardShell>
      </PublicMarketingLayout>
    );
  }

  if (activeNight === null) {
    return (
      <PublicMarketingLayout hideFooter>
        <RequestWizardShell eyebrow="Open Mic sign-up" progressPercent={0}>
          <div className="px-4 py-8 sm:px-6">
            <div className="space-y-3 border border-border/50 bg-background/70 p-5 shadow-[0_8px_24px_rgba(0,0,0,0.06)] backdrop-blur-xl sm:p-6">
              <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
                No open mic right now
              </h1>
              <p className="text-sm text-foreground/70">
                There isn&apos;t an upcoming Arbor Live open mic accepting sign-ups at the moment.
                Check back closer to the next night, or follow us on Instagram for the schedule.
              </p>
              <Button asChild variant="outline">
                <a
                  href="https://instagram.com/thearborstanford"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  @thearborstanford
                </a>
              </Button>
            </div>
          </div>
        </RequestWizardShell>
      </PublicMarketingLayout>
    );
  }

  return (
    <PublicMarketingLayout hideFooter>
      <FormProvider {...form}>
        <Questionnaire
          className="flex min-h-0 w-full flex-1 flex-col gap-0"
          items={items}
          item={resolvedItem}
          shortcuts="letters"
          onItemChange={(next) => {
            setIsAdvancing(true);
            void handleItemChange(next).finally(() => setIsAdvancing(false));
          }}
          onSubmit={(event) => void handleSubmit(event)}
          onKeyDown={handleQuestionnaireEnter}
        >
          <RequestWizardShell
            eyebrow={`Open Mic sign-up · ${activeNight.title}`}
            meta={formatDateTime(activeNight.startAt)}
            progress={
              <QuestionnaireWizardProgress
                complete={Boolean(confirmation)}
                label="Open Mic sign-up progress"
              />
            }
            footer={
              hideFooter ? null : (
                <QuestionnaireWizardFooter
                  disabled={isSubmitting || isAdvancing}
                  isSubmitting={isSubmitting}
                  submitLabel="Sign me up"
                />
              )
            }
          >
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              className="hidden"
              {...form.register("website")}
            />

            <div className="flex-1 overflow-y-auto px-4 py-8 sm:px-6">
              {submitError ? (
                <Alert variant="destructive" className="mb-4">
                  <AlertDescription>{submitError}</AlertDescription>
                </Alert>
              ) : null}

              {confirmation ? (
                <div className={QUESTIONNAIRE_ITEM_CLASSNAME}>
                  <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
                    You&apos;re on the list!
                  </h1>
                  <div className="space-y-4 text-sm text-foreground/70">
                    <p>You&apos;re on the list — we&apos;ll call you up when it&apos;s your turn.</p>
                    <div className="border border-border/50 bg-background/50 p-4 text-foreground">
                      <p className="font-medium">{confirmation.nightTitle}</p>
                      <p className="mt-1 text-foreground/70">
                        {formatDateTime(confirmation.nightStartAt)}
                      </p>
                    </div>
                    <p>
                      Bring friends, show up on time, and check in with the crew when you arrive so we
                      know you&apos;re here.
                    </p>
                  </div>
                </div>
              ) : (
                QUESTION_STEPS.map((name) => {
                  const step =
                    name === "intro"
                      ? { id: "intro" as const, headline: "", subheader: undefined }
                      : activeSteps.find((entry) => entry.id === name);
                  const introDisabled = name === "intro" && !showIntro;
                  const disabled = introDisabled || (name !== "intro" && !step);
                  const required = name !== "equipment" && !disabled;
                  const fieldError = stepFieldError(form, name);

                  return (
                    <QuestionnaireItem
                      key={name}
                      name={name}
                      required={required}
                      disabled={disabled}
                      multiple={name === "equipment"}
                      invalid={Boolean(fieldError)}
                      className={QUESTIONNAIRE_ITEM_CLASSNAME}
                    >
                      {name === "intro" ? (
                        <OpenMicIntroSlide onContinue={() => setItem("welcome")} />
                      ) : (
                        <>
                          <div className="space-y-3">
                            <QuestionnaireTitle className={QUESTIONNAIRE_TITLE_CLASSNAME}>
                              {step && "headline" in step ? step.headline : ""}
                            </QuestionnaireTitle>
                            {step && "subheader" in step && step.subheader ? (
                              <StepSubheader text={step.subheader} />
                            ) : null}
                          </div>
                          <StepBody stepId={name} />
                          {name !== "equipment" ? <MarkStepAnswered /> : null}
                          <QuestionnaireError className="text-sm">{fieldError}</QuestionnaireError>
                        </>
                      )}
                      {name === "intro" ? <MarkStepAnswered /> : null}
                    </QuestionnaireItem>
                  );
                })
              )}
            </div>
          </RequestWizardShell>
        </Questionnaire>
      </FormProvider>
    </PublicMarketingLayout>
  );
}

function stepFieldError(
  form: ReturnType<typeof useForm<OpenMicSignupFormValues>>,
  stepId: OpenMicStepId,
) {
  const errors = form.formState.errors;
  switch (stepId) {
    case "name":
      return errors.name?.message;
    case "email":
      return errors.email?.message;
    case "whatYoureDoing":
      return errors.whatTheyreDoing?.message;
    case "equipment":
      return errors.equipment?.message;
    case "bgMusicLink":
      return errors.bgMusicLink?.message;
    case "notes":
      return errors.notes?.message;
    default:
      return undefined;
  }
}

function StepBody({ stepId }: { stepId: OpenMicStepId }) {
  const form = useFormContext<OpenMicSignupFormValues>();
  const values = form.watch();

  switch (stepId) {
    case "name":
      return <TextField name="name" label="Your name" placeholder="First and last name" autoFocus />;
    case "email":
      return (
        <TextField
          name="email"
          label="Stanford email"
          placeholder="you@stanford.edu"
          type="email"
          autoFocus
        />
      );
    case "whatYoureDoing":
      return (
        <TextareaField
          name="whatTheyreDoing"
          label="Your answer"
          placeholder="Singing a song, doing a comedy set, playing guitar..."
          autoFocus
        />
      );
    case "equipment":
      return (
        <QuestionnaireChoices>
          {OPEN_MIC_EQUIPMENT_OPTIONS.map((option) => (
            <QuestionnaireChoice
              key={option}
              value={option}
              className={QUESTIONNAIRE_CHOICE_CLASSNAME}
              checked={values.equipment.includes(option)}
              onChange={(event) => {
                const selected = event.currentTarget.checked;
                const next = selected
                  ? Array.from(new Set([...values.equipment, option]))
                  : values.equipment.filter((item) => item !== option);
                form.setValue("equipment", next, { shouldDirty: true, shouldValidate: true });
              }}
            >
              {option}
            </QuestionnaireChoice>
          ))}
        </QuestionnaireChoices>
      );
    case "bgMusicLink":
      return (
        <TextField
          name="bgMusicLink"
          label="Background music link"
          placeholder="https://youtube.com/watch?v=..."
          type="text"
          autoFocus
        />
      );
    case "notes":
      return (
        <TextareaField
          name="notes"
          label="Your answer"
          placeholder="Pronouns, set length, anything we should know..."
          autoFocus
        />
      );
    default:
      return null;
  }
}
