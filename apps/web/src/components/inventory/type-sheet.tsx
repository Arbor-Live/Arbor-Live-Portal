"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { CaretDownIcon, PlusIcon, TrashIcon, XIcon } from "@phosphor-icons/react";
import { useAppDialog } from "@/components/ui/app-dialog";
import { FileUploadField, InventoryResourceUploadButton } from "@/components/files/file-upload-field";
import { TextFormField } from "@/components/forms/text-form-field";
import { TextareaFormField } from "@/components/forms/textarea-form-field";
import { StatusPill } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useConvexForm } from "@/hooks/use-convex-form";
import { api } from "@/lib/convex-api";
import { notify } from "@/lib/notify";
import { inventoryTypeSchema, type InventoryTypeFormValues } from "@/lib/validations/inventory";
import { formatTypeDisplay } from "./package-section-utils";
import { SearchableSelect } from "./searchable-select";
import {
  buildTypePayload,
  defaultTypeValues,
  formatUnitCount,
  emptyResourceRow,
  toTypeFormValues,
  TYPE_VISIBILITY_LABELS,
  TYPE_VISIBILITY_TONES,
  typeVisibility,
  type InventoryTypeRow,
  type ResourceRow,
} from "./type-form";

type CapabilityOption = { _id: string; key: string; label: string };

/**
 * The type editor. `row: null` with `open` is a new type. Saves go straight
 * through the mutation; the panel closes only once the save succeeds.
 */
