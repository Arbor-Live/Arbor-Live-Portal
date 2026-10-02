"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { CircleNotchIcon, FileCsvIcon, ListChecksIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import { FileDropzone } from "@/components/file-dropzone";
import { RowCell, RowList, RowText } from "@/components/list-page";
import { StatusPill, type Tone } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useBeforeUnload } from "@/hooks/use-before-unload";
import { api } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { canonicalizeAssetIdTag } from "@/lib/asset-scan";
import { notify } from "@/lib/notify";

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

type FileKind = "types" | "items";

type PickedFile = {
  file: File;
  /** Data rows (header excluded); undefined while the file is being read. */
  rows?: number;
  /** A column the importer needs that the header row doesn't have. */
  missingColumn?: string;
  readError?: boolean;
};

const FILES: Record<FileKind, { id: string; label: string; description: string; columns: string[] }> = {
  types: {
    id: "import-types-file",
    label: "Types CSV",
    description:
      "One row per model of gear: Item Name, Category, Model Number, MSRP, the two rental rates, and Notes.",
    columns: ["Item Name"],
  },
  items: {
    id: "import-items-file",
    label: "Items CSV",
    description:
      "One row per tagged unit: Name (the asset ID), Fungible Inventory (its type), Storage Loc, Serial, Condition, and Contains.",
    columns: ["Name", "Fungible Inventory"],
  },
};

type StepId = "read" | "types" | "items" | "containers";
type StepStatus = "waiting" | "running" | "done" | "failed";
type StepState = { status: StepStatus; detail?: string };

const STEPS: Array<{ id: StepId; title: string; waiting: string }> = [
  { id: "read", title: "Read the files", waiting: "Counts the rows in both files." },
  { id: "types", title: "Types", waiting: "Adds or updates a type for each row of the types CSV." },
  { id: "items", title: "Items", waiting: "Adds or updates each unit, with its type and storage location." },
  { id: "containers", title: "Containers", waiting: "Links units to the case or rack they're packed in." },
];

const STEP_STATUS: Record<StepStatus, { label: string; tone: Tone }> = {
  waiting: { label: "Waiting", tone: "neutral" },
  running: { label: "Running", tone: "blue" },
  done: { label: "Done", tone: "emerald" },
  failed: { label: "Failed", tone: "rose" },
};

function waitingSteps(): Record<StepId, StepState> {
  return {
    read: { status: "waiting" },
    types: { status: "waiting" },
    items: { status: "waiting" },
    containers: { status: "waiting" },
  };
}

function plural(count: number, noun: string, nouns = `${noun}s`) {
  return `${count.toLocaleString()} ${count === 1 ? noun : nouns}`;
}

function isCsvFile(file: File) {
  return /\.csv$/i.test(file.name) || file.type === "text/csv";
}

function fileDetail(picked: PickedFile | null) {
  if (!picked) return undefined;
  if (picked.readError) return <span className="text-destructive">Couldn&apos;t read this file. Choose it again.</span>;
  if (picked.rows === undefined) return "Reading…";
  const rows = plural(picked.rows, "row");
  if (picked.missingColumn) {
    return (
      <span className="text-status-amber-700 dark:text-status-amber-200">
        {rows} · no &ldquo;{picked.missingColumn}&rdquo; column, so these rows will be skipped
      </span>
    );
  }
  return rows;
}

type ImportStats = { categories: number; locations: number };

