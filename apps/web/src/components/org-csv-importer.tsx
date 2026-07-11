"use client";

import { useId, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { FileCsvIcon, UploadSimpleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type OrganizationType = "arbor_internal" | "band" | "dj";

type ImportOrganization = {
  displayName: string;
  orgCreationTime?: number;
  numShowsRan?: number;
  performerHourlyRateUsd?: number;
  genres?: string[];
  bandMembers?: string[];
  oneLiner?: string;
  demoURL?: string;
  mainContactName?: string;
  mainContactEmail?: string;
  mainContactPhone?: string;
  techRiderURL?: string;
  status?: string;
  organizationType: OrganizationType;
};

type ImportPreview = {
  organizations: ImportOrganization[];
  skippedRows: number;
  fileName: string;
};

function cleanText(value: string | undefined) {
  const cleaned = value?.replace(/\s*\(https:\/\/app\.notion\.com\/.*?\)/g, "").trim();
  return cleaned || undefined;
}

function optionalNumber(value: string | undefined) {
  if (!value?.trim()) return undefined;
  const parsed = Number.parseFloat(value.replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function optionalDate(value: string | undefined) {
  if (!value?.trim()) return undefined;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
}

function splitList(value: string | undefined) {
  return value
    ?.split(",")
    .map((item) => cleanText(item))
    .filter((item): item is string => Boolean(item));
}

function organizationType(value: string | undefined): OrganizationType {
  switch (value?.trim().toLowerCase()) {
    case "dj":
      return "dj";
    case "arbor_internal":
      return "arbor_internal";
    default:
      return "band";
  }
}

function parseCsv(content: string): Record<string, string>[] {
  const rows: string[][] = [];
  let value = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];
    if (char === '"') {
      if (inQuotes && next === '"') { value += '"'; index += 1; } else inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(value); value = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value); value = "";
      if (row.some((entry) => entry.trim())) rows.push(row);
      row = [];
    } else value += char;
  }
  if (value || row.length) {
    row.push(value);
    if (row.some((entry) => entry.trim())) rows.push(row);
  }
  const headers = (rows.shift() ?? []).map((header) => header.trim());
  return rows.map((entries) => Object.fromEntries(headers.map((header, index) => [header, entries[index]?.trim() ?? ""])));
}

async function readOrganizationCsv(file: File): Promise<ImportPreview> {
  const parsed = parseCsv(await file.text());
  let skippedRows = 0;
  const organizations = parsed.flatMap((row) => {
    const displayName = cleanText(row["Artist Name"] ?? row["Band Name"]);
    if (!displayName) {
      skippedRows += 1;
      return [];
    }
    return [{
      displayName,
      orgCreationTime: optionalDate(row["Created time"]),
      numShowsRan: optionalNumber(row["Shows Ran"]),
      performerHourlyRateUsd: optionalNumber(row["Hourly Rate"]),
      genres: splitList(row["Genre"]),
      bandMembers: splitList(row["Members"]),
      oneLiner: cleanText(row["One Liner Headline"]),
      demoURL: cleanText(row["Demo"]),
      mainContactName: cleanText(row["Main Contact Name"]),
      mainContactEmail: cleanText(row["Main Contact Email"]),
      mainContactPhone: cleanText(row["Main Contact Phone"]),
      techRiderURL: cleanText(row["Tech Rider"]),
      status: cleanText(row["Status"]) ?? "unknown",
      organizationType: organizationType(row["Type"]),
    }];
  });
  return { organizations, skippedRows, fileName: file.name };
}

export function OrganizationCSVImporter() {
  const inputId = useId();
  const batchImport = useMutation(api.organizationImporter.batchImport);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [inputKey, setInputKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const previewRows = useMemo(() => preview?.organizations.slice(0, 5) ?? [], [preview]);

  async function onSelectFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError(null);
    setResult(null);
    if (!file) {
      setPreview(null);
      return;
    }
    try {
      const nextPreview = await readOrganizationCsv(file);
      if (!nextPreview.organizations.length) {
        setPreview(null);
        setError("No organizations were found. Include an Artist Name or Band Name column.");
        return;
      }
      setPreview(nextPreview);
    } catch (parseError) {
      setPreview(null);
      setError(getConvexErrorMessage(parseError, "The CSV could not be read."));
    }
  }

  async function runImport() {
    if (!preview) return;
    setIsImporting(true);
    setError(null);
    setResult(null);
    try {
      const response = await batchImport({ organizations: preview.organizations });
      setResult(`${response.count} organization${response.count === 1 ? "" : "s"} imported or updated.`);
      setPreview(null);
      setInputKey((key) => key + 1);
    } catch (importError) {
      setError(getConvexErrorMessage(importError, "The organization import failed."));
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><FileCsvIcon /> Import organizations</CardTitle>
        <CardDescription>
          Import bands, DJs, and their profile details from a Notion CSV. Existing organizations are updated by name.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor={inputId}>Organization CSV</Label>
          <Input key={inputKey} id={inputId} type="file" accept=".csv,text/csv" disabled={isImporting} onChange={(event) => void onSelectFile(event)} />
          <p className="text-xs text-muted-foreground">Recognized columns include Artist Name, Band Name, Type, Genre, Members, and contact details.</p>
        </div>

        {preview ? (
          <div className="space-y-3 border p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="font-medium">Ready to import {preview.organizations.length} organizations</p>
                <p className="text-xs text-muted-foreground">{preview.fileName}{preview.skippedRows ? ` · ${preview.skippedRows} blank row${preview.skippedRows === 1 ? "" : "s"} skipped` : ""}</p>
              </div>
              <Button type="button" onClick={() => void runImport()} disabled={isImporting}>
                <UploadSimpleIcon data-icon="inline-start" />
                {isImporting ? "Importing…" : "Confirm import"}
              </Button>
            </div>
            <div className="divide-y border text-sm">
              {previewRows.map((organization) => (
                <div key={organization.displayName} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="font-medium">{organization.displayName}</span>
                  <span className="text-xs capitalize text-muted-foreground">{organization.organizationType.replace("_", " ")}</span>
                </div>
              ))}
            </div>
            {preview.organizations.length > previewRows.length ? <p className="text-xs text-muted-foreground">Plus {preview.organizations.length - previewRows.length} more organizations.</p> : null}
          </div>
        ) : null}

        {error ? <Alert variant="destructive"><WarningCircleIcon /><AlertTitle>Import not completed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        {result ? <Alert><AlertTitle>Import complete</AlertTitle><AlertDescription>{result}</AlertDescription></Alert> : null}
      </CardContent>
    </Card>
  );
}
