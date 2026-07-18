"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, type ReactNode } from "react";
import { useMutation } from "convex/react";
import { CaretDownIcon } from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { EMPTY_LEXICAL_STATE } from "@/components/editor/lexical-theme";
import { VenueDocumentUploadButton } from "@/components/files/file-upload-field";
import { StoredAssetLink } from "@/components/files/stored-asset-image";
import { FormSaveBar } from "@/components/forms";
import { TextFormField } from "@/components/forms/text-form-field";
import { TextareaFormField } from "@/components/forms/textarea-form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConvexForm } from "@/hooks/use-convex-form";
import {
  emptyVenueForm,
  formatVenueKindLabel,
  isEmptyLexicalJson,
  resolveClientInheritedVenueFields,
  venueFormHasOwnAddress,
  venueFormHasOwnContact,
  venueFormHasOwnFiles,
  venueFormHasOwnLinks,
  venueFormHasOwnMapsUrl,
  venueSchema,
  venueTypesForKind,
  VENUE_KINDS,
  type VenueFormValues,
  type VenueInheritableRow,
  type VenueKind,
} from "@/lib/validations/venues";

const LexicalEditor = dynamic(
  () => import("@/components/editor/lexical-editor").then((m) => m.LexicalEditor),
  { ssr: false },
);

function InheritedFrom({ path }: { path: string }) {
  return (
    <p className="text-xs text-muted-foreground">
      From <span className="font-medium text-foreground/80">{path}</span>
    </p>
  );
}

