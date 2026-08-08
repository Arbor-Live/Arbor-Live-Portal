"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { canonicalizeAssetIdTag } from "@/lib/asset-scan";

type CsvRow = Record<string, string>;
type Category = "sound" | "lighting" | "staging_rigging" | "misc";

const DEFAULT_BRANDS = [
  "Behringer",
  "Astera",
  "Blizzard Lighting",
  "Sennheiser",
  "Shure",
  "Gator",
  "ProX",
  "Chauvet DJ",
  "RockVille",
  "MALighting",
  "QSC",
  "RCF",
  "Retevis",
  "DJI",
  "Radial",
  "GL.iNet",
  "Whirlwind",
  "Yamaha",
  "JBL",
  "LumenRadio",
  "Elation",
  "OnStage",
  "Samson",
  "ETC"
] as const;

function parseCsvContent(content: string): CsvRow[] {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const next = content[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(current);
      current = "";
      if (row.some((value) => value.trim().length > 0)) rows.push(row);
      row = [];
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    if (row.some((value) => value.trim().length > 0)) rows.push(row);
  }

  if (!rows.length) return [];
  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((record) => {
    const out: CsvRow = {};
    headers.forEach((header, index) => {
      out[header] = (record[index] ?? "").trim();
    });
    return out;
  });
}

function toUsd(input: string): number | undefined {
  if (!input) return undefined;
  const normalized = input.replace(/\$/g, "").replace(/,/g, "").trim();
  if (!normalized) return undefined;
  const numeric = Number.parseFloat(normalized);
  if (Number.isNaN(numeric)) return undefined;
  return Number(numeric.toFixed(2));
}

function normalizeTypeName(raw: string): string {
  return raw.replace(/\s+\(https?:\/\/[^)]*\)/g, "").trim();
}

function stripLeadingBrand(name: string): { manufacturer: string | undefined; normalizedName: string } {
  const cleaned = name.trim();
  if (!cleaned) return { manufacturer: undefined, normalizedName: cleaned };

  const matchingBrand = DEFAULT_BRANDS.find((brand) => {
    const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`^${escaped}(?:\\s+|\\b|[-_/])`, "i");
    return pattern.test(cleaned);
  });

  if (!matchingBrand) {
    return { manufacturer: undefined, normalizedName: cleaned };
  }

  const escaped = matchingBrand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const removePattern = new RegExp(`^${escaped}(?:\\s+|[-_/])?`, "i");
  const normalizedName = cleaned.replace(removePattern, "").trim();

  return {
    manufacturer: matchingBrand,
    normalizedName: normalizedName || cleaned,
  };
}

function mapCategory(raw: string): Category {
  const value = raw.toLowerCase();
  if (
    value.includes("lighting") ||
    value.includes("wireless dmx") ||
    value.includes("environmentals")
  ) {
    return "lighting";
  }
  if (value.includes("staging") || value.includes("rigging")) return "staging_rigging";
  if (
    value.includes("audio") ||
    value.includes("speaker") ||
    value.includes("network") ||
    value.includes("power") ||
    value.includes("microphone") ||
    value.includes("monitor")
  ) {
    return "sound";
  }
  return "misc";
}

function inferModel(typeName: string, modelNumber: string): string {
  if (modelNumber?.trim()) return modelNumber.trim();
  return typeName;
}

function parseContainedAssetIds(raw: string): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((segment) => segment.trim())
    .map((segment) => segment.match(/^([A-Za-z0-9-]+)/)?.[1] ?? "")
    .filter(Boolean);
}

