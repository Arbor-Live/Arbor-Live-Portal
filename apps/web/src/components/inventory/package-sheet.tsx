"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormState } from "react-hook-form";
import { useMutation } from "convex/react";
import { TrashIcon } from "@phosphor-icons/react";
import { FileUploadField } from "@/components/files/file-upload-field";
import { TextFormField } from "@/components/forms/text-form-field";
import { TextareaFormField } from "@/components/forms/textarea-form-field";
import { DetailSheet, DetailSheetFooter, DetailSheetHeader, SheetSection } from "@/components/list-page";
import { StatusPill } from "@/components/page-header";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useConvexForm } from "@/hooks/use-convex-form";
import { api } from "@/lib/convex-api";
import { formatUsdOptional } from "@/lib/format";
import { notify } from "@/lib/notify";
import { inventoryPackageSchema, type InventoryPackageFormValues } from "@/lib/validations/inventory";
import { HERO_LANDSCAPE_ASPECT_RATIO } from "@/lib/image-processing";
import {
  buildPackagePayload,
  contentsFromDraft,
  defaultPackageValues,
  draftFromContents,
  PACKAGE_STATUS_LABELS,
  PACKAGE_STATUS_TONES,
  packageStatus,
  toPackageFormValues,
  type PackageRow,
} from "./package-form";
import { PackageItemsEditor, useSuggestedPackagePricing, type ContentUnitDraft } from "./package-items-editor";
import { publicBucketLabels, type PublicPackageBucket } from "./package-section-utils";

type EditorProps = Pick<
  React.ComponentProps<typeof PackageItemsEditor>,
  "types" | "inventoryItems" | "categories"
>;

/**
 * The package editor. `row: null` with `open` is a new package. Saves go
 * straight through the mutation; the panel closes only once the save succeeds,
 * and closing with unsaved edits asks first.
 */
export function PackageSheet({
  open,
  row,
  onOpenChange,
  onDelete,
  ...editor
}: EditorProps & {
  open: boolean;
  row: PackageRow | null;
  onOpenChange: (open: boolean) => void;
  /** Resolves true once the package is deleted; false if cancelled or it failed. */
  onDelete: (row: PackageRow) => Promise<boolean>;
}) {
  const { confirm } = useAppDialog();
  const dirtyRef = useRef(false);

  async function requestClose() {
    if (dirtyRef.current) {
      const discard = await confirm({
        title: row ? `Discard your changes to ${row.name}?` : "Discard this new package?",
        description: "What you've entered in the panel will be lost. The saved package stays as it was.",
        destructive: true,
        confirmLabel: "Discard changes",
      });
      if (!discard) return;
    }
    dirtyRef.current = false;
    onOpenChange(false);
  }

  return (
    <DetailSheet
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else void requestClose();
      }}
      testId="package-sheet"
      className="sm:max-w-2xl"
    >
      {open ? (
        // Keyed so the draft resets when another package opens.
        <PackageSheetBody
          key={row?._id ?? "new"}
          row={row}
          {...editor}
          onDirtyChange={(dirty) => {
            dirtyRef.current = dirty;
          }}
          onSaved={() => {
            dirtyRef.current = false;
            onOpenChange(false);
          }}
          onCancel={() => void requestClose()}
          onDelete={onDelete}
        />
      ) : null}
    </DetailSheet>
  );
}

