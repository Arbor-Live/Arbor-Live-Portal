import type { FieldErrors } from "react-hook-form";
import type {
  OpenMicSignupFormValues,
  OpenMicStepConfig,
  OpenMicStepId,
} from "@/lib/validations/open-mic";

export function getOpenMicStepFieldError(
  errors: FieldErrors<OpenMicSignupFormValues>,
  stepId: OpenMicStepId,
): string | undefined {
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

export function firstOpenMicStepWithError(
  steps: readonly OpenMicStepConfig[],
  errors: FieldErrors<OpenMicSignupFormValues>,
): OpenMicStepId | null {
  for (const step of steps) {
    if (getOpenMicStepFieldError(errors, step.id)) {
      return step.id;
    }
  }
  return null;
}

export function firstOpenMicStepForField(
  steps: readonly OpenMicStepConfig[],
  field: string,
): OpenMicStepId | null {
  const root = field.split(".")[0] as keyof OpenMicSignupFormValues;
  for (const step of steps) {
    if (step.fields.includes(root)) {
      return step.id;
    }
  }
  return null;
}
