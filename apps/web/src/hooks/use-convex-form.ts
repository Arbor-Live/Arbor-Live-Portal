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
  debouncedAutoSave: (
    onSave: (values: T) => Promise<void>,
    options?: { delayMs?: number; enabled?: boolean },
  ) => void;
  suppressNextAutoSave: () => void;
};

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

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const savedFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressAutoSaveRef = useRef(false);

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
        void form.handleSubmit(async (values: T) => {
          if (!form.formState.isDirty) return;
          await runMutation(() => onSave(values));
          if (form.formState.isDirty) {
            form.reset(values as DefaultValues<T>, { keepValues: true });
          }
        })();
      }, delayMs);
    },
    [form, runMutation],
  );

  const suppressNextAutoSave = useCallback(() => {
    suppressAutoSaveRef.current = true;
  }, []);

  useEffect(() => {
    return () => {
      if (savedFadeTimerRef.current) clearTimeout(savedFadeTimerRef.current);
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  return {
    ...form,
    saveStatus,
    saveError,
    setSaveStatus,
    setSaveError,
    submitMutation,
    runMutation,
    resetSaveState,
    debouncedAutoSave,
    suppressNextAutoSave,
  };
}