function PackageSheetBody({
  row,
  types,
  inventoryItems,
  categories,
  onDirtyChange,
  onSaved,
  onCancel,
  onDelete,
}: EditorProps & {
  row: PackageRow | null;
  onDirtyChange: (dirty: boolean) => void;
  onSaved: () => void;
  onCancel: () => void;
  onDelete: (row: PackageRow) => Promise<boolean>;
}) {
  const createPackage = useMutation(api.inventoryPackages.create);
  const updatePackage = useMutation(api.inventoryPackages.update);
  const [deleting, setDeleting] = useState(false);
  const [contentUnits, setContentUnits] = useState<ContentUnitDraft[]>(() =>
    row ? draftFromContents(row.contents ?? []) : [],
  );

  const form = useConvexForm<InventoryPackageFormValues>({
    schema: inventoryPackageSchema,
    defaultValues: row ? toPackageFormValues(row, contentUnits) : defaultPackageValues,
    mode: "onTouched",
  });

  /**
   * Subscribed rather than read off `form.formState`: `useConvexForm` memoises
   * its return, so the snapshot doesn't change when a submit-time validation
   * error appears, and the section-picker and contents errors below would
   * never show.
   */
  const { errors } = useFormState({ control: form.control });
  const isDirty = form.formState.isDirty;
  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  // Contents live in draft state; mirror them into the form so dirty tracking and validation see them.
  useEffect(() => {
    form.setValue("contents", contentsFromDraft(contentUnits), { shouldDirty: true });
  }, [contentUnits, form]);

  const typeLookup = useMemo(() => new Map(types.map((type) => [type._id, type])), [types]);
  const suggested = useSuggestedPackagePricing(contentUnits, typeLookup);
  const values = form.watch();
  const setField = <K extends keyof InventoryPackageFormValues>(key: K, value: InventoryPackageFormValues[K]) => {
    form.setValue(key, value as never, { shouldDirty: true });
  };

  const onSubmit = form.submitMutation(
    async (submitted: InventoryPackageFormValues) => {
      const payload = buildPackagePayload(submitted, contentUnits);
      if (row) await updatePackage({ id: row._id, ...payload });
      else await createPackage(payload);
    },
    {
      onSuccess: () => {
        notify.success(row ? `Saved ${form.getValues("name")}` : `Created ${form.getValues("name")}`);
        onSaved();
      },
    },
  );

  const saving = form.saveStatus === "saving";
  const status = row ? packageStatus(row) : null;

  return (
    <Form {...form}>
      <form
        id="package-editor-form"
        className="flex min-h-full flex-col"
        onSubmit={form.handleSubmit(onSubmit)}
        data-testid="package-form"
      >
        <DetailSheetHeader
          title={row ? row.name : "New package"}
          pill={
            status ? (
              <StatusPill tone={PACKAGE_STATUS_TONES[status]} className="h-6">
                {PACKAGE_STATUS_LABELS[status]}
              </StatusPill>
            ) : null
          }
          description={
            row
              ? `Worth ${formatUsdOptional(row.estimatedRentalValueUsd)} at the contents' normal rental rates.`
              : "A rentable kit: name it, add equipment from the catalog, then price it."
          }
        />

        <SheetSection title="Details">
          <TextFormField name="name" label="Name" />
          <TextareaFormField name="description" label="Description" placeholder="Supports Markdown" />
          <p className="-mt-2 text-xs text-muted-foreground">Shown on the public package page when listed.</p>
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label htmlFor="package-active">Active</Label>
              <p className="text-xs text-muted-foreground">Inactive packages stay saved but drop off the public pages.</p>
            </div>
            <Switch
              id="package-active"
              checked={values.active}
              onCheckedChange={(checked) => setField("active", checked)}
            />
          </div>
        </SheetSection>

        <SheetSection title="Contents">
          <PackageItemsEditor
            units={contentUnits}
            onUnitsChange={setContentUnits}
            types={types}
            inventoryItems={inventoryItems}
            categories={categories}
          />
          {errors.contents ? <p className="text-sm text-destructive">{errors.contents.message}</p> : null}
        </SheetSection>

        <SheetSection
          title="Pricing"
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setField("subsidizedPackagePriceUsd", Number(suggested.subsidized.toFixed(2)));
                setField("nonSubsidizedPackagePriceUsd", Number(suggested.nonSubsidized.toFixed(2)));
              }}
            >
              Use suggested prices
            </Button>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <TextFormField name="subsidizedPackagePriceUsd" label="Subsidized Package Price (USD)" type="number" />
            <TextFormField
              name="nonSubsidizedPackagePriceUsd"
              label="Non-Subsidized Package Price (USD)"
              type="number"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Suggested from the contents: {formatUsdOptional(Number(suggested.subsidized.toFixed(2)))} subsidized,{" "}
            {formatUsdOptional(Number(suggested.nonSubsidized.toFixed(2)))} non-subsidized. Where a unit offers
            alternatives, the dearest one counts.
          </p>
        </SheetSection>

        <SheetSection title="Public page">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="package-public-listing">List publicly</Label>
            <Switch
              id="package-public-listing"
              checked={values.publicListing}
              onCheckedChange={(checked) => {
                setField("publicListing", checked);
                if (!checked) setField("publicBucket", "");
              }}
            />
          </div>
          {values.publicListing ? (
            <div className="space-y-2">
              <Label htmlFor="package-public-bucket">Public browse section</Label>
              <Select
                value={values.publicBucket || "none"}
                onValueChange={(value) =>
                  setField(
                    "publicBucket",
                    (value === "none" ? "" : value) as InventoryPackageFormValues["publicBucket"],
                  )
                }
              >
                <SelectTrigger id="package-public-bucket" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select section…</SelectItem>
                  {(Object.keys(publicBucketLabels) as PublicPackageBucket[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {publicBucketLabels[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/*
                The section picker isn't a FormField, so nothing else renders
                its error. The schema refuses `publicListing` without a
                section, and without this Create would just do nothing.
              */}
              {errors.publicBucket ? <p className="text-sm text-destructive">{errors.publicBucket.message}</p> : null}
            </div>
          ) : null}
          <FileUploadField
            label="Hero image"
            entityKind="package"
            purpose="hero"
            entityId={row?._id}
            currentUrl={values.publicHeroImageUrl}
            urlValue={values.publicHeroImageUrl}
            onUploaded={(url) => setField("publicHeroImageUrl", url)}
            onUrlChange={(url) => setField("publicHeroImageUrl", url)}
            onClear={() => setField("publicHeroImageUrl", "")}
            helperText="Upload an image or paste an https URL."
            cropAspect={HERO_LANDSCAPE_ASPECT_RATIO}
            cropTitle="Crop hero image"
          />
          <TextFormField name="publicSlug" label="Optional public slug" placeholder="e.g. basic-foh-package" />
        </SheetSection>

        <DetailSheetFooter
          start={
            row ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                disabled={saving || deleting}
                onClick={async () => {
                  setDeleting(true);
                  try {
                    await onDelete(row);
                  } finally {
                    setDeleting(false);
                  }
                }}
              >
                <TrashIcon />
                Delete package
              </Button>
            ) : undefined
          }
        >
          {form.saveError ? (
            <span className="max-w-48 text-xs text-destructive" role="alert">
              {form.saveError}
            </span>
          ) : null}
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || (row !== null && !isDirty)}>
            {saving ? "Saving…" : row ? "Save changes" : "Create package"}
          </Button>
        </DetailSheetFooter>
      </form>
    </Form>
  );
}