export function TypeSheet({
  open,
  row,
  unitCount,
  unitsTruncated = false,
  categoryOptions,
  capabilityOptions,
  onOpenChange,
  onDelete,
}: {
  open: boolean;
  row: InventoryTypeRow | null;
  unitCount?: number;
  unitsTruncated?: boolean;
  categoryOptions: ReadonlyArray<{ value: string; label: string }>;
  capabilityOptions: CapabilityOption[];
  onOpenChange: (open: boolean) => void;
  /** Resolves true once the type is deleted; false if cancelled or it failed. */
  onDelete: (row: InventoryTypeRow) => Promise<boolean>;
}) {
  const { confirm } = useAppDialog();
  const dirtyRef = useRef(false);

  async function requestClose() {
    if (dirtyRef.current) {
      const discard = await confirm({
        title: row ? `Discard your changes to ${row.name}?` : "Discard this new type?",
        description: "What you've typed in the panel will be lost. The saved type stays as it was.",
        destructive: true,
        confirmLabel: "Discard changes",
      });
      if (!discard) return;
    }
    dirtyRef.current = false;
    onOpenChange(false);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else void requestClose();
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg" data-testid="type-sheet">
        {open ? (
          // Keyed so the draft resets when another type opens.
          <TypeSheetBody
            key={row?._id ?? "new"}
            row={row}
            unitCount={unitCount}
            unitsTruncated={unitsTruncated}
            categoryOptions={categoryOptions}
            capabilityOptions={capabilityOptions}
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
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t px-4 py-4">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

function TypeSheetBody({
  row,
  unitCount,
  unitsTruncated = false,
  categoryOptions,
  capabilityOptions,
  onDirtyChange,
  onSaved,
  onCancel,
  onDelete,
}: {
  row: InventoryTypeRow | null;
  unitCount?: number;
  unitsTruncated?: boolean;
  categoryOptions: ReadonlyArray<{ value: string; label: string }>;
  capabilityOptions: CapabilityOption[];
  onDirtyChange: (dirty: boolean) => void;
  onSaved: () => void;
  onCancel: () => void;
  onDelete: (row: InventoryTypeRow) => Promise<boolean>;
}) {
  const createType = useMutation(api.inventoryTypes.create);
  const updateType = useMutation(api.inventoryTypes.update);
  const [deleting, setDeleting] = useState(false);

  const form = useConvexForm<InventoryTypeFormValues>({
    schema: inventoryTypeSchema,
    defaultValues: row ? toTypeFormValues(row) : defaultTypeValues,
    mode: "onTouched",
  });
  const isDirty = form.formState.isDirty;
  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  const values = form.watch();
  const setField = <K extends keyof InventoryTypeFormValues>(key: K, value: InventoryTypeFormValues[K]) => {
    form.setValue(key, value as never, { shouldDirty: true });
  };

  const onSubmit = form.submitMutation(
    async (submitted: InventoryTypeFormValues) => {
      const payload = buildTypePayload(submitted, row ?? undefined);
      if (row) await updateType({ id: row._id, ...payload });
      else await createType(payload);
    },
    {
      onSuccess: () => {
        notify.success(row ? `Saved ${form.getValues("name")}` : `Created ${form.getValues("name")}`);
        onSaved();
      },
    },
  );

  const saving = form.saveStatus === "saving";
  const visibility = row ? typeVisibility(row) : null;
  const entityId = row?._id;

  return (
    <Form {...form}>
      <form
        className="flex min-h-full flex-col"
        onSubmit={form.handleSubmit(onSubmit)}
        data-testid="type-form"
      >
        <SheetHeader>
          <SheetTitle className="flex flex-wrap items-center gap-2 pr-8">
            {row ? formatTypeDisplay(row) : "New type"}
            {visibility ? (
              <StatusPill tone={TYPE_VISIBILITY_TONES[visibility]} className="h-6">
                {TYPE_VISIBILITY_LABELS[visibility]}
              </StatusPill>
            ) : null}
          </SheetTitle>
          <SheetDescription>
            {row
              ? `${unitCount === undefined ? "Counting units…" : `${formatUnitCount(unitCount, unitsTruncated)} in inventory`}. Changes apply to every unit, package line and pull list that uses this type.`
              : "A model of gear. Add units of it from Items once it exists."}
          </SheetDescription>
        </SheetHeader>

        <Section title="Details">
          <TextFormField name="name" label="Name" />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextFormField name="model" label="Model" />
            <TextFormField name="manufacturer" label="Manufacturer" />
          </div>
          <div className="space-y-2" data-testid="type-category-field">
            <Label>Category</Label>
            <SearchableSelect
              value={values.category}
              onChange={(next) => setField("category", next)}
              options={categoryOptions.map((category) => ({ value: category.value, label: category.label }))}
              placeholder="Search categories..."
              emptyLabel="Select category"
            />
          </div>
          <TextareaFormField
            name="description"
            label="Description"
            placeholder="Supports Markdown (headings, lists, links, …)"
          />
          <p className="-mt-2 text-xs text-muted-foreground">
            Shown on the public model pages when the type is listed.
          </p>
        </Section>

        <Section title="Pricing">
          <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
            <TextFormField name="msrpUsd" label="MSRP (USD)" type="number" />
            <TextFormField name="subsidizedRentalPriceUsd" label="Subsidized (5%) USD" type="number" />
            <TextFormField name="nonSubsidizedRentalPriceUsd" label="Normal (10%) USD" type="number" />
          </div>
          <p className="text-xs text-muted-foreground">
            Leave a rate blank and it&apos;s worked out from the MSRP (5% subsidized, 10% normal).
          </p>
        </Section>

        <Section title="Capabilities">
          <CapabilityPicker
            value={values.capabilities}
            onChange={(next) => setField("capabilities", next)}
            options={capabilityOptions}
          />
        </Section>

        <Section title="Resources">
          <ResourceLinksField
            idPrefix="type-manual"
            label="Manuals and documentation"
            hint="A title and URL for each link (e.g. Manual, DMX reference)."
            rows={values.manualResources}
            onChange={(next) => setField("manualResources", next)}
            upload={{ purpose: "manual", entityId }}
          />
          {values.category === "lighting" ? (
            <ResourceLinksField
              idPrefix="type-gdtf"
              label="GDTF and fixture links"
              hint="A title and URL for each GDTF or fixture library link."
              rows={values.lightingGdtfResources}
              onChange={(next) => setField("lightingGdtfResources", next)}
              upload={{ purpose: "gdtf", entityId }}
            />
          ) : null}
        </Section>

        <Section title="Public page">
          <p className="text-xs text-muted-foreground">
            Listed types appear on the public browse pages, grouped by their category&apos;s public bucket. The
            full profile also shows manuals, GDTF links, tips and images (including on Lost &amp; Found pages).
          </p>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="type-public-listing">List publicly</Label>
            <Switch
              id="type-public-listing"
              checked={values.publicListing}
              onCheckedChange={(checked) => setField("publicListing", checked)}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="type-public-profile">Share full public profile</Label>
            <Switch
              id="type-public-profile"
              checked={values.publicProfile}
              onCheckedChange={(checked) => setField("publicProfile", checked)}
            />
          </div>
          <TextFormField
            name="publicSlug"
            label="Public slug (optional, for direct links)"
            placeholder="e.g. clay-paky-mythos2"
            description="Lowercase letters and numbers, with dashes."
          />
          <TextareaFormField name="tips" label="Tips" placeholder="Supports Markdown" />
          <p className="-mt-2 text-xs text-muted-foreground">Shown only with the full public profile.</p>
          <FileUploadField
            label="Icon image"
            entityKind="type"
            purpose="icon"
            entityId={entityId}
            currentUrl={values.iconImageUrl}
            urlValue={values.iconImageUrl}
            onUploaded={(url) => setField("iconImageUrl", url)}
            onUrlChange={(url) => setField("iconImageUrl", url)}
            onClear={() => setField("iconImageUrl", "")}
            helperText="Small icon shown on public equipment pages."
          />
          <FileUploadField
            label="Promo image"
            entityKind="type"
            purpose="promo"
            entityId={entityId}
            currentUrl={values.promoImageUrl}
            urlValue={values.promoImageUrl}
            onUploaded={(url) => setField("promoImageUrl", url)}
            onUrlChange={(url) => setField("promoImageUrl", url)}
            onClear={() => setField("promoImageUrl", "")}
            helperText="Larger marketing image for public type profiles."
          />
        </Section>

        <SheetFooter className="sticky bottom-0 flex-row flex-wrap items-center justify-between border-t bg-popover">
          {row ? (
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
              Delete type
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {form.saveError ? (
              <span className="max-w-48 text-xs text-destructive" role="alert">
                {form.saveError}
              </span>
            ) : null}
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || (row !== null && !isDirty)}>
              {saving ? "Saving…" : row ? "Save changes" : "Create type"}
            </Button>
          </div>
        </SheetFooter>
      </form>
    </Form>
  );
}

function CapabilityPicker({
  value,
  onChange,
  options,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  options: CapabilityOption[];
}) {
  const [query, setQuery] = useState("");
  const labels = useMemo(() => new Map(options.map((option) => [option.key, option.label])), [options]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter(
      (option) => option.key.toLowerCase().includes(needle) || option.label.toLowerCase().includes(needle),
    );
  }, [options, query]);

  return (
    <div className="space-y-2">
      <Popover onOpenChange={(open) => (open ? undefined : setQuery(""))}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between font-normal"
            data-testid="type-capability-picker"
          >
            {value.length ? `${value.length} selected` : "Select capabilities"}
            <CaretDownIcon className="size-3.5 opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-64">
          <Input
            placeholder="Search capabilities..."
            aria-label="Search capabilities"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="max-h-56 space-y-0.5 overflow-auto">
            {filtered.map((option) => {
              const id = `type-capability-${option._id}`;
              return (
                <div key={option._id} className="flex items-center gap-2 px-1 py-1 text-sm hover:bg-muted">
                  <Checkbox
                    id={id}
                    checked={value.includes(option.key)}
                    onCheckedChange={(checked) =>
                      onChange(
                        checked === true
                          ? [...value, option.key]
                          : value.filter((entry) => entry !== option.key),
                      )
                    }
                  />
                  <Label htmlFor={id} className="flex-1 cursor-pointer font-normal">
                    {option.label}
                    <span className="text-xs text-muted-foreground">{option.key}</span>
                  </Label>
                </div>
              );
            })}
            {!filtered.length ? (
              <p className="px-1 py-1 text-xs text-muted-foreground">
                No capabilities found. Add keys in Settings.
              </p>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
      {value.length ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((key) => (
            <span key={key} className="inline-flex items-center gap-1.5 border px-2 py-0.5 text-xs">
              {labels.get(key) ?? key}
              <button
                type="button"
                aria-label={`Remove ${labels.get(key) ?? key}`}
                className="text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => onChange(value.filter((entry) => entry !== key))}
              >
                <XIcon className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">None yet. Capabilities power the capability filter and pull lists.</p>
      )}
    </div>
  );
}

function ResourceLinksField({
  idPrefix,
  label,
  hint,
  rows,
  onChange,
  upload,
}: {
  idPrefix: string;
  label: string;
  hint: string;
  rows: ResourceRow[];
  onChange: (rows: ResourceRow[]) => void;
  upload: { purpose: "manual" | "gdtf"; entityId?: string };
}) {
  const patch = (index: number, next: Partial<ResourceRow>) =>
    onChange(rows.map((current, i) => (i === index ? { ...current, ...next } : current)));

  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {rows.map((resource, index) => (
        <div key={`${idPrefix}-${index}`} className="flex flex-wrap items-center gap-2">
          <Input
            aria-label={`${label} ${index + 1} title`}
            placeholder="Title"
            className="w-full sm:w-36"
            value={resource.title}
            onChange={(event) => patch(index, { title: event.target.value })}
          />
          <Input
            aria-label={`${label} ${index + 1} URL`}
            placeholder="https://…"
            className="min-w-0 flex-1"
            value={resource.url}
            onChange={(event) => patch(index, { url: event.target.value })}
          />
          <InventoryResourceUploadButton
            entityKind="type"
            purpose={upload.purpose}
            entityId={upload.entityId}
            onUploaded={({ url, title }) => patch(index, { title: resource.title.trim() || title, url })}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${resource.title.trim() || `link ${index + 1}`}`}
            disabled={rows.length <= 1}
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          >
            <XIcon />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, emptyResourceRow()])}>
        <PlusIcon />
        Add link
      </Button>
    </div>
  );
}
