"use client";

import { motion } from "framer-motion";
import {
  QuestionnaireActions,
  QuestionnaireChoices,
  QuestionnaireInput,
  QuestionnaireNext,
  QuestionnairePrevious,
  QuestionnaireProgress,
  QuestionnaireSkip,
  QuestionnaireSubmit,
} from "@/components/ui/questionnaire";

export const QUESTIONNAIRE_ITEM_CLASSNAME =
  "space-y-6 border border-border/50 bg-background/70 p-5 shadow-[0_8px_24px_rgba(0,0,0,0.06)] backdrop-blur-xl data-active:animate-in data-active:fade-in-0 data-active:slide-in-from-bottom-2 data-active:duration-300 motion-reduce:animate-none sm:p-6";

export const QUESTIONNAIRE_CHOICE_CLASSNAME =
  "gap-3 rounded-md p-3 text-sm hover:bg-muted/40 data-checked:border-primary data-checked:bg-primary/5";

export const QUESTIONNAIRE_TITLE_CLASSNAME =
  "text-2xl font-semibold tracking-tight sm:text-3xl";

const progressSpring = { type: "spring" as const, stiffness: 380, damping: 36 };

function isTextEntryTarget(target: EventTarget | null) {
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  if (target instanceof HTMLInputElement) {
    return !["button", "checkbox", "radio", "reset", "submit"].includes(target.type);
  }
  return false;
}

function clickVisibleQuestionnaireAction(form: HTMLFormElement) {
  const next = form.querySelector<HTMLButtonElement>(
    "[data-slot=questionnaire-next]:not([hidden])",
  );
  const submit = form.querySelector<HTMLButtonElement>(
    "[data-slot=questionnaire-submit]:not([hidden])",
  );
  const action = next ?? submit;
  if (!action || action.disabled) return;
  action.click();
}

/** Hidden answered input so non-choice steps stay in the questionnaire graph. */
export function MarkStepAnswered() {
  return (
    <QuestionnaireChoices className="sr-only">
      <QuestionnaireInput aria-label="Continue" readOnly tabIndex={-1} value="answered" />
    </QuestionnaireChoices>
  );
}

export function handleQuestionnaireEnter(event: React.KeyboardEvent<HTMLFormElement>) {
  if (event.defaultPrevented || event.repeat || event.key !== "Enter") return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.target instanceof HTMLTextAreaElement) return;
  if (
    event.target instanceof HTMLElement &&
    event.target.closest("[data-slot=questionnaire-input]")
  ) {
    return;
  }
  if (
    event.target instanceof HTMLInputElement &&
    (event.target.type === "radio" || event.target.type === "checkbox")
  ) {
    return;
  }
  if (isTextEntryTarget(event.target) || event.target instanceof HTMLElement) {
    event.preventDefault();
    clickVisibleQuestionnaireAction(event.currentTarget);
  }
}

export function QuestionnaireWizardProgress({
  complete = false,
  label,
}: {
  complete?: boolean;
  label: string;
}) {
  return (
    <div className="mt-2 h-0.5 overflow-hidden bg-foreground/10">
      {complete ? (
        <div className="h-full w-full bg-primary" />
      ) : (
        <QuestionnaireProgress
          aria-label={label}
          className="block h-full min-h-0 w-full min-w-0 p-0 text-[0px] leading-none"
          render={(props, state) => {
            const { children: _children, ...rest } = props;
            return (
              <motion.div
                {...rest}
                className="h-full bg-primary"
                initial={false}
                animate={{
                  width: `${state.first ? 0 : (state.current / state.total) * 100}%`,
                }}
                transition={progressSpring}
              />
            );
          }}
        />
      )}
    </div>
  );
}

export function QuestionnaireWizardFooter({
  disabled,
  isSubmitting,
  nextLabel = "Next",
  submitLabel = "Submit",
  submittingLabel = "Submitting...",
}: {
  disabled?: boolean;
  isSubmitting?: boolean;
  nextLabel?: string;
  submitLabel?: string;
  submittingLabel?: string;
}) {
  return (
    <QuestionnaireActions className="grid-cols-[1fr_auto_1fr] gap-3">
      <QuestionnairePrevious disabled={disabled}>Back</QuestionnairePrevious>
      <QuestionnaireSkip
        disabled={disabled}
        variant="link"
        className="justify-self-center text-sm text-muted-foreground"
        render={(props, state) =>
          state.visible ? (
            <button {...props} />
          ) : (
            <p className="col-start-2 row-start-1 hidden justify-self-center text-xs text-muted-foreground sm:block">
              Press Enter ↵
            </p>
          )
        }
      >
        Skip
      </QuestionnaireSkip>
      <QuestionnaireNext disabled={disabled}>{nextLabel}</QuestionnaireNext>
      <QuestionnaireSubmit disabled={disabled}>
        {isSubmitting ? submittingLabel : submitLabel}
      </QuestionnaireSubmit>
    </QuestionnaireActions>
  );
}
