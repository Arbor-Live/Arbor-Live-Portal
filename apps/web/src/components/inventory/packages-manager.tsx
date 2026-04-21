"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "./constants";
import { SearchableSelect } from "./searchable-select";

type PackageItemRow = { typeId: string; quantity: string };

type PublicPackageBucket = "lighting" | "sound" | "environmental" | "staging" | "misc";

const defaultForm = {
  name: "",
  description: "",
  subsidizedPackagePriceUsd: "",
  nonSubsidizedPackagePriceUsd: "",
  active: true,
  publicListing: false,
  /** Where this package appears on /public/packages (required when publicListing). */
  publicBucket: "" as "" | PublicPackageBucket,
  publicHeroImageUrl: "",
  publicSlug: "",
};

const publicBucketLabels: Record<PublicPackageBucket, string> = {
  lighting: "Lighting",
  sound: "Sound",
  environmental: "Environmental",
  staging: "Staging",
  misc: "Misc",
};

export function PackagesManager() {
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<"name" | "price" | "value">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [form, setForm] = useState(defaultForm);
  const [items, setItems] = useState<PackageItemRow[]>([{ typeId: "", quantity: "1" }]);

  const packages = useQuery(api.inventoryPackages.list, {});
  const types = useQuery(api.inventoryTypes.list, {});
  type InventoryTypeRow = NonNullable<typeof types>[number];
  const createPackage = useMutation(api.inventoryPackages.create);
  const updatePackage = useMutation(api.inventoryPackages.update);
  const removePackage = useMutation(api.inventoryPackages.remove);
  const typeLookup = useMemo(() => {
    const map = new Map<string, InventoryTypeRow>();
    for (const type of types ?? []) {
      map.set(type._id, type);
    }
    return map;
  }, [types]);
  const filteredPackages = useMemo(() => {
    const rows = [...(packages ?? [])].filter((pkg) =>
      pkg.name.toLowerCase().includes(search.trim().toLowerCase()),
    );
    rows.sort((a, b) => {
      const direction = sortDir === "asc" ? 1 : -1;
      if (sortBy === "price") return (a.packagePriceCents - b.packagePriceCents) * direction;
      if (sortBy === "value") {
        return ((a.estimatedRentalValueUsd ?? 0) - (b.estimatedRentalValueUsd ?? 0)) * direction;
      }
      return a.name.localeCompare(b.name) * direction;
    });
    return rows;
  }, [packages, search, sortBy, sortDir]);

  function buildPackagePayload() {
    const subsidizedPackagePriceUsd = Number(form.subsidizedPackagePriceUsd || "0");
    const nonSubsidizedPackagePriceUsd = Number(form.nonSubsidizedPackagePriceUsd || "0");
    return {
      name: form.name,
      description: form.description || undefined,
      packagePriceCents: Math.round(nonSubsidizedPackagePriceUsd * 100),
      subsidizedPackagePriceUsd,
      nonSubsidizedPackagePriceUsd,
      active: form.active,
      publicListing: form.publicListing,
      publicBucket:
        form.publicListing && form.publicBucket ? (form.publicBucket as PublicPackageBucket) : undefined,
      publicHeroImageUrl: form.publicHeroImageUrl.trim() || undefined,
      publicSlug: form.publicSlug.trim() || undefined,
      items: items
        .filter((row) => row.typeId && Number(row.quantity) > 0)
        .map((row) => ({ typeId: row.typeId as Id<"inventoryTypes">, quantity: Number(row.quantity) })),
    };
  }

  async function persistPackage(payload: ReturnType<typeof buildPackagePayload>) {
    if (editingId) {
      await updatePackage({ id: editingId as Id<"inventoryPackages">, ...payload });
    } else {
      await createPackage(payload);
    }
    setEditingId(null);
    setEditorOpen(false);
    setForm(defaultForm);
    setItems([{ typeId: "", quantity: "1" }]);
  }

  async function submit() {
    const payload = buildPackagePayload();
    if (!payload.items.length) return;

    try {
      if (form.publicListing && !form.publicBucket) {
        window.alert("Choose which public browse section this package appears under (Lighting, Sound, etc.).");
        return;
      }

      await persistPackage(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save package.";
      window.alert(message);
    }
  }

  async function bulkDeleteSelected() {
    await Promise.all(selectedIds.map((id) => removePackage({ id: id as never })));
    setSelectedIds([]);
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditingId(null);
    setForm(defaultForm);
    setItems([{ typeId: "", quantity: "1" }]);
  }

  const suggestedPricing = useMemo(() => {
    return items.reduce(
      (acc, row) => {
        const qty = Number(row.quantity || "0");
        if (!row.typeId || qty <= 0) return acc;
        const type = typeLookup.get(row.typeId);
        if (!type) return acc;
        acc.subsidized += (type.subsidizedRentalPriceUsd ?? 0) * qty;
        acc.nonSubsidized +=
          (type.nonSubsidizedRentalPriceUsd ?? type.rentalPriceUsd ?? 0) * qty;
        return acc;
      },
      { subsidized: 0, nonSubsidized: 0 },
    );
  }, [items, typeLookup]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Packages</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Input placeholder="Search packages" value={search} onChange={(event) => setSearch(event.target.value)} />
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
            >
              <option value="name">Sort: Name</option>
              <option value="price">Sort: Price</option>
              <option value="value">Sort: Est. Value</option>
            </select>
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={sortDir}
              onChange={(event) => setSortDir(event.target.value as typeof sortDir)}
            >
              <option value="asc">Asc</option>
              <option value="desc">Desc</option>
            </select>
            <Button
              type="button"
              variant="destructive"
              disabled={!selectedIds.length}
              onClick={() => void bulkDeleteSelected()}
            >
              Delete Selected ({selectedIds.length})
            </Button>
            <Button
              type="button"
              onClick={() => {
                setEditingId(null);
                setForm(defaultForm);
                setItems([{ typeId: "", quantity: "1" }]);
                setEditorOpen(true);
              }}
            >
              Create Package
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-auto rounded-md border">
            <table className="min-w-full table-fixed text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2 text-left">
                    <input
                      type="checkbox"
                      checked={filteredPackages.length > 0 && selectedIds.length === filteredPackages.length}
                      onChange={(event) =>
                        setSelectedIds(event.target.checked ? filteredPackages.map((pkg) => pkg._id) : [])
                      }
                    />
                  </th>
                  <th className="p-2 text-left">Name</th>
                  <th className="p-2 text-left">Public section</th>
                  <th className="p-2 text-left">Subsidized</th>
                  <th className="p-2 text-left">Non-Subsidized</th>
                  <th className="p-2 text-left">Est. Subsidized</th>
                  <th className="p-2 text-left">Est. Non-Subsidized</th>
                  <th className="p-2 text-left">Items</th>
                  <th className="p-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPackages.map((pkg) => (
                  <tr key={pkg._id} className="border-t align-top">
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(pkg._id)}
                        onChange={(event) =>
                          setSelectedIds((prev) =>
                            event.target.checked
                              ? [...prev, pkg._id]
                              : prev.filter((id) => id !== pkg._id),
                          )
                        }
                      />
                    </td>
                    <td className="p-2">
                      <div className="font-medium">{pkg.name}</div>
                      <div className="break-words text-xs text-muted-foreground">
                        {pkg.description || "No description"}
                      </div>
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {pkg.publicListing && pkg.publicBucket ? (
                        <span className="text-foreground">{publicBucketLabels[pkg.publicBucket]}</span>
                      ) : pkg.publicListing ? (
                        "Not set"
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-2">
                      {formatCurrency(pkg.subsidizedPackagePriceUsd)}
                    </td>
                    <td className="p-2">
                      {formatCurrency(
                        pkg.nonSubsidizedPackagePriceUsd ?? pkg.packagePriceCents / 100,
                      )}
                    </td>
                    <td className="p-2">
                      {formatCurrency(pkg.estimatedSubsidizedRentalValueUsd)}
                    </td>
                    <td className="p-2">
                      {formatCurrency(pkg.estimatedRentalValueUsd)}
                    </td>
                    <td className="p-2">
                      <div className="max-w-[420px] break-words">
                        {pkg.items
                          .map((row) => `${row.quantity}x ${row.type?.name ?? "Unknown"}`)
                          .join(", ")}
                      </div>
                    </td>
                    <td className="p-2">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingId(pkg._id);
                            setForm({
                              name: pkg.name,
                              description: pkg.description ?? "",
                              subsidizedPackagePriceUsd:
                                (pkg.subsidizedPackagePriceUsd ?? 0).toString(),
                              nonSubsidizedPackagePriceUsd: (
                                pkg.nonSubsidizedPackagePriceUsd ?? pkg.packagePriceCents / 100
                              ).toString(),
                              active: pkg.active,
                              publicListing: Boolean(pkg.publicListing),
                              publicBucket: (pkg.publicBucket ?? "") as typeof defaultForm.publicBucket,
                              publicHeroImageUrl: pkg.publicHeroImageUrl ?? "",
                              publicSlug: pkg.publicSlug ?? "",
                            });
                            setItems(
                              pkg.items.map((row) => ({
                                typeId: row.typeId,
                                quantity: row.quantity.toString(),
                              })),
                            );
                            setEditorOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => void removePackage({ id: pkg._id })}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      {editorOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="relative w-full max-w-4xl rounded-lg border bg-background shadow-xl">
            <div className="border-b p-4">
              <h2 className="text-lg font-semibold">{editingId ? "Edit Package" : "Create Package"}</h2>
            </div>
            <div className="max-h-[80vh] overflow-auto p-4">
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <textarea
                    className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={form.description}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, description: event.target.value }))
                    }
                    placeholder="Supports Markdown"
                  />
                  <p className="text-xs text-muted-foreground">
                    Multi-line; Markdown supported on the public package page.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Subsidized Package Price (USD)</Label>
                    <Input
                      value={form.subsidizedPackagePriceUsd}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          subsidizedPackagePriceUsd: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Non-Subsidized Package Price (USD)</Label>
                    <Input
                      value={form.nonSubsidizedPackagePriceUsd}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          nonSubsidizedPackagePriceUsd: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, active: event.target.checked }))
                    }
                  />
                  Active
                </label>
                <div className="rounded-md border p-3 space-y-3">
                  <p className="text-sm font-medium">Public listing</p>
                  <p className="text-xs text-muted-foreground">
                    Public packages appear on the unauthenticated browse pages. Line items without a full public profile
                    still show by name on the package page (for example road cases or accessories) but do not get their
                    own standalone public product page.
                  </p>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.publicListing}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          publicListing: event.target.checked,
                          publicBucket: event.target.checked ? prev.publicBucket : "",
                        }))
                      }
                    />
                    List publicly
                  </label>
                  {form.publicListing ? (
                    <div className="space-y-2">
                      <Label>Public browse section</Label>
                      <select
                        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                        value={form.publicBucket}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            publicBucket: event.target.value as typeof prev.publicBucket,
                          }))
                        }
                      >
                        <option value="">Select section…</option>
                        {(Object.keys(publicBucketLabels) as PublicPackageBucket[]).map((key) => (
                          <option key={key} value={key}>
                            {publicBucketLabels[key]}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-muted-foreground">
                        Controls which tab this package appears under on the public packages page.
                      </p>
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    <Label>Hero image URL</Label>
                    <Input
                      value={form.publicHeroImageUrl}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, publicHeroImageUrl: event.target.value }))
                      }
                      placeholder="https://..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Optional public slug</Label>
                    <Input
                      value={form.publicSlug}
                      onChange={(event) => setForm((prev) => ({ ...prev, publicSlug: event.target.value }))}
                      placeholder="e.g. basic-foh-package"
                    />
                    <p className="text-xs text-muted-foreground">Lowercase letters/numbers with dashes only.</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Package Items</Label>
                  {items.map((row, index) => (
                    <div
                      key={`${index}-${row.typeId}`}
                      className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_120px_auto]"
                    >
                      <SearchableSelect
                        value={row.typeId}
                        onChange={(nextValue) =>
                          setItems((prev) =>
                            prev.map((current, currentIndex) =>
                              currentIndex === index ? { ...current, typeId: nextValue } : current,
                            ),
                          )
                        }
                        options={(types ?? []).map((type) => ({
                          value: type._id,
                          label: `${type.name} - ${type.model}`,
                        }))}
                        placeholder="Search package item type..."
                        emptyLabel="Select type"
                      />
                      <Input
                        value={row.quantity}
                        onChange={(event) =>
                          setItems((prev) =>
                            prev.map((current, currentIndex) =>
                              currentIndex === index
                                ? { ...current, quantity: event.target.value }
                                : current,
                            ),
                          )
                        }
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="whitespace-nowrap"
                        onClick={() =>
                          setItems((prev) =>
                            prev.filter((_, currentIndex) => currentIndex !== index),
                          )
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setItems((prev) => [...prev, { typeId: "", quantity: "1" }])}
                  >
                    Add Type Row
                  </Button>
                  <div className="rounded-md border p-2 text-sm">
                    <p className="mb-1 font-medium">Selected Item Pricing</p>
                    <div className="space-y-1 text-xs">
                      {items
                        .filter((row) => row.typeId && Number(row.quantity) > 0)
                        .map((row, index) => {
                          const type = typeLookup.get(row.typeId);
                          if (!type) return null;
                          const qty = Number(row.quantity || "0");
                          const sub = (type.subsidizedRentalPriceUsd ?? 0) * qty;
                          const nonSub =
                            (type.nonSubsidizedRentalPriceUsd ?? type.rentalPriceUsd ?? 0) * qty;
                          return (
                            <p key={`${row.typeId}-${index}`}>
                              {qty}x {type.name}: Sub {formatCurrency(sub)} / Non{" "}
                              {formatCurrency(nonSub)}
                            </p>
                          );
                        })}
                    </div>
                    <div className="my-2 border-t" />
                    <p>
                      Suggested Subsidized:{" "}
                      <span className="font-medium">
                        {formatCurrency(Number(suggestedPricing.subsidized.toFixed(2)))}
                      </span>
                    </p>
                    <p>
                      Suggested Non-Subsidized:{" "}
                      <span className="font-medium">
                        {formatCurrency(Number(suggestedPricing.nonSubsidized.toFixed(2)))}
                      </span>
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            subsidizedPackagePriceUsd:
                              Number(suggestedPricing.subsidized.toFixed(2)).toString(),
                            nonSubsidizedPackagePriceUsd:
                              Number(suggestedPricing.nonSubsidized.toFixed(2)).toString(),
                          }))
                        }
                      >
                        Use Suggested Prices
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" onClick={() => void submit()}>
                    {editingId ? "Update" : "Create"}
                  </Button>
                  <Button type="button" variant="outline" onClick={closeEditor}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
