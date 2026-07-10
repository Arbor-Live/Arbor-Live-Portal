"use client";
import { useState } from "react";
import Papa from "papaparse";
import { useConvex, useMutation } from "convex/react";
import { api } from "../../../../packages/backend/convex/_generated/api";

/**
 * OrganizatoinCSVImporter is a React component that allows users to import 
 * organization data from a CSV file. It uses the PapaParse library to parse 
 * the CSV file and the Convex API to batch import the cleaned organization 
 * data into the backend database.
 */
export function OrganizationCSVImporter() {
  const [isImporting, setIsImporting] = useState(false);
  const batchImport = useMutation(api.organizationImporter.batchImport);

  //removes notion links from the string and trims whitespace, returns undefined if val is undefined
  const cleanNotionString = (val: string | undefined) => {
    if (!val) return undefined;
    return val.replace(/\s*\(https:\/\/app\.notion\.com\/.*?\)/g, "").trim();
  };

  //handleFileUpload is an async function that processes the uploaded CSV file, cleans the data, and calls the batchImport mutation to save the organizations to the database.
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const cleanedOrganizations = results.data.map((row: any) => {

            const rawType = (row["Type"] || "band").toLowerCase().trim();
            const safeType = rawType === "dj" ? "dj"
              : rawType === "arbor_internal" ? "arbor_internal"
                : "band";

            return {
              displayName: row["Artist Name"] || row["Band Name"] || "Unknown",
              orgCreationTime: new Date(row["Created time"]).getTime() || Date.now(),
              numShowsRan: parseInt(row["Shows Ran"]) || 0,
              performerHourlyRateUsd: parseFloat(row["Hourly Rate"]) || 0,

              genres: row["Genre"] ? row["Genre"].split(",").map((g: string) => g.trim()) : [],
              bandMembers: row["Members"] ? row["Members"].split(",").map((m: string) => cleanNotionString(m.trim())) : [],

              oneLiner: row["One Liner Headline"] || undefined,
              demoURL: row["Demo"] || undefined,
              mainContactName: row["Main Contact Name"] || undefined,
              mainContactEmail: row["Main Contact Email"] || undefined,
              mainContactPhone: row["Main Contact Phone"] || undefined,
              techRiderURL: row["Tech Rider"] || undefined,
              status: row["Status"] || "unknown",
              organizationType: safeType,
            };
          });

          const response = await batchImport({ organizations: cleanedOrganizations });

          // FIX 5: Use backticks for variable injection
          alert(`Success! Imported ${response.count} organizations.`);
          window.location.reload(); // Refresh the page to reflect the new data
        } catch (error) {
          console.error("Import failed:", error);
          alert("Something went wrong during the import. Check the console.");
        } finally {
          setIsImporting(false);
          event.target.value = '';
        }
      },
    });
  };

  return (
    <div className="p-4 border-gray-700 rounded-md bg-gray-900 mt-4">
      <h3 className="text-lg font-semibold mb-2">Import Organizations from CSV</h3>
      <input
        type="file"
        accept=".csv"
        // FIX 6: Wired the physical button to your function!
        onChange={handleFileUpload}
        disabled={isImporting}
        className="text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-gray-700 file:text-white hover:file:bg-gray-600"
      />
      {isImporting && <p className="text-green-400 mt-2">Importing...</p>}
    </div>
  );
}
