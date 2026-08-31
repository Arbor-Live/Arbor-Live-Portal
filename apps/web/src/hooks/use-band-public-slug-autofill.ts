"use client";

import { useCallback, useEffect, useRef } from "react";
import type { FieldPath, FieldValues, UseFormReturn } from "react-hook-form";
import { slugifyBandName } from "@/lib/validations/bands";

type SlugAutofillFields = {
  displayName: string;
  publicSlug?: string;
  publicListing?: boolean;
};

export function useBandPublicSlugAutofill<T extends FieldValues & SlugAutofillFields>(
  form: UseFormReturn<T>,
  slugFieldName: FieldPath<T> = "publicSlug" as FieldPath<T>,
) {
  const slugTouchedRef = useRef(
    Boolean(String(form.getValues(slugFieldName) ?? "").trim()),
  );
  const displayName = form.watch("displayName" as FieldPath<T>) as string;
  const publicListing = form.watch("publicListing" as FieldPath<T>) as boolean | undefined;

  const markSlugTouched = useCallback(() => {
    slugTouchedRef.current = true;
  }, []);

  const syncSlugTouchedFromForm = useCallback(() => {
    slugTouchedRef.current = Boolean(String(form.getValues(slugFieldName) ?? "").trim());
  }, [form, slugFieldName]);

  useEffect(() => {
    if (slugTouchedRef.current) return;
    const nextSlug = slugifyBandName(displayName ?? "");
    if (!nextSlug) return;
    form.setValue(slugFieldName, nextSlug as T[FieldPath<T>], {
      shouldDirty: false,
      shouldValidate: true,
    });
  }, [displayName, form, slugFieldName]);

  useEffect(() => {
    if (!publicListing || slugTouchedRef.current) return;
    const currentSlug = String(form.getValues(slugFieldName) ?? "").trim();
    if (currentSlug) return;
    const nextSlug = slugifyBandName(displayName ?? "");
    if (!nextSlug) return;
    form.setValue(slugFieldName, nextSlug as T[FieldPath<T>], {
      shouldDirty: false,
      shouldValidate: true,
    });
  }, [publicListing, displayName, form, slugFieldName]);

  return {
    markSlugTouched,
    syncSlugTouchedFromForm,
  };
}