export function CsvImporter() {
  const [typesFile, setTypesFile] = useState<File | null>(null);
  const [assetsFile, setAssetsFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const existingTypesQuery = useQuery(api.inventoryTypes.listOptions, {});
  const existingLocationsQuery = useQuery(api.storageLocations.list, {});
  const existingItemsQuery = useQuery(api.inventoryItems.listAssetIds, {});
  const existingCategoriesQuery = useQuery(api.inventoryCategories.list, { activeOnly: false });

  const ensureDefaultCategories = useMutation(api.inventoryCategories.ensureDefaults);
  const createCategory = useMutation(api.inventoryCategories.create);
  const createType = useMutation(api.inventoryTypes.create);
  const updateType = useMutation(api.inventoryTypes.update);
  const createItem = useMutation(api.inventoryItems.create);
  const updateItem = useMutation(api.inventoryItems.update);
  const setContainer = useMutation(api.inventoryItems.setContainer);
  const createLocation = useMutation(api.storageLocations.create);

  const existingTypeMap = useMemo(() => {
    const map = new Map<string, string>();
    const existingTypes = existingTypesQuery ?? [];
    for (const type of existingTypes) map.set(type.name.toLowerCase(), type._id);
    return map;
  }, [existingTypesQuery]);

  const existingLocationMap = useMemo(() => {
    const map = new Map<string, string>();
    const existingLocations = existingLocationsQuery ?? [];
    for (const location of existingLocations) map.set(location.path.toLowerCase(), location._id);
    return map;
  }, [existingLocationsQuery]);

  const isLoadingExistingData =
    existingTypesQuery === undefined ||
    existingLocationsQuery === undefined ||
    existingItemsQuery === undefined ||
    existingCategoriesQuery === undefined;

  function addLog(message: string) {
    setLogs((prev) => [...prev, message]);
  }

  async function ensureLocation(path: string, cache: Map<string, string>) {
    const cleaned = path.trim();
    if (!cleaned) return undefined;
    const key = cleaned.toLowerCase();
    const existing = cache.get(key);
    if (existing) return existing;

    const created = await createLocation({ name: cleaned });
    cache.set(key, created);
    addLog(`Created location: ${cleaned}`);
    return created;
  }

  async function ensureCategory(
    key: string,
    categories: Map<string, string>,
    labels: Map<string, string>,
  ) {
    const normalizedKey = key.trim().toLowerCase();
    if (!normalizedKey) return "misc";
    if (categories.has(normalizedKey)) return normalizedKey;
    await createCategory({
      key: normalizedKey,
      label: labels.get(normalizedKey) ?? normalizedKey.replace(/_/g, " "),
      active: true,
    });
    categories.set(normalizedKey, normalizedKey);
    addLog(`Created category: ${normalizedKey}`);
    return normalizedKey;
  }

  async function runImport() {
    if (!typesFile || !assetsFile) {
      addLog("Please select both CSV files.");
      return;
    }

    if (isLoadingExistingData) {
      addLog("Still loading existing inventory data. Wait a moment and try again.");
      return;
    }

    setIsImporting(true);
    setLogs([]);

    let errorCount = 0;

    try {
      const typeCache = new Map(existingTypeMap);
      const existingTypesByName = new Map(
        (existingTypesQuery ?? []).map((type) => [type.name.toLowerCase(), type]),
      );
      const locationCache = new Map(existingLocationMap);
      await ensureDefaultCategories({});
      const categoryCache = new Map<string, string>();
      const categoryLabels = new Map<string, string>();
      for (const category of existingCategoriesQuery ?? []) {
        categoryCache.set(category.key.toLowerCase(), category.key);
        categoryLabels.set(category.key.toLowerCase(), category.label);
      }
      for (const entry of [
        { key: "sound", label: "Sound" },
        { key: "lighting", label: "Lighting" },
        { key: "staging_rigging", label: "Staging & Rigging" },
        { key: "misc", label: "Misc" },
      ]) {
        categoryCache.set(entry.key, entry.key);
        categoryLabels.set(entry.key, entry.label);
      }
      const existingItems = existingItemsQuery ?? [];
      const assetRecordIdMap = new Map<string, string>();
      for (const item of existingItems) assetRecordIdMap.set(item.assetId.toLowerCase(), item._id);

      const [typesCsv, assetsCsv] = await Promise.all([typesFile.text(), assetsFile.text()]);
      const typeRows = parseCsvContent(typesCsv);
      const assetRows = parseCsvContent(assetsCsv);

      addLog(`Parsed ${typeRows.length} type rows.`);
      addLog(`Parsed ${assetRows.length} asset rows.`);

      for (const row of typeRows) {
        const rawName = (row["Item Name"] ?? "").trim();
        if (!rawName) continue;
        try {
          const { manufacturer, normalizedName } = stripLeadingBrand(rawName);
          const name = normalizedName;
          const key = name.toLowerCase();
          const existingType = existingTypesByName.get(key);
          const payload = {
            name,
            category: await ensureCategory(
              mapCategory(row["Category"] ?? ""),
              categoryCache,
              categoryLabels,
            ),
            manufacturer,
            model: inferModel(name, row["Model Number"] ?? ""),
            msrpUsd: toUsd(row["MSRP"] ?? ""),
            rentalPriceUsd: toUsd(row["Non-subsidized Rate (10%)"] ?? ""),
            subsidizedRentalPriceUsd: toUsd(row["Crew Subsidized (5%)"] ?? ""),
            nonSubsidizedRentalPriceUsd: toUsd(row["Non-subsidized Rate (10%)"] ?? ""),
            manualUrls: [],
            tips: row["Notes"] || undefined,
            capabilities: [],
            iconImageUrl: undefined,
            promoImageUrl: undefined,
          };

          if (existingType) {
            await updateType({ id: existingType._id, ...payload });
            typeCache.set(key, existingType._id);
          } else {
            const createdTypeId = await createType(payload);
            typeCache.set(key, createdTypeId);
            existingTypesByName.set(key, { _id: createdTypeId, ...payload } as never);
          }
        } catch (error) {
          errorCount += 1;
          addLog(`Skipped type "${rawName}": ${getConvexErrorMessage(error)}`);
        }
      }

      let importedItems = 0;
      let skippedItems = 0;
      let createdTypesFromAssets = 0;

      for (const row of assetRows) {
        const assetId = canonicalizeAssetIdTag(row["Name"] ?? "");
        const fungibleRaw = normalizeTypeName(row["Fungible Inventory"] ?? "");
        if (!assetId || !fungibleRaw) continue;

        try {
          const { manufacturer, normalizedName } = stripLeadingBrand(fungibleRaw);
          const fungible = normalizedName;
          if (!fungible) continue;

          const assetKey = assetId.toLowerCase();
          const existingRecordId = assetRecordIdMap.get(assetKey);

          let typeId = typeCache.get(fungible.toLowerCase());
          if (!typeId) {
            const categoryKey = await ensureCategory(
              mapCategory(row["Rollup"] ?? ""),
              categoryCache,
              categoryLabels,
            );
            typeId = await createType({
              name: fungible,
              category: categoryKey,
              manufacturer,
              model: fungible,
              msrpUsd: toUsd(row["MSRP"] ?? ""),
              rentalPriceUsd: toUsd(row["Large Rate PACK"] ?? ""),
              subsidizedRentalPriceUsd: toUsd(row["Small Rate PACK"] ?? ""),
              nonSubsidizedRentalPriceUsd: toUsd(row["Large Rate PACK"] ?? ""),
              manualUrls: [],
              tips: row["Description"] || undefined,
              capabilities: [],
              iconImageUrl: undefined,
              promoImageUrl: undefined,
            });
            typeCache.set(fungible.toLowerCase(), typeId);
            createdTypesFromAssets += 1;
          }

          const storageLocationId = await ensureLocation(row["Storage Loc"] ?? "", locationCache);
          const itemPayload = {
            assetId,
            serialNumber: row["Serial"] || undefined,
            typeId: typeId as never,
            storageLocationId: storageLocationId as never,
            status: row["Condition"] || undefined,
            notes: row["Description"] || undefined,
          };

          if (existingRecordId) {
            await updateItem({ id: existingRecordId as never, ...itemPayload });
            skippedItems += 1;
            continue;
          }

          const createdItemId = await createItem(itemPayload);
          assetRecordIdMap.set(assetKey, createdItemId);
          importedItems += 1;
        } catch (error) {
          errorCount += 1;
          addLog(`Skipped asset "${assetId}": ${getConvexErrorMessage(error)}`);
        }
      }

      // Second pass to apply asset containment links from the "Contains" column.
      for (const row of assetRows) {
        const containerAssetId = (row["Name"] ?? "").trim();
        const containerRecordId = assetRecordIdMap.get(containerAssetId.toLowerCase());
        if (!containerRecordId) continue;
        const containsAssetIds = parseContainedAssetIds(row["Contains"] ?? "");
        for (const childAssetId of containsAssetIds) {
          const childRecordId = assetRecordIdMap.get(childAssetId.toLowerCase());
          if (!childRecordId) continue;
          if (childRecordId === containerRecordId) continue;
          try {
            await setContainer({
              id: childRecordId as never,
              containedInAssetId: containerRecordId as never,
            });
          } catch (error) {
            errorCount += 1;
            addLog(
              `Skipped container link ${childAssetId} → ${containerAssetId}: ${getConvexErrorMessage(error)}`,
            );
          }
        }
      }

      addLog(`Import complete: ${importedItems} items imported.`);
      addLog(`${skippedItems} existing assets updated.`);
      addLog(`${createdTypesFromAssets} additional types created from asset-only rows.`);
      if (errorCount > 0) {
        addLog(`Finished with ${errorCount} row error${errorCount === 1 ? "" : "s"} (see messages above).`);
      }
    } catch (error) {
      addLog(`Import failed: ${getConvexErrorMessage(error)}`);
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>CSV Importer</CardTitle>
        <CardDescription>
          Upload your Inventory Types CSV and Assets CSV to import records into Convex.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Inventory Types CSV</Label>
          <Input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => setTypesFile(event.target.files?.[0] ?? null)}
          />
        </div>
        <div className="space-y-2">
          <Label>Assets CSV</Label>
          <Input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => setAssetsFile(event.target.files?.[0] ?? null)}
          />
        </div>
        <Button
          type="button"
          disabled={isImporting || isLoadingExistingData || !typesFile || !assetsFile}
          onClick={() => void runImport()}
        >
          {isLoadingExistingData
            ? "Loading existing data..."
            : isImporting
              ? "Importing..."
              : "Run Import"}
        </Button>
        <div className="max-h-64 space-y-1 overflow-auto rounded-md border p-3 text-sm">
          {logs.length ? logs.map((log, index) => <p key={`${index}-${log}`}>{log}</p>) : <p>No logs yet.</p>}
        </div>
      </CardContent>
    </Card>
  );
}