function OverrideCollapsible({
  label,
  defaultOpen,
  children,
}: {
  label: string;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="rounded-md border">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium"
        >
          <span>{label}</span>
          <CaretDownIcon className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-2 border-t px-3 py-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function DocumentationLinksEditor({
  documentationLinks,
  onChange,
}: {
  documentationLinks: VenueFormValues["documentationLinks"];
  onChange: (next: VenueFormValues["documentationLinks"]) => void;
}) {
  return (
    <div className="space-y-2">
      {documentationLinks.map((link, index) => (
        <div key={`link-${index}`} className="grid grid-cols-[1fr_1fr_auto] gap-1">
          <Input
            placeholder="Title"
            value={link.title}
            onChange={(e) => {
              const next = [...documentationLinks];
              next[index] = { ...next[index]!, title: e.target.value };
              onChange(next);
            }}
          />
          <Input
            placeholder="URL"
            value={link.url}
            onChange={(e) => {
              const next = [...documentationLinks];
              next[index] = { ...next[index]!, url: e.target.value };
              onChange(next);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange(documentationLinks.filter((_, i) => i !== index))}
          >
            ×
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...documentationLinks, { title: "", url: "" }])}
      >
        Add link
      </Button>
    </div>
  );
}

function VenueFilesEditor({
  files,
  venueId,
  onChange,
}: {
  files: VenueFormValues["files"];
  venueId?: Id<"venues">;
  onChange: (next: VenueFormValues["files"]) => void;
}) {
  return (
    <div className="space-y-2">
      {files.map((file, index) => (
        <div
          key={`file-${index}`}
          className="flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-sm"
        >
          <StoredAssetLink
            storedValue={file.r2Key}
            className="truncate text-primary underline underline-offset-2"
          >
            {file.title || file.fileName}
          </StoredAssetLink>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange(files.filter((_, i) => i !== index))}
          >
            Remove
          </Button>
        </div>
      ))}
      <VenueDocumentUploadButton
        venueId={venueId}
        onUploaded={(uploaded) =>
          onChange([
            ...files,
            {
              title: uploaded.title,
              r2Key: uploaded.r2Key,
              fileName: uploaded.fileName,
              contentType: uploaded.contentType,
            },
          ])
        }
      />
    </div>
  );
}

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
  venues: VenueInheritableRow[];
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
  const parentId = form.watch("parentId");
  const nicknames = form.watch("nicknames");
  const circuits = form.watch("circuits");
  const documentationLinks = form.watch("documentationLinks");
  const files = form.watch("files");
  const contactName = form.watch("contactName");
  const contactEmail = form.watch("contactEmail");
  const contactPhone = form.watch("contactPhone");
  const address = form.watch("address");
  const googleMapsUrl = form.watch("googleMapsUrl");

  const inherited = useMemo(
    () =>
      resolveClientInheritedVenueFields(
        venues,
        parentId && parentId !== editingId ? parentId : undefined,
      ),
    [venues, parentId, editingId],
  );

  const hasOwnLocation =
    venueFormHasOwnAddress({ address }) || venueFormHasOwnMapsUrl({ googleMapsUrl });
  const hasOwnContact = venueFormHasOwnContact({
    contactName,
    contactEmail,
    contactPhone,
  });
  const hasOwnLinks = venueFormHasOwnLinks({ documentationLinks });
  const hasOwnFiles = venueFormHasOwnFiles({ files });

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
                        {formatVenueKindLabel(k)}
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

              <div className="space-y-2">
                <Label>Location</Label>
                {(inherited.address || inherited.googleMapsUrl) && (
                  <div className="space-y-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                    {inherited.address ? (
                      <div className="space-y-1">
                        <InheritedFrom path={inherited.address.source.path} />
                        <p className="whitespace-pre-wrap">{inherited.address.value}</p>
                      </div>
                    ) : null}
                    {inherited.googleMapsUrl ? (
                      <div className="space-y-1">
                        {!inherited.address ||
                        inherited.address.source.path !==
                          inherited.googleMapsUrl.source.path ? (
                          <InheritedFrom path={inherited.googleMapsUrl.source.path} />
                        ) : null}
                        <a
                          href={inherited.googleMapsUrl.value}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary underline underline-offset-2"
                        >
                          Open in Google Maps
                        </a>
                      </div>
                    ) : null}
                  </div>
                )}
                {inherited.address || inherited.googleMapsUrl ? (
                  <OverrideCollapsible
                    label="Add location for this space"
                    defaultOpen={hasOwnLocation}
                  >
                    <TextareaFormField name="address" label="Address" />
                    <TextFormField name="googleMapsUrl" label="Google Maps URL" />
                  </OverrideCollapsible>
                ) : (
                  <>
                    <TextareaFormField name="address" label="Address" />
                    <TextFormField name="googleMapsUrl" label="Google Maps URL" />
                  </>
                )}
              </div>

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

              <div className="space-y-2">
                <Label>Contact</Label>
                {inherited.contact ? (
                  <div className="space-y-1 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                    <InheritedFrom path={inherited.contact.source.path} />
                    {inherited.contact.contactName ? (
                      <p>{inherited.contact.contactName}</p>
                    ) : null}
                    {inherited.contact.contactEmail ? (
                      <a
                        href={`mailto:${inherited.contact.contactEmail}`}
                        className="block text-primary underline underline-offset-2"
                      >
                        {inherited.contact.contactEmail}
                      </a>
                    ) : null}
                    {inherited.contact.contactPhone ? (
                      <a
                        href={`tel:${inherited.contact.contactPhone}`}
                        className="block text-primary underline underline-offset-2"
                      >
                        {inherited.contact.contactPhone}
                      </a>
                    ) : null}
                  </div>
                ) : null}
                {inherited.contact ? (
                  <OverrideCollapsible
                    label="Add additional contact for this space"
                    defaultOpen={hasOwnContact}
                  >
                    <TextFormField name="contactName" label="Contact name" />
                    <TextFormField name="contactEmail" label="Contact email" />
                    <TextFormField name="contactPhone" label="Contact phone" />
                  </OverrideCollapsible>
                ) : (
                  <div className="grid gap-2">
                    <TextFormField name="contactName" label="Contact name" />
                    <TextFormField name="contactEmail" label="Contact email" />
                    <TextFormField name="contactPhone" label="Contact phone" />
                  </div>
                )}
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
                {inherited.documentationLinks.length > 0 ? (
                  <ul className="space-y-1 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                    {inherited.documentationLinks.map((link, index) => (
                      <li key={`inh-link-${link.url}-${index}`} className="space-y-0.5">
                        <InheritedFrom path={link.source.path} />
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary underline underline-offset-2"
                        >
                          {link.title || link.url}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {inherited.documentationLinks.length > 0 ? (
                  <OverrideCollapsible
                    label="Add links for this space"
                    defaultOpen={hasOwnLinks}
                  >
                    <DocumentationLinksEditor
                      documentationLinks={documentationLinks}
                      onChange={(next) =>
                        form.setValue("documentationLinks", next, { shouldDirty: true })
                      }
                    />
                  </OverrideCollapsible>
                ) : (
                  <DocumentationLinksEditor
                    documentationLinks={documentationLinks}
                    onChange={(next) =>
                      form.setValue("documentationLinks", next, { shouldDirty: true })
                    }
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label>Files (VWX, PDF, etc.)</Label>
                {inherited.files.length > 0 ? (
                  <ul className="space-y-1 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                    {inherited.files.map((file, index) => (
                      <li key={`inh-file-${file.r2Key}-${index}`} className="space-y-0.5">
                        <InheritedFrom path={file.source.path} />
                        <StoredAssetLink
                          storedValue={file.r2Key}
                          className="text-primary underline underline-offset-2"
                        >
                          {file.title || file.fileName}
                        </StoredAssetLink>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {inherited.files.length > 0 ? (
                  <OverrideCollapsible
                    label="Add files for this space"
                    defaultOpen={hasOwnFiles}
                  >
                    <VenueFilesEditor
                      files={files}
                      venueId={editingId ?? undefined}
                      onChange={(next) => form.setValue("files", next, { shouldDirty: true })}
                    />
                  </OverrideCollapsible>
                ) : (
                  <VenueFilesEditor
                    files={files}
                    venueId={editingId ?? undefined}
                    onChange={(next) => form.setValue("files", next, { shouldDirty: true })}
                  />
                )}
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
