"use client";

import { useMemo, type ReactNode } from "react";
import { useMutation } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { TextFormField } from "@/components/forms/text-form-field";
import { DetailSheetFooter, SheetSection } from "@/components/list-page";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { useConvexForm } from "@/hooks/use-convex-form";
import { storageLocationSchema, type StorageLocationFormValues } from "@/lib/validations/inventory";
import { SearchableSelect } from "./searchable-select";

export type StorageLocationRow = {
  _id: Id<"storageLocations">;
  name: string;
  path: string;
  parentId?: Id<"storageLocations">;
};

const TOP_LEVEL_LABEL = "Nothing (top level)";

/**
 * The storage location side panel's form: its name and what it sits inside.
 * Render it keyed on the location (or `new-<parentId>`) so the draft resets
 * when another one opens. Calls `onSaved` only after the write lands, so a
 * failed save leaves the panel open with the error in the footer.
 */
export function StorageLocationEditor({
  editingId,
  initial,
  locations,
  onCancel,
  onSaved,
  footerStart,
}: {
  editingId: Id<"storageLocations"> | null;
  initial: StorageLocationFormValues;
  locations: StorageLocationRow[];
  onCancel: () => void;
  onSaved: (name: string) => void;
  /** Left side of the panel footer: destructive and secondary actions. */
  footerStart?: ReactNode;
}) {
  const createLocation = useMutation(api.storageLocations.create);
  const updateLocation = useMutation(api.storageLocations.update);

  const form = useConvexForm<StorageLocationFormValues>({
    schema: storageLocationSchema,
    defaultValues: initial,
    mode: "onChange",
  });

  // A location can't sit inside itself or anything inside it.
  const parentOptions = useMemo(() => {
    const editing = editingId ? locations.find((location) => location._id === editingId) : undefined;
    return [
      { value: "", label: TOP_LEVEL_LABEL },
      ...locations
        .filter(
          (location) =>
            !editing || (location._id !== editing._id && !location.path.startsWith(`${editing.path} > `)),
        )
        .sort((a, b) => a.path.localeCompare(b.path))
        .map((location) => ({ value: location._id, label: location.path })),
    ];
  }, [editingId, locations]);

  async function persist(values: StorageLocationFormValues) {
    const name = values.name.trim();
    if (!name) throw new Error("Give the location a name.");
    const parentId = values.parentId ? (values.parentId as Id<"storageLocations">) : undefined;
    if (editingId) await updateLocation({ id: editingId, name, parentId });
    else await createLocation({ name, parentId });
    form.reset({ name, parentId: values.parentId ?? "" });
    onSaved(name);
  }

  const saving = form.saveStatus === "saving";

  return (
    <Form {...form}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit((values) => form.runMutation(() => persist(values)))();
        }}
        className="flex min-h-full flex-col"
        data-testid="storage-location-form"
      >
        <SheetSection title="Location">
          <TextFormField name="name" label="Name" placeholder="e.g. Shelf B" autoFocus={!editingId} />
          <div className="space-y-2">
            <Label htmlFor="storage-location-parent">Inside</Label>
            <SearchableSelect
              id="storage-location-parent"
              value={form.watch("parentId") ?? ""}
              onChange={(value) => form.setValue("parentId", value, { shouldDirty: true })}
              options={parentOptions}
              placeholder="Search locations…"
              emptyLabel={TOP_LEVEL_LABEL}
            />
            <p className="text-xs text-muted-foreground">
              Nest a shelf or bin under the room or van it&apos;s in. Its path updates everywhere, including the
              locations inside it.
            </p>
          </div>
        </SheetSection>

        <DetailSheetFooter start={footerStart}>
          {form.saveError ? (
            <span className="max-w-48 text-xs text-destructive" role="alert">
              {form.saveError}
            </span>
          ) : null}
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={saving || (Boolean(editingId) && !form.formState.isDirty)}>
            {saving ? "Saving…" : editingId ? "Save changes" : "Create location"}
          </Button>
        </DetailSheetFooter>
      </form>
    </Form>
  );
}
