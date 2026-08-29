"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormContext, useFormState } from "react-hook-form";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Input } from "@/components/ui/input";
import type { BookingRequestFormValues } from "@/lib/validations/booking-request";

type HostMatch = {
  groupId: string;
  name: string;
  type: string;
  sponsorType: string;
};

/**
 * Search existing host orgs, pick a match, or keep the typed name as a new org.
 */
export function OrganizationSearchField() {
  const { control, watch, setValue } = useFormContext<BookingRequestFormValues>();
  const { errors } = useFormState({ control, name: "organization" });
  const organization = watch("organization") ?? "";
  const invoiceGroupId = watch("invoiceGroupId") ?? "";
  const [query, setQuery] = useState(organization);
  const [debounced, setDebounced] = useState(organization);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(query.trim()), 200);
    return () => window.clearTimeout(handle);
  }, [query]);

  const results = useQuery(
    api.eventRequests.searchHostOrganizationsPublic,
    debounced.length >= 2 ? { query: debounced, limit: 8 } : "skip",
  );

  const matches = useMemo(() => results ?? [], [results]);
  const selectedMatch = matches.find((row) => row.groupId === invoiceGroupId);
  const organizationError = errors.organization?.message;

  function selectMatch(match: HostMatch) {
    setValue("invoiceGroupId", match.groupId, { shouldDirty: true, shouldValidate: true });
    setValue("organization", match.name, { shouldDirty: true, shouldValidate: true });
    setValue(
      "sponsorType",
      match.sponsorType as BookingRequestFormValues["sponsorType"],
      { shouldDirty: true, shouldValidate: true },
    );
    setQuery(match.name);
  }

  function onQueryChange(next: string) {
    setQuery(next);
    if (invoiceGroupId) {
      setValue("invoiceGroupId", "", { shouldDirty: true });
    }
    setValue("organization", next, { shouldDirty: true });
  }

  return (
    <div className="space-y-2" data-testid="booking-org-search">
      <label className="text-sm font-medium" htmlFor="booking-organization">
        Organization / group name
      </label>
      <Input
        id="booking-organization"
        autoFocus
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Search or type a new name"
        aria-invalid={Boolean(organizationError)}
      />
      {invoiceGroupId && selectedMatch ? (
        <p className="text-xs text-muted-foreground">
          Matched existing host: <span className="font-medium">{selectedMatch.name}</span>
        </p>
      ) : null}
      {matches.length > 0 && !invoiceGroupId ? (
        <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-1">
          {matches.map((match) => (
            <li key={match.groupId}>
              <button
                type="button"
                className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => selectMatch(match)}
              >
                <span className="font-medium">{match.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">{match.type}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {organizationError ? <p className="text-xs text-destructive">{organizationError}</p> : null}
    </div>
  );
}
