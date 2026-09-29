"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api, type Id } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { publicBucketLabels, sectionOrder, type PublicPackageBucket } from "./package-section-utils";

type Category = {
  _id: Id<"inventoryCategories">;
  key: string;
  label: string;
  active: boolean;
  publicBucket?: PublicPackageBucket;
};

type Capability = {
  _id: Id<"capabilityDefinitions">;
  key: string;
  label: string;
  category?: string;
  active: boolean;
};

export type TypeSettingsTab = "categories" | "capabilities";

/** Radix Select can't hold an empty value, so "no bucket" / "any category" use a sentinel. */
const NONE = "__none__";

async function attempt(action: () => Promise<unknown>, success?: string) {
  try {
    await action();
    if (success) notify.success(success);
    return true;
  } catch (error) {
    notify.error(getConvexErrorMessage(error));
    return false;
  }
}

/** Categories and capability keys: the taxonomy every type is validated against. */
export function TypeSettingsDialog({
  open,
  onOpenChange,
  tab,
  onTabChange,
  categories,
  capabilities,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: TypeSettingsTab;
  onTabChange: (tab: TypeSettingsTab) => void;
  categories: Category[] | undefined;
  capabilities: Capability[] | undefined;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl" data-testid="type-settings-dialog">
        <DialogHeader>
          <DialogTitle>Type settings</DialogTitle>
          <DialogDescription>
            Every type needs an active category, and can only use active capability keys. A category&apos;s public
            bucket decides which public browse page its types land on.
          </DialogDescription>
        </DialogHeader>
        <ToggleGroup
          type="single"
          variant="outline"
          value={tab}
          onValueChange={(value) => {
            if (value) onTabChange(value as TypeSettingsTab);
          }}
          aria-label="Settings section"
        >
          <ToggleGroupItem value="categories">Categories</ToggleGroupItem>
          <ToggleGroupItem value="capabilities">Capabilities</ToggleGroupItem>
        </ToggleGroup>
        {tab === "categories" ? (
          <CategoriesSettings categories={categories} />
        ) : (
          <CapabilitiesSettings capabilities={capabilities} categories={categories} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function BucketSelect({
  id,
  value,
  onChange,
  noneLabel,
  className,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  noneLabel: string;
  className?: string;
}) {
  return (
    <Select value={value || NONE} onValueChange={(next) => onChange(next === NONE ? "" : next)}>
      <SelectTrigger id={id} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{noneLabel}</SelectItem>
        {sectionOrder.map((key) => (
          <SelectItem key={key} value={key}>
            {publicBucketLabels[key]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CategoriesSettings({ categories }: { categories: Category[] | undefined }) {
  const { confirm } = useAppDialog();
  const ensureDefaults = useMutation(api.inventoryCategories.ensureDefaults);
  const createCategory = useMutation(api.inventoryCategories.create);
  const updateCategory = useMutation(api.inventoryCategories.update);
  const removeCategory = useMutation(api.inventoryCategories.remove);
  const [draft, setDraft] = useState({ key: "", label: "", publicBucket: "" });
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!draft.key.trim() || !draft.label.trim()) return;
    setBusy(true);
    const ok = await attempt(
      () =>
        createCategory({
          key: draft.key,
          label: draft.label,
          publicBucket: draft.publicBucket ? (draft.publicBucket as PublicPackageBucket) : undefined,
          active: true,
        }),
      `Added ${draft.label.trim()}`,
    );
    setBusy(false);
    if (ok) setDraft({ key: "", label: "", publicBucket: "" });
  }

  async function remove(category: Category) {
    const ok = await confirm({
      title: `Delete the ${category.label} category?`,
      description:
        "Only an unused category can be deleted. If any type still uses it, disable it instead so no new types pick it.",
      destructive: true,
      confirmLabel: "Delete category",
    });
    if (!ok) return;
    await attempt(() => removeCategory({ id: category._id }), `Deleted ${category.label}`);
  }

  return (
    <div className="space-y-4">
      <form
        className="grid gap-3 border p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
        data-testid="category-add-form"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="category-new-key">Key</Label>
          <Input
            id="category-new-key"
            placeholder="e.g. backline"
            value={draft.key}
            onChange={(event) => setDraft((prev) => ({ ...prev, key: event.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="category-new-label">Label</Label>
          <Input
            id="category-new-label"
            placeholder="e.g. Backline"
            value={draft.label}
            onChange={(event) => setDraft((prev) => ({ ...prev, label: event.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="category-new-bucket">Public bucket</Label>
          <BucketSelect
            id="category-new-bucket"
            value={draft.publicBucket}
            onChange={(publicBucket) => setDraft((prev) => ({ ...prev, publicBucket }))}
            noneLabel="Auto"
          />
        </div>
        <Button type="submit" disabled={busy || !draft.key.trim() || !draft.label.trim()}>
          <PlusIcon />
          Add category
        </Button>
      </form>

      {categories === undefined ? (
        <p className="text-sm text-muted-foreground">Loading categories…</p>
      ) : categories.length === 0 ? (
        <p className="border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          No categories yet. Add one above, or restore the defaults.
        </p>
      ) : (
        <ul className="divide-y border" data-testid="category-list">
          {categories.map((category) => (
            <li
              key={category._id}
              data-testid={`category-row-${category.key}`}
              className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{category.label}</p>
                <p className="truncate text-xs text-muted-foreground">{category.key}</p>
              </div>
              <BucketSelect
                id={`category-bucket-${category.key}`}
                value={category.publicBucket ?? ""}
                noneLabel="Auto bucket"
                className="w-40"
                onChange={(next) =>
                  void attempt(() =>
                    updateCategory({
                      id: category._id,
                      publicBucket: next ? (next as PublicPackageBucket) : null,
                    }),
                  )
                }
              />
              <div className="flex w-24 items-center justify-end gap-2">
                <Label htmlFor={`category-active-${category.key}`} className="text-xs text-muted-foreground">
                  Active
                </Label>
                <Switch
                  id={`category-active-${category.key}`}
                  checked={category.active}
                  onCheckedChange={(active) => void attempt(() => updateCategory({ id: category._id, active }))}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete the ${category.label} category`}
                onClick={() => void remove(category)}
              >
                <TrashIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>Restoring adds any missing built-in categories and fixes their buckets. Your own stay as they are.</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void attempt(() => ensureDefaults({}), "Default categories restored")}
        >
          Restore default categories
        </Button>
      </div>
    </div>
  );
}

function CapabilitiesSettings({
  capabilities,
  categories,
}: {
  capabilities: Capability[] | undefined;
  categories: Category[] | undefined;
}) {
  const { confirm } = useAppDialog();
  const createCapability = useMutation(api.capabilityDefinitions.create);
  const updateCapability = useMutation(api.capabilityDefinitions.update);
  const deleteCapability = useMutation(api.capabilityDefinitions.remove);
  const [draft, setDraft] = useState({ key: "", label: "", category: "" });
  const [busy, setBusy] = useState(false);
  const categoryLabels = new Map((categories ?? []).map((category) => [category.key, category.label]));

  async function add() {
    if (!draft.key.trim() || !draft.label.trim()) return;
    setBusy(true);
    const ok = await attempt(
      () =>
        createCapability({
          key: draft.key,
          label: draft.label,
          category: draft.category || undefined,
          active: true,
        }),
      `Added ${draft.label.trim()}`,
    );
    setBusy(false);
    if (ok) setDraft({ key: "", label: "", category: "" });
  }

  async function remove(capability: Capability) {
    const ok = await confirm({
      title: `Delete the ${capability.label} capability?`,
      description:
        "Types that already list this key keep it, but can't be saved again until it's removed from them.",
      destructive: true,
      confirmLabel: "Delete capability",
    });
    if (!ok) return;
    await attempt(() => deleteCapability({ id: capability._id }), `Deleted ${capability.label}`);
  }

  return (
    <div className="space-y-4">
      <form
        className="grid gap-3 border p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
        data-testid="capability-add-form"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="capability-new-key">Key</Label>
          <Input
            id="capability-new-key"
            placeholder="e.g. wireless"
            value={draft.key}
            onChange={(event) => setDraft((prev) => ({ ...prev, key: event.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="capability-new-label">Label</Label>
          <Input
            id="capability-new-label"
            placeholder="e.g. Wireless"
            value={draft.label}
            onChange={(event) => setDraft((prev) => ({ ...prev, label: event.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="capability-new-category">Category</Label>
          <Select
            value={draft.category || NONE}
            onValueChange={(next) => setDraft((prev) => ({ ...prev, category: next === NONE ? "" : next }))}
          >
            <SelectTrigger id="capability-new-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>All categories</SelectItem>
              {(categories ?? [])
                .filter((category) => category.active)
                .map((category) => (
                  <SelectItem key={category.key} value={category.key}>
                    {category.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={busy || !draft.key.trim() || !draft.label.trim()}>
          <PlusIcon />
          Add capability
        </Button>
      </form>

      {capabilities === undefined ? (
        <p className="text-sm text-muted-foreground">Loading capabilities…</p>
      ) : capabilities.length === 0 ? (
        <p className="border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          No capability keys yet. Add one above (e.g. wireless, battery, IP65), then tick it on a type.
        </p>
      ) : (
        <ul className="divide-y border" data-testid="capability-list">
          {capabilities.map((capability) => (
            <li
              key={capability._id}
              data-testid={`capability-row-${capability.key}`}
              className="flex items-center gap-2 px-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{capability.label}</p>
                <p className="truncate text-xs text-muted-foreground">{capability.key}</p>
              </div>
              <span className="hidden w-40 truncate text-xs text-muted-foreground sm:block">
                {capability.category
                  ? (categoryLabels.get(capability.category) ?? capability.category)
                  : "All categories"}
              </span>
              <div className="flex w-24 items-center justify-end gap-2">
                <Label
                  htmlFor={`capability-active-${capability.key}`}
                  className="text-xs text-muted-foreground"
                >
                  Active
                </Label>
                <Switch
                  id={`capability-active-${capability.key}`}
                  checked={capability.active}
                  onCheckedChange={(active) =>
                    void attempt(() => updateCapability({ id: capability._id, active }))
                  }
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete the ${capability.label} capability`}
                onClick={() => void remove(capability)}
              >
                <TrashIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
