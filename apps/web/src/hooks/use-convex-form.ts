"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useForm,
  type DefaultValues,
  type FieldValues,
  type Resolver,
  type UseFormProps,
  type UseFormReturn,
} from "react-hook-form";
import type { z } from "zod";
import { getConvexErrorMessage } from "@/lib/convex-error";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export type UseConvexFormOptions<T extends FieldValues> = Omit<
  UseFormProps<T>,
  "resolver"
> & {
  schema: z.ZodType<T>;
};

export type UseConvexFormReturn<T extends FieldValues> = UseFormReturn<T> & {
  saveStatus: SaveStatus;
  saveError: string | null;
  setSaveStatus: (status: SaveStatus) => void;
  setSaveError: (error: string | null) => void;
  submitMutation: <R>(
    handler: (values: T) => Promise<R>,
    options?: { successMessage?: string; onSuccess?: (result: R) => void },
  ) => (values: T) => Promise<R | undefined>;
  runMutation: <R>(
    handler: () => Promise<R>,
    options?: { successMessage?: string; onSuccess?: (result: R) => void },
  ) => Promise<R | undefined>;
  resetSaveState: () => void;
};

function captureTextInputFocus(): () => void {
  const active = document.activeElement;
  if (
    !active ||
    !(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)
  ) {
    return () => {};
  }

  const element = active;
  const selectionStart = element.selectionStart;
  const selectionEnd = element.selectionEnd;

  return () => {
    requestAnimationFrame(() => {
      if (!document.contains(element)) return;
      element.focus({ preventScroll: true });
      if (selectionStart !== null && selectionEnd !== null) {
        element.setSelectionRange(selectionStart, selectionEnd);
      }
    });
  };
}

export function useConvexForm<T extends FieldValues>({
  schema,
  defaultValues,
  ...formOptions
}: UseConvexFormOptions<T>): UseConvexFormReturn<T> {
  const form = useForm<T>({
    ...formOptions,
    defaultValues: defaultValues as DefaultValues<T>,
    resolver: zodResolver(schema as never) as Resolver<T>,
  });

  const schemaRef = useRef(schema);
  schemaRef.current = schema;

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const savedFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetSaveState = useCallback(() => {
    setSaveStatus("idle");
    setSaveError(null);
  }, []);

  const markSaved = useCallback(() => {
    setSaveStatus("saved");
    setSaveError(null);
    if (savedFadeTimerRef.current) clearTimeout(savedFadeTimerRef.current);
    savedFadeTimerRef.current = setTimeout(() => {
      setSaveStatus((current) => (current === "saved" ? "idle" : current));
    }, 3000);
  }, []);

  const runMutation = useCallback(
    async <R,>(
      handler: () => Promise<R>,
      options?: { successMessage?: string; onSuccess?: (result: R) => void },
    ): Promise<R | undefined> => {
      setSaveStatus("saving");
      setSaveError(null);
      try {
        const result = await handler();
        markSaved();
        options?.onSuccess?.(result);
        return result;
      } catch (error) {
        const message = getConvexErrorMessage(error);
        setSaveStatus("error");
        setSaveError(message);
        return undefined;
      }
    },
    [markSaved],
  );

  const submitMutation = useCallback(
    <R,>(
      handler: (values: T) => Promise<R>,
      options?: { successMessage?: string; onSuccess?: (result: R) => void },
    ) =>
      async (values: T): Promise<R | undefined> => {
        return runMutation(() => handler(values), options);
      },
    [runMutation],
  );

  const debouncedAutoSave = useCallback(
    (
      onSave: (values: T) => Promise<void>,
      options?: { delayMs?: number; enabled?: boolean },
    ) => {
      const { delayMs = 1000, enabled = true } = options ?? {};
      if (!enabled) return;

      if (suppressAutoSaveRef.current) {
        suppressAutoSaveRef.current = false;
        return;
      }

      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(() => {
        void (async () => {
          if (!form.formState.isDirty) return;

          const values = form.getValues();
          const parsed = schemaRef.current.safeParse(values);
          if (!parsed.success) return;

          const result = await runMutation(() => onSave(parsed.data));
          if (result === undefined) return;

          if (form.formState.isDirty) {
            const restoreFocus = captureTextInputFocus();
            form.reset(parsed.data as DefaultValues<T>, { keepValues: true });
            restoreFocus();
          }
        })();
      }, delayMs);
    },
    [form, runMutation],
  );

  const suppressNextAutoSave = useCallback(() => {
    suppressAutoSaveRef.current = true;
  }, []);

  // Subscribe to dirty state so consumers re-render when edits are made.
  void form.formState.isDirty;

  useEffect(() => {
    return () => {
      if (savedFadeTimerRef.current) clearTimeout(savedFadeTimerRef.current);
    };
  }, []);

  const extendedForm = form as UseConvexFormReturn<T>;
  extendedForm.saveStatus = saveStatus;
  extendedForm.saveError = saveError;
  extendedForm.setSaveStatus = setSaveStatus;
  extendedForm.setSaveError = setSaveError;
  extendedForm.submitMutation = submitMutation;
  extendedForm.runMutation = runMutation;
  extendedForm.resetSaveState = resetSaveState;
  extendedForm.debouncedAutoSave = debouncedAutoSave;
  extendedForm.suppressNextAutoSave = suppressNextAutoSave;

  return extendedForm;
}