export function CsvImporter() {
  const [typesFile, setTypesFile] = useState<PickedFile | null>(null);
  const [assetsFile, setAssetsFile] = useState<PickedFile | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [steps, setSteps] = useState<Record<StepId, StepState>>(waitingSteps);
  const [skippedRows, setSkippedRows] = useState<string[]>([]);
  const [summary, setSummary] = useState<string | null>(null);

  useBeforeUnload(isImporting, "The import is still running. Leaving now stops it partway through.");

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

  function pickFile(kind: FileKind, file: File | null) {
    const setPicked = kind === "types" ? setTypesFile : setAssetsFile;
    if (!file) {
      setPicked(null);
      return;
    }
    if (!isCsvFile(file)) {
      notify.error(`“${file.name}” isn't a CSV. Export the sheet as .csv and try again.`);
      return;
    }
    setPicked({ file });
    const settle = (patch: Omit<PickedFile, "file">) =>
      setPicked((prev) => (prev?.file === file ? { file, ...patch } : prev));
    file.text().then(
      (text) => {
        const rows = parseCsvContent(text);
        const missingColumn = rows.length
          ? FILES[kind].columns.find((column) => !(column in rows[0]))
          : undefined;
        settle({ rows: rows.length, missingColumn });
      },
      () => settle({ readError: true }),
    );
  }

  function setStep(id: StepId, state: StepState) {
    setSteps((prev) => ({ ...prev, [id]: state }));
  }

  function addSkipped(message: string) {
    setSkippedRows((prev) => [...prev, message]);
  }

  async function ensureLocation(path: string, cache: Map<string, string>, stats: ImportStats) {
    const cleaned = path.trim();
    if (!cleaned) return undefined;
    const key = cleaned.toLowerCase();
    const existing = cache.get(key);
    if (existing) return existing;

    const created = await createLocation({ name: cleaned });
    cache.set(key, created);
    stats.locations += 1;
    return created;
  }

  async function ensureCategory(
    key: string,
    categories: Map<string, string>,
    labels: Map<string, string>,
    stats: ImportStats,
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
    stats.categories += 1;
    return normalizedKey;
  }

  async function runImport() {
    if (!typesFile || !assetsFile || isLoadingExistingData) return;

    setIsImporting(true);
    setSteps(waitingSteps());
    setSkippedRows([]);
    setSummary(null);

    let errorCount = 0;
    let currentStep: StepId = "read";
    const startStep = (id: StepId, detail?: string) => {
      currentStep = id;
      setStep(id, { status: "running", detail });
    };
    const stats: ImportStats = { categories: 0, locations: 0 };

    try {
      startStep("read");
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
      for (const item of existingItems) {
        if (!item.assetId) continue;
        assetRecordIdMap.set(item.assetId.toLowerCase(), item._id);
      }

      const [typesCsv, assetsCsv] = await Promise.all([typesFile.file.text(), assetsFile.file.text()]);
      const typeRows = parseCsvContent(typesCsv);
      const assetRows = parseCsvContent(assetsCsv);

      setStep("read", {
        status: "done",
        detail: `${plural(typeRows.length, "type row")} · ${plural(assetRows.length, "item row")}`,
      });

      startStep("types", `0 of ${typeRows.length.toLocaleString()}`);
      let typesAdded = 0;
      let typesUpdated = 0;
      let typeErrors = 0;
      for (const [index, row] of typeRows.entries()) {
        setStep("types", { status: "running", detail: `${index + 1} of ${typeRows.length.toLocaleString()}` });
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
              stats,
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
            typesUpdated += 1;
          } else {
            const createdTypeId = await createType(payload);
            typeCache.set(key, createdTypeId);
            existingTypesByName.set(key, { _id: createdTypeId, ...payload } as never);
            typesAdded += 1;
          }
        } catch (error) {
          errorCount += 1;
          typeErrors += 1;
          addSkipped(`Type “${rawName}”: ${getConvexErrorMessage(error)}`);
        }
      }
      setStep("types", {
        status: "done",
        detail: [
          `${typesAdded.toLocaleString()} added`,
          `${typesUpdated.toLocaleString()} updated`,
          stats.categories ? `${plural(stats.categories, "new category", "new categories")}` : null,
          typeErrors ? `${plural(typeErrors, "row")} skipped` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      });

      let importedItems = 0;
      let skippedItems = 0;
      let createdTypesFromAssets = 0;
      let itemErrors = 0;

      startStep("items", `0 of ${assetRows.length.toLocaleString()}`);
      for (const [index, row] of assetRows.entries()) {
        setStep("items", { status: "running", detail: `${index + 1} of ${assetRows.length.toLocaleString()}` });
        const assetId = canonicalizeAssetIdTag(row["Name"] ?? "");
        const fungibleRaw = normalizeTypeName(row["Fungible Inventory"] ?? "");
        const serial = row["Serial"] || "";
        if ((!assetId && !serial) || !fungibleRaw) continue;

        const rowLabel = assetId || serial;
        try {
          const { manufacturer, normalizedName } = stripLeadingBrand(fungibleRaw);
          const fungible = normalizedName;
          if (!fungible) continue;

          const existingRecordId = assetId ? assetRecordIdMap.get(assetId.toLowerCase()) : undefined;

          let typeId = typeCache.get(fungible.toLowerCase());
          if (!typeId) {
            const categoryKey = await ensureCategory(
              mapCategory(row["Rollup"] ?? ""),
              categoryCache,
              categoryLabels,
              stats,
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

          const storageLocationId = await ensureLocation(row["Storage Loc"] ?? "", locationCache, stats);
          const itemPayload = {
            assetId: assetId || undefined,
            serialNumber: serial || undefined,
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
          if (assetId) assetRecordIdMap.set(assetId.toLowerCase(), createdItemId);
          importedItems += 1;
        } catch (error) {
          errorCount += 1;
          itemErrors += 1;
          addSkipped(`Item “${rowLabel}”: ${getConvexErrorMessage(error)}`);
        }
      }
      setStep("items", {
        status: "done",
        detail: [
          `${importedItems.toLocaleString()} added`,
          `${skippedItems.toLocaleString()} updated`,
          createdTypesFromAssets ? `${plural(createdTypesFromAssets, "new type")} from item rows` : null,
          stats.locations ? `${plural(stats.locations, "new storage location")}` : null,
          itemErrors ? `${plural(itemErrors, "row")} skipped` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      });

      // Second pass to apply asset containment links from the "Contains" column.
      startStep("containers");
      let linksSet = 0;
      let linkErrors = 0;
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
            linksSet += 1;
          } catch (error) {
            errorCount += 1;
            linkErrors += 1;
            addSkipped(`${childAssetId} in ${containerAssetId}: ${getConvexErrorMessage(error)}`);
          }
        }
      }
      setStep("containers", {
        status: "done",
        detail: [
          linksSet || !linkErrors ? `${plural(linksSet, "unit")} linked to a container` : null,
          linkErrors ? `${plural(linkErrors, "link")} skipped` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      });

      const finished = `Import finished: ${plural(importedItems, "item")} added, ${skippedItems.toLocaleString()} updated.`;
      setSummary(
        errorCount > 0
          ? `${finished} ${plural(errorCount, "row")} skipped; see below.`
          : finished,
      );
      if (errorCount > 0) notify.warning(`Import finished with ${plural(errorCount, "skipped row")}.`);
      else notify.success(finished);
    } catch (error) {
      const message = getConvexErrorMessage(error);
      setStep(currentStep, { status: "failed", detail: message });
      setSummary(
        "Import stopped partway. Anything saved before the error is kept; run it again to finish, since matching rows update instead of duplicating.",
      );
      notify.error(`Import stopped: ${message}`);
    } finally {
      setIsImporting(false);
    }
  }

  const blocker = isImporting
    ? "Importing. Keep this tab open until it finishes."
    : isLoadingExistingData
      ? "Loading current inventory…"
      : !typesFile && !assetsFile
        ? "Add the types and items CSVs to start."
        : !typesFile
          ? "Add the types CSV to start."
          : !assetsFile
            ? "Add the items CSV to start."
            : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCsvIcon className="size-4 text-muted-foreground" aria-hidden />
            Files
          </CardTitle>
          <CardDescription>
            Export both sheets as CSV and add them here. Both are needed, since items point at their type by name.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {(["types", "items"] as const).map((kind) => {
              const picked = kind === "types" ? typesFile : assetsFile;
              return (
                <FileDropzone
                  key={kind}
                  id={FILES[kind].id}
                  label={FILES[kind].label}
                  description={FILES[kind].description}
                  accept=".csv,text/csv"
                  icon={FileCsvIcon}
                  file={picked?.file ?? null}
                  detail={fileDetail(picked)}
                  onFileChange={(file) => pickFile(kind, file)}
                  disabled={isImporting}
                  testId={`import-${kind}-file`}
                />
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              disabled={blocker !== null}
              aria-describedby={blocker ? "import-blocker" : undefined}
              onClick={() => void runImport()}
            >
              {isImporting ? <CircleNotchIcon className="animate-spin" /> : <UploadSimpleIcon />}
              {isImporting ? "Importing…" : "Run import"}
            </Button>
            {blocker ? (
              <p id="import-blocker" className="text-sm text-muted-foreground" data-testid="import-blocker">
                {blocker}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListChecksIcon className="size-4 text-muted-foreground" aria-hidden />
            Import steps
          </CardTitle>
          <CardDescription>In the order they run. Rows already in inventory are updated, not duplicated.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {summary ? (
            <p className="text-sm" data-testid="import-summary" aria-live="polite">
              {summary}
            </p>
          ) : null}
          <RowList joined testId="import-steps">
            {STEPS.map((step, index) => {
              const state = steps[step.id];
              const status = STEP_STATUS[state.status];
              return (
                <li
                  key={step.id}
                  className="flex items-center gap-3 px-3 py-2.5 text-sm"
                  data-testid={`import-step-${step.id}`}
                  data-status={state.status}
                >
                  <span className="w-4 shrink-0 text-muted-foreground tabular-nums">{index + 1}</span>
                  <RowText
                    title={step.title}
                    detail={
                      state.status === "failed" ? (
                        <span className="whitespace-normal text-destructive">{state.detail}</span>
                      ) : (
                        (state.detail ?? (state.status === "waiting" ? step.waiting : undefined))
                      )
                    }
                  />
                  <RowCell className="w-24">
                    <StatusPill tone={status.tone}>{status.label}</StatusPill>
                  </RowCell>
                </li>
              );
            })}
          </RowList>

          {skippedRows.length > 0 ? (
            <section className="space-y-2" data-testid="import-skipped">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {plural(skippedRows.length, "row")} skipped
              </h3>
              <ul className="max-h-64 divide-y overflow-y-auto border text-sm">
                {skippedRows.map((message, index) => (
                  <li key={`${index}-${message}`} className="px-3 py-2">
                    {message}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
