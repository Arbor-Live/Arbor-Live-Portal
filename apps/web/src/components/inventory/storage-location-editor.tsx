"use client";

import { useEffect } from "react";
import { useMutation } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { FormSaveBar } from "@/components/forms";
import { Form } from "@/components/ui/form";
import { TextFormField } from "@/components/forms/text-form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConvexForm } from "@/hooks/use-convex-form";
import {
  storageLocationSchema,
  type StorageLocationFormValues,
} from "@/lib/validations/inventory";

type LocationRow = {
  _id: Id<"storageLocations">;
  name: string;
  path: string;
  parentId?: Id<"storageLocations">;
};

export function StorageLocationEditor({
  editingId,
  initial,
  locations,
  onCancel,
  onSaved,
}: {
  editingId: Id<"storageLocations"> | null;
  initial: StorageLocationFormValues;
  locations: LocationRow[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const createLocation = useMutation(api.storageLocations.create);
  const updateLocation = useMutation(api.storageLocations.update);

  const form = useConvexForm<StorageLocationFormValues>({
    schema: storageLocationSchema,
    defaultValues: initial,
    mode: "onChange",
  });

  useEffect(() => {
    if (form.formState.isDirty) return;
    form.reset(initial);
  }, [initial, form]);

  const persist = async (values: StorageLocationFormValues) => {
    const payload = {
      name: values.name,
      parentId: values.parentId ? (values.parentId as Id<"storageLocations">) : undefined,
    };
    if (editingId) {
      await updateLocation({ id: editingId, ...payload });
    } else {
      await createLocation(payload);
    }
    onSaved();
    if (!editingId) form.reset({ name: "", parentId: "" });
  };

  const tier = editingId ? "C" : "C";

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Edit Location" : "Create Location"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((values) => form.runMutation(() => persist(values)))}
              className="space-y-3"
            >
              <TextFormField name="name" label="Name" />
              <div className="space-y-2">
                <label className="text-sm font-medium">Parent</label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={form.watch("parentId") ?? ""}
                  onChange={(e) =>
                    form.setValue("parentId", e.target.value, { shouldDirty: true })
                  }
                >
                  <option value="">No Parent</option>
                  {locations
                    .filter((location) => location._id !== editingId)
                    .map((location) => (
                      <option key={location._id} value={location._id}>
                        {location.path}
                      </option>
                    ))}
                </select>
              </div>
              {tier === "C" ? (
                <Button type="submit" disabled={form.saveStatus === "saving"}>
                  Create
                </Button>
              ) : null}
              {editingId ? (
                <Button type="button" variant="outline" onClick={onCancel}>
                  Cancel
                </Button>
              ) : null}
            </form>
          </Form>
        </CardContent>
      </Card>

      <FormSaveBar
        tier={tier}
        saveStatus={form.saveStatus}
        saveError={form.saveError}
        isDirty={form.formState.isDirty}
        saveLabel={editingId ? "Save" : "Create"}
        onSave={() => void form.handleSubmit((values) => form.runMutation(() => persist(values)))()}
        onDiscard={() => {
          form.reset(initial);
          onCancel();
        }}
        onRetry={() => void form.handleSubmit((values) => form.runMutation(() => persist(values)))()}
      />
    </>
  );
}
