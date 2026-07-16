"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect } from "react";
import { useMutation } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { EMPTY_LEXICAL_STATE } from "@/components/editor/lexical-theme";
import { VenueDocumentUploadButton } from "@/components/files/file-upload-field";
import { FormSaveBar } from "@/components/forms";
import { TextFormField } from "@/components/forms/text-form-field";
import { TextareaFormField } from "@/components/forms/textarea-form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConvexForm } from "@/hooks/use-convex-form";
import {
  emptyVenueForm,
  isEmptyLexicalJson,
  venueSchema,
  venueTypesForKind,
  VENUE_KINDS,
  type VenueFormValues,
  type VenueKind,
} from "@/lib/validations/venues";

const LexicalEditor = dynamic(
  () => import("@/components/editor/lexical-editor").then((m) => m.LexicalEditor),
  { ssr: false },
);

type VenueRow = {
  _id: Id<"venues">;
  name: string;
  path: string;
  parentId?: Id<"venues">;
};

function normalizeCapacity(value: VenueFormValues["capacity"]): number | undefined {
  if (value === "" || value === undefined || Number.isNaN(value as number)) return undefined;
  return typeof value === "number" ? value : undefined;
}

export function VenueEditor({
  editingId,
  initial,
  venues,
  onCancel,
  onSaved,
}: {
  editingId: Id<"venues"> | null;
  initial: VenueFormValues;
  venues: VenueRow[];
  onCancel: () => void;
  onSaved: (savedId?: Id<"venues">) => void;
}) {
  const createVenue = useMutation(api.venues.create);
  const updateVenue = useMutation(api.venues.update);

  const form = useConvexForm<VenueFormValues>({
    schema: venueSchema,
    defaultValues: {
      ...initial,
      notesJson: initial.notesJson || EMPTY_LEXICAL_STATE,
    },
    mode: "onChange",
  });

  useEffect(() => {
    if (form.formState.isDirty) return;
    form.reset({
      ...initial,
      notesJson: initial.notesJson || EMPTY_LEXICAL_STATE,
    });
  }, [initial, form]);

  const kind = form.watch("kind") as VenueKind;
  const nicknames = form.watch("nicknames");
  const circuits = form.watch("circuits");
  const documentationLinks = form.watch("documentationLinks");
  const files = form.watch("files");

  const persist = useCallback(
    async (values: VenueFormValues) => {
      const notesFromForm = form.getValues("notesJson") || values.notesJson;
      const notesJson = isEmptyLexicalJson(notesFromForm) ? undefined : notesFromForm?.trim();

      const payload = {
        name: values.name,
        nicknames: values.nicknames.map((n) => n.trim()).filter(Boolean),
        parentId: values.parentId ? (values.parentId as Id<"venues">) : undefined,
        kind: values.kind,
        venueType: values.venueType,
        capacity: normalizeCapacity(values.capacity),
        address: values.address?.trim() || undefined,
        googleMapsUrl: values.googleMapsUrl?.trim() || undefined,
        notesJson,
        circuits: values.circuits
          .filter((c) => c.label.trim())
          .map((c) => ({
            label: c.label.trim(),
            voltage: c.voltage || 120,
            amperage: c.amperage || 20,
          })),
        documentationLinks: values.documentationLinks
          .filter((l) => l.url.trim())
          .map((l) => ({
            title: l.title.trim() || "Link",
            url: l.url.trim(),
          })),
        files: values.files.filter((f) => f.r2Key.trim()),
        contactName: values.contactName?.trim() || undefined,
        contactEmail: values.contactEmail?.trim() || undefined,
        contactPhone: values.contactPhone?.trim() || undefined,
      };

      if (editingId) {
        await updateVenue({
          id: editingId,
          ...payload,
          parentId: values.parentId ? (values.parentId as Id<"venues">) : null,
        });
        form.reset({
          ...values,
          notesJson: notesJson || EMPTY_LEXICAL_STATE,
        });
        onSaved(editingId);
      } else {
        const createdId = await createVenue(payload);
        form.reset(emptyVenueForm());
        onSaved(createdId);
      }
    },
    [createVenue, editingId, form, onSaved, updateVenue],
  );

  const runSave = useCallback(() => {
    void form.handleSubmit((values) => form.runMutation(() => persist(values)))();
  }, [form, persist]);

  const tier = editingId ? "C" : "C";

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Edit Venue" : "Create Venue"}</CardTitle>
        </CardHeader>
        <CardContent className="max-h-[80vh] space-y-4 overflow-auto">
          <Form {...form}>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                runSave();
              }}
              className="space-y-4"
            >
              <TextFormField name="name" label="Name" />

              <div className="space-y-2">
                <Label>Nicknames</Label>
                <div className="flex flex-wrap gap-2">
                  {nicknames.map((nickname, index) => (
                    <div key={`nick-${index}`} className="flex items-center gap-1">
                      <Input
                        value={nickname}
                        className="h-8 w-28"
                        onChange={(e) => {
                          const next = [...nicknames];
                          next[index] = e.target.value;
                          form.setValue("nicknames", next, { shouldDirty: true });
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          form.setValue(
                            "nicknames",
                            nicknames.filter((_, i) => i !== index),
                            { shouldDirty: true },
                          )
                        }
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      form.setValue("nicknames", [...nicknames, ""], { shouldDirty: true })
                    }
                  >
                    Add nickname
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>Kind</Label>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    value={kind}
                    onChange={(e) => {
                      const next = e.target.value as VenueKind;
                      form.setValue("kind", next, { shouldDirty: true });
                      form.setValue("venueType", venueTypesForKind(next)[0]!, {
                        shouldDirty: true,
                      });
                    }}
                  >
                    {VENUE_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Type</Label>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    value={form.watch("venueType")}
                    onChange={(e) =>
                      form.setValue("venueType", e.target.value, { shouldDirty: true })
                    }
                  >
                    {venueTypesForKind(kind).map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <Label>Parent</Label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={form.watch("parentId") ?? ""}
                  onChange={(e) =>
                    form.setValue("parentId", e.target.value, { shouldDirty: true })
                  }
                >
                  <option value="">No parent (top-level / selectable area)</option>
                  {venues
                    .filter((venue) => venue._id !== editingId)
                    .map((venue) => (
                      <option key={venue._id} value={venue._id}>
                        {venue.path}
                      </option>
                    ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Nest under a building, or clear parent to make this top-level.
                </p>
              </div>

              <TextFormField name="capacity" label="Capacity" type="number" />
              <TextareaFormField name="address" label="Address" />
              <TextFormField name="googleMapsUrl" label="Google Maps URL" />

              <div className="space-y-2">
                <Label>Circuits</Label>
                {circuits.map((circuit, index) => (
                  <div key={`circuit-${index}`} className="grid grid-cols-[1fr_70px_70px_auto] gap-1">
                    <Input
                      placeholder="Label"
                      value={circuit.label}
                      onChange={(e) => {
                        const next = [...circuits];
                        next[index] = { ...next[index]!, label: e.target.value };
                        form.setValue("circuits", next, { shouldDirty: true });
                      }}
                    />
                    <Input
                      type="number"
                      placeholder="V"
                      value={circuit.voltage}
                      onChange={(e) => {
                        const next = [...circuits];
                        next[index] = {
                          ...next[index]!,
                          voltage: Number(e.target.value) || 120,
                        };
                        form.setValue("circuits", next, { shouldDirty: true });
                      }}
                    />
                    <Input
                      type="number"
                      placeholder="A"
                      value={circuit.amperage}
                      onChange={(e) => {
                        const next = [...circuits];
                        next[index] = {
                          ...next[index]!,
                          amperage: Number(e.target.value) || 20,
                        };
                        form.setValue("circuits", next, { shouldDirty: true });
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        form.setValue(
                          "circuits",
                          circuits.filter((_, i) => i !== index),
                          { shouldDirty: true },
                        )
                      }
                    >
                      ×
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    form.setValue(
                      "circuits",
                      [...circuits, { label: "", voltage: 120, amperage: 20 }],
                      { shouldDirty: true },
                    )
                  }
                >
                  Add circuit
                </Button>
              </div>

              <div className="grid gap-2">
                <TextFormField name="contactName" label="Contact name" />
                <TextFormField name="contactEmail" label="Contact email" />
                <TextFormField name="contactPhone" label="Contact phone" />
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <LexicalEditor
                  editorKey={editingId ?? "new-venue"}
                  contentJson={form.watch("notesJson") || EMPTY_LEXICAL_STATE}
                  onChange={(notesJson) => {
                    form.setValue("notesJson", notesJson, {
                      shouldDirty: true,
                      shouldTouch: true,
                    });
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label>Documentation links</Label>
                {documentationLinks.map((link, index) => (
                  <div key={`link-${index}`} className="grid grid-cols-[1fr_1fr_auto] gap-1">
                    <Input
                      placeholder="Title"
                      value={link.title}
                      onChange={(e) => {
                        const next = [...documentationLinks];
                        next[index] = { ...next[index]!, title: e.target.value };
                        form.setValue("documentationLinks", next, { shouldDirty: true });
                      }}
                    />
                    <Input
                      placeholder="URL"
                      value={link.url}
                      onChange={(e) => {
                        const next = [...documentationLinks];
                        next[index] = { ...next[index]!, url: e.target.value };
                        form.setValue("documentationLinks", next, { shouldDirty: true });
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        form.setValue(
                          "documentationLinks",
                          documentationLinks.filter((_, i) => i !== index),
                          { shouldDirty: true },
                        )
                      }
                    >
                      ×
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    form.setValue(
                      "documentationLinks",
                      [...documentationLinks, { title: "", url: "" }],
                      { shouldDirty: true },
                    )
                  }
                >
                  Add link
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Files (VWX, PDF, etc.)</Label>
                {files.map((file, index) => (
                  <div
                    key={`file-${index}`}
                    className="flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-sm"
                  >
                    <span className="truncate">{file.title || file.fileName}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        form.setValue(
                          "files",
                          files.filter((_, i) => i !== index),
                          { shouldDirty: true },
                        )
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                <VenueDocumentUploadButton
                  venueId={editingId ?? undefined}
                  onUploaded={(uploaded) =>
                    form.setValue(
                      "files",
                      [
                        ...files,
                        {
                          title: uploaded.title,
                          r2Key: uploaded.r2Key,
                          fileName: uploaded.fileName,
                          contentType: uploaded.contentType,
                        },
                      ],
                      { shouldDirty: true },
                    )
                  }
                />
              </div>

              {!editingId ? (
                <Button type="submit" disabled={form.saveStatus === "saving"}>
                  Create
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={onCancel}>
                  Cancel
                </Button>
              )}
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
        onSave={runSave}
        onDiscard={() => {
          form.reset({
            ...initial,
            notesJson: initial.notesJson || EMPTY_LEXICAL_STATE,
          });
          onCancel();
        }}
        onRetry={runSave}
      />
    </>
  );
}
