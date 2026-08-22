"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { normalizeAssetScanInput } from "@/lib/asset-scan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toCategoryOptions } from "./constants";
import { ContainsEditor } from "./contains-editor";
import {
  InventoryItemDetails,
  type ItemDetailsContainerOption,
} from "./inventory-item-details";
import { SearchableSelect } from "./searchable-select";

type WizardTag = {
  localId: string;
  assetId: string;
  serialNumber: string;
  storageLocationId: string;
  containedInAssetId: string;
  status: string;
  notes: string;
  contains: string[];
};

type PendingResolve = {
  tagLocalId: string;
  field: "containedIn" | "contains";
  raw: string;
};

type TypeDraft = {
  name: string;
  model: string;
  manufacturer: string;
  category: string;
  msrpUsd: string;
};

function emptyTag(from?: Pick<WizardTag, "storageLocationId" | "containedInAssetId">): WizardTag {
  return {
    localId: crypto.randomUUID(),
    assetId: "",
    serialNumber: "",
    storageLocationId: from?.storageLocationId ?? "",
    containedInAssetId: from?.containedInAssetId ?? "",
    status: "",
    notes: "",
    contains: [],
  };
}

function formatTypeDisplay(type: { name: string; model: string; manufacturer?: string }) {
  const maker = type.manufacturer?.trim();
  const sameNameModel = type.name.trim().toLowerCase() === type.model.trim().toLowerCase();
  const core = sameNameModel ? type.name : `${type.name} / ${type.model}`;
  return maker ? `${maker} ${core}` : core;
}

type CreateAssetWizardProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function CreateAssetWizardForm({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [typeId, setTypeId] = useState("");
  const [tags, setTags] = useState<WizardTag[]>(() => [emptyTag()]);
  const [creatingType, setCreatingType] = useState(false);
  const [typeDraft, setTypeDraft] = useState<TypeDraft>({
    name: "",
    model: "",
    manufacturer: "",
    category: "sound",
    msrpUsd: "",
  });
  const [typeDraftError, setTypeDraftError] = useState<string | null>(null);
  const [typeDraftBusy, setTypeDraftBusy] = useState(false);
  const [pendingResolve, setPendingResolve] = useState<PendingResolve | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const focusAssetLocalIdRef = useRef<string | null>(null);
  const serialInputRefs = useRef(new Map<string, HTMLInputElement>());
  const assetInputRefs = useRef(new Map<string, HTMLInputElement>());

  const categories = useQuery(api.inventoryCategories.list, { activeOnly: true });
  const types = useQuery(api.inventoryTypes.listOptions, {});
  const locations = useQuery(api.storageLocations.list, {});
  const itemSummaries = useQuery(api.inventoryItems.listSummaries, {});
  const resolveResult = useQuery(
    api.inventoryItems.resolveByScan,
    pendingResolve ? { raw: pendingResolve.raw } : "skip",
  );
  const createType = useMutation(api.inventoryTypes.create);
  const createMany = useMutation(api.inventoryItems.createMany);
  const ensureDefaultCategories = useMutation(api.inventoryCategories.ensureDefaults);

  useEffect(() => {
    // Seed built-in categories on first open so fake/test types can be created
    // without a manual "Ensure defaults" click on a fresh deployment.
    void ensureDefaultCategories({}).catch(() => {
      // Non-admin sessions skip seed; type create still auto-seeds server-side.
    });
  }, [ensureDefaultCategories]);

  useEffect(() => {
    if (!categories?.length) return;
    setTypeDraft((prev) => {
      if (categories.some((row) => row.key === prev.category)) return prev;
      return { ...prev, category: categories[0]!.key };
    });
  }, [categories]);

  const typeLabel = useMemo(() => {
    const type = types?.find((entry) => entry._id === typeId);
    return type ? formatTypeDisplay(type) : "";
  }, [typeId, types]);

  const categoryOptions = useMemo(() => toCategoryOptions(categories), [categories]);

  /** Sibling tags + existing items, as containment options keyed by assetId. */
  const containmentOptions = useMemo(() => {
    const options: ItemDetailsContainerOption[] = [];
    for (const tag of tags) {
      const id = tag.assetId.trim();
      if (id) options.push({ value: id, assetId: id, label: id });
    }
    for (const item of itemSummaries ?? []) {
      if (!item.assetId) continue;
      options.push({ value: item.assetId, assetId: item.assetId, label: item.assetId });
    }
    return options;
  }, [itemSummaries, tags]);

  const locationOptions = useMemo(
    () => (locations ?? []).map((location) => ({ value: location._id, label: location.path })),
    [locations],
  );

  function updateTag(localId: string, patch: Partial<WizardTag>) {
    setTags((prev) => prev.map((tag) => (tag.localId === localId ? { ...tag, ...patch } : tag)));
  }

  /** New card inherits storage location + contained-in from the previous one. */
  function addAnotherAsset(fromLocalId?: string) {
    const source =
      (fromLocalId ? tags.find((tag) => tag.localId === fromLocalId) : undefined) ??
      tags[tags.length - 1];
    const next = emptyTag(source);
    focusAssetLocalIdRef.current = next.localId;
    setTags((prev) => [...prev, next]);
  }

  function focusSerial(localId: string) {
    queueMicrotask(() => serialInputRefs.current.get(localId)?.focus());
  }

  useEffect(() => {
    const localId = focusAssetLocalIdRef.current;
    if (!localId) return;
    const el = assetInputRefs.current.get(localId);
    if (!el) return;
    el.focus();
    focusAssetLocalIdRef.current = null;
  }, [tags]);

  function addContains(localId: string, assetId: string) {
    setTags((prev) =>
      prev.map((tag) =>
        tag.localId === localId && !tag.contains.some((entry) => entry.toLowerCase() === assetId.toLowerCase())
          ? { ...tag, contains: [...tag.contains, assetId] }
          : tag,
      ),
    );
  }

  function matchKnownAssetId(raw: string): string | null {
    const normalized = normalizeAssetScanInput(raw);
    if (!normalized) return null;
    const key = normalized.toLowerCase();

    for (const tag of tags) {
      const id = normalizeAssetScanInput(tag.assetId) ?? tag.assetId.trim();
      if (id && id.toLowerCase() === key) return id;
    }
    for (const item of itemSummaries ?? []) {
      if ((item.assetId ?? "").toLowerCase() === key) return item.assetId ?? null;
    }
    return null;
  }

  function onScanAssetId(localId: string, raw: string) {
    const normalized = normalizeAssetScanInput(raw);
    if (!normalized) {
      setScanError(`Couldn’t read an asset ID from that scan. Try a tag like ALE-0123.`);
      return;
    }
    setScanError(null);
    updateTag(localId, { assetId: normalized });
  }

  function onScanSerial(localId: string, raw: string) {
    updateTag(localId, { serialNumber: raw.trim() });
  }

  function onScanContainedIn(localId: string, raw: string) {
    const known = matchKnownAssetId(raw);
    if (known) {
      setScanError(null);
      updateTag(localId, { containedInAssetId: known });
      return;
    }
    setScanError(null);
    setPendingResolve({ tagLocalId: localId, field: "containedIn", raw });
  }

  function onScanContains(localId: string, raw: string) {
    const known = matchKnownAssetId(raw);
    if (known) {
      addContains(localId, known);
      return;
    }
    setPendingResolve({ tagLocalId: localId, field: "contains", raw });
  }

  useEffect(() => {
    if (!pendingResolve) return;
    if (resolveResult === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- consume the one-shot scan resolution
      setScanError(`No item found for “${pendingResolve.raw}”. Type an existing asset tag or pick one.`);
      setPendingResolve(null);
      return;
    }
    if (resolveResult) {
      if (pendingResolve.field === "containedIn") {
        updateTag(pendingResolve.tagLocalId, { containedInAssetId: resolveResult.assetId });
      } else {
        addContains(pendingResolve.tagLocalId, resolveResult.assetId);
      }
      setPendingResolve(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the resolution result
  }, [resolveResult]);

  async function createNewType() {
    if (!typeDraft.name.trim() || !typeDraft.model.trim() || !typeDraft.category) {
      setTypeDraftError("Name, model, and category are required.");
      return;
    }
    setTypeDraftBusy(true);
    setTypeDraftError(null);
    try {
      const id = await createType({
        name: typeDraft.name.trim(),
        model: typeDraft.model.trim(),
        manufacturer: typeDraft.manufacturer.trim() || undefined,
        category: typeDraft.category,
        msrpUsd: typeDraft.msrpUsd === "" ? undefined : Number(typeDraft.msrpUsd),
      });
      setTypeId(id);
      setCreatingType(false);
      setTypeDraft({ name: "", model: "", manufacturer: "", category: "sound", msrpUsd: "" });
    } catch (error) {
      setTypeDraftError(getConvexErrorMessage(error, "Could not create the type."));
    } finally {
      setTypeDraftBusy(false);
    }
  }

  function tagAssetId(tag: WizardTag): string {
    return normalizeAssetScanInput(tag.assetId) ?? tag.assetId.trim();
  }

  function validateForSubmit(): string | null {
    if (!typeId) return "Choose or create a type first.";
    for (const tag of tags) {
      if (!tagAssetId(tag) && !tag.serialNumber.trim()) {
        return "Every asset needs an Asset ID or Serial Number.";
      }
    }
    const seen = new Set<string>();
    for (const tag of tags) {
      const id = tagAssetId(tag);
      if (!id) continue;
      const key = id.toLowerCase();
      if (seen.has(key)) return `Duplicate Asset ID in this batch: ${id}`;
      seen.add(key);
      if ((itemSummaries ?? []).some((item) => (item.assetId ?? "").toLowerCase() === key)) {
        return `Asset ID already exists: ${id}`;
      }
    }
    const known = new Set(seen);
    for (const item of itemSummaries ?? []) known.add((item.assetId ?? "").toLowerCase());
    for (const [index, tag] of tags.entries()) {
      const assetId = tagAssetId(tag);
      const label = assetId || tag.serialNumber.trim() || `Asset ${index + 1}`;
      const container =
        normalizeAssetScanInput(tag.containedInAssetId) ?? tag.containedInAssetId.trim();
      // Containment edges are keyed by tag, so untagged cards can't use them.
      if (!assetId && container) {
        return `“${label}” needs an Asset ID before it can be placed inside “${container}”.`;
      }
      if (!assetId && tag.contains.length > 0) {
        return `“${label}” needs an Asset ID before it can contain other assets.`;
      }
      if (container && !known.has(container.toLowerCase())) {
        return `“${assetId}” references a container (“${container}”) that isn't an asset in this batch or an existing item.`;
      }
      for (const child of tag.contains) {
        const childId = normalizeAssetScanInput(child) ?? child.trim();
        if (!known.has(childId.toLowerCase())) {
          return `“${assetId}” contains “${childId}”, which isn't an asset in this batch or an existing item.`;
        }
      }
      if (container && container.toLowerCase() === assetId.toLowerCase()) {
        return `“${assetId}” cannot be contained in itself.`;
      }
    }
    return null;
  }

  async function submit() {
    const error = validateForSubmit();
    if (error) {
      setSubmitError(error);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await createMany({
        typeId: typeId as Id<"inventoryTypes">,
        items: tags.map((tag) => ({
          assetId: tagAssetId(tag) || undefined,
          serialNumber: tag.serialNumber.trim() || undefined,
          storageLocationId: tag.storageLocationId
            ? (tag.storageLocationId as Id<"storageLocations">)
            : undefined,
          containedInAssetId:
            (normalizeAssetScanInput(tag.containedInAssetId) ?? tag.containedInAssetId.trim()) ||
            undefined,
          status: tag.status.trim() || undefined,
          notes: tag.notes.trim() || undefined,
          contains: tag.contains.length
            ? tag.contains.map(
                (entry) => normalizeAssetScanInput(entry) ?? entry.trim(),
              )
            : undefined,
        })),
      });
      onClose();
    } catch (err) {
      setSubmitError(getConvexErrorMessage(err, "Could not create the items."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <SheetHeader className="shrink-0 border-b pr-12">
        <SheetTitle>Create assets</SheetTitle>
        <SheetDescription>
          Step {step} of 3 ·{" "}
          {step === 1 ? "Brand & model" : step === 2 ? "Asset tags" : "Review & create"}
        </SheetDescription>
      </SheetHeader>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {step === 1 ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Brand & model</Label>
              {creatingType ? (
                <div className="space-y-3 rounded-none border p-3" data-testid="wizard-type-create">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Name</Label>
                      <Input
                        value={typeDraft.name}
                        onChange={(event) => setTypeDraft((prev) => ({ ...prev, name: event.target.value }))}
                        placeholder="e.g. Case, Mixer, Speaker"
                        autoFocus
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Manufacturer</Label>
                      <Input
                        value={typeDraft.manufacturer}
                        onChange={(event) => setTypeDraft((prev) => ({ ...prev, manufacturer: event.target.value }))}
                        placeholder="e.g. Shure"
                      />
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Model</Label>
                      <Input
                        value={typeDraft.model}
                        onChange={(event) => setTypeDraft((prev) => ({ ...prev, model: event.target.value }))}
                        placeholder="e.g. X32"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <SearchableSelect
                        value={typeDraft.category}
                        onChange={(category) => setTypeDraft((prev) => ({ ...prev, category }))}
                        options={categoryOptions.map((category) => ({
                          value: category.value,
                          label: category.label,
                        }))}
                        placeholder="Search categories..."
                        emptyLabel="Select category"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>MSRP (USD) — optional</Label>
                    <Input
                      type="number"
                      min={0}
                      value={typeDraft.msrpUsd}
                      onChange={(event) => setTypeDraft((prev) => ({ ...prev, msrpUsd: event.target.value }))}
                      placeholder="Rental prices derive from this (5% / 10%)"
                    />
                  </div>
                  {typeDraftError ? <p className="text-sm text-destructive">{typeDraftError}</p> : null}
                  <div className="flex gap-2">
                    <Button type="button" onClick={() => void createNewType()} disabled={typeDraftBusy}>
                      {typeDraftBusy ? "Creating…" : "Create type"}
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setCreatingType(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div data-testid="wizard-type-field">
                  <SearchableSelect
                    value={typeId}
                    onChange={(value) => {
                      setTypeId(value);
                      setCreatingType(false);
                    }}
                    options={(types ?? []).map((type) => ({
                      value: type._id,
                      label: formatTypeDisplay(type),
                    }))}
                    onCreate={(query) => {
                      setTypeDraft((prev) => ({ ...prev, name: query }));
                      setCreatingType(true);
                    }}
                    placeholder="Search types or type a new name…"
                    emptyLabel="Select type"
                    createLabel="Create new type"
                  />
                </div>
              )}
              {typeLabel ? <p className="text-xs text-muted-foreground">Selected: {typeLabel}</p> : null}
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            {scanError ? <p className="text-sm text-destructive">{scanError}</p> : null}
            {tags.map((tag, index) => {
              const options = containmentOptions.filter((option) => option.assetId !== tag.assetId.trim());
              return (
                <div
                  key={tag.localId}
                  data-testid={`wizard-tag-${index}`}
                  className="space-y-3 rounded-none border p-3"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Asset {index + 1}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={tags.length === 1}
                      onClick={() => setTags((prev) => prev.filter((entry) => entry.localId !== tag.localId))}
                    >
                      Remove
                    </Button>
                  </div>
                  <InventoryItemDetails
                    values={{
                      assetId: tag.assetId,
                      serialNumber: tag.serialNumber,
                      typeId,
                      storageLocationId: tag.storageLocationId,
                      containedInAssetId: tag.containedInAssetId,
                      status: tag.status,
                      notes: tag.notes,
                    }}
                    onChange={(patch) => updateTag(tag.localId, patch)}
                    fixedTypeLabel={typeLabel}
                    locations={locationOptions}
                    containerOptions={options}
                    onScanAssetId={(raw) => onScanAssetId(tag.localId, raw)}
                    onScanSerial={(raw) => onScanSerial(tag.localId, raw)}
                    onScanContainedIn={(raw) => onScanContainedIn(tag.localId, raw)}
                    onEnterAssetId={() => focusSerial(tag.localId)}
                    onEnterSerial={() => addAnotherAsset(tag.localId)}
                    assetIdInputRef={(el) => {
                      if (el) assetInputRefs.current.set(tag.localId, el);
                      else assetInputRefs.current.delete(tag.localId);
                    }}
                    serialInputRef={(el) => {
                      if (el) serialInputRefs.current.set(tag.localId, el);
                      else serialInputRefs.current.delete(tag.localId);
                    }}
                    autoFocusAssetId={index === 0}
                    testIdPrefix="wizard"
                  />
                  <ContainsEditor
                    value={tag.contains}
                    onChange={(contains) => updateTag(tag.localId, { contains })}
                    options={options.map((option) => ({
                      value: option.assetId,
                      assetId: option.assetId,
                      label: "",
                    }))}
                    onScan={(raw) => onScanContains(tag.localId, raw)}
                    title={`Contains (${tag.contains.length})`}
                    emptyLabel="Nothing inside yet — scan or add the contents"
                  />
                </div>
              );
            })}
            <Button type="button" variant="outline" onClick={() => addAnotherAsset()}>
              Add another asset
            </Button>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4" data-testid="wizard-review">
            <div className="rounded-none border p-3">
              <p className="text-sm font-medium">{typeLabel}</p>
              <p className="text-xs text-muted-foreground">
                {tags.length} asset{tags.length === 1 ? "" : "s"} to create
              </p>
            </div>
            <ul className="space-y-2">
              {tags.map((tag, index) => (
                <li key={tag.localId} className="rounded-none border p-3 text-sm" data-testid={`wizard-review-tag-${index}`}>
                  <p className="font-medium">
                    {tagAssetId(tag) ||
                      (tag.serialNumber.trim()
                        ? `Serial ${tag.serialNumber.trim()}`
                        : `Asset ${index + 1} (no ID)`)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[
                      tag.serialNumber ? `Serial ${tag.serialNumber}` : null,
                      tag.containedInAssetId ? `In ${tag.containedInAssetId}` : null,
                      tag.contains.length ? `Contains ${tag.contains.join(", ")}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "No location or containment set"}
                  </p>
                </li>
              ))}
            </ul>
            {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}
          </div>
        ) : null}
      </div>

      <SheetFooter className="shrink-0 border-t">
        <div className="flex w-full items-center justify-between gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
          <div className="flex gap-2">
            {step > 1 ? (
              <Button type="button" variant="outline" onClick={() => setStep((prev) => (prev - 1) as 1 | 2 | 3)}>
                Back
              </Button>
            ) : null}
            {step < 3 ? (
              <Button type="button" disabled={step === 1 && !typeId} onClick={() => setStep((prev) => (prev + 1) as 1 | 2 | 3)}>
                Continue
              </Button>
            ) : (
              <Button type="button" onClick={() => void submit()} disabled={submitting}>
                {submitting ? "Creating…" : `Create ${tags.length} item${tags.length === 1 ? "" : "s"}`}
              </Button>
            )}
          </div>
        </div>
      </SheetFooter>
    </div>
  );
}

export function CreateAssetWizard({ open, onOpenChange }: CreateAssetWizardProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-0 overflow-visible p-0 sm:max-w-xl lg:max-w-2xl"
      >
        {open ? <CreateAssetWizardForm onClose={() => onOpenChange(false)} /> : null}
      </SheetContent>
    </Sheet>
  );
}
