"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { NotePencilIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { InvoiceDraft } from "./use-invoice-draft";

/**
 * Terms templates (at least one is required to send a booking-request quote),
 * extra terms, and notes. The catalog loads on first hover or focus.
 */
export function InvoiceTermsCard({ draft }: { draft: InvoiceDraft }) {
  const [catalogEnabled, setCatalogEnabled] = useState(false);
  const { fields, setField } = draft;
  const termsDefinitions = useQuery(
    api.invoiceTerms.list,
    catalogEnabled || fields.termsIds.length > 0 ? { activeOnly: true } : "skip",
  );
  const enableCatalog = () => setCatalogEnabled(true);

  return (
    <Card data-testid="invoice-terms-card" onFocusCapture={enableCatalog} onMouseEnter={enableCatalog}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <NotePencilIcon className="size-4 text-muted-foreground" aria-hidden />
          <span>Terms</span>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          The client agrees to these when approving. Pick at least one before sending.
        </p>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm md:grid-cols-2">
        <div className="space-y-2">
          <span className="text-xs font-medium">Templates</span>
          <div className="max-h-40 space-y-1.5 overflow-y-auto border p-2">
            {termsDefinitions === undefined ? (
              <p className="text-muted-foreground">
                {catalogEnabled || fields.termsIds.length > 0 ? "Loading terms…" : "Hover to load terms templates."}
              </p>
            ) : termsDefinitions.length === 0 ? (
              <p className="text-muted-foreground">No active terms templates. Add them in Ops Center settings.</p>
            ) : (
              termsDefinitions.map((row) => {
                const checked = fields.termsIds.includes(row._id);
                return (
                  <label key={row._id} className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-0.5 shrink-0"
                      checked={checked}
                      onChange={() =>
                        setField(
                          "termsIds",
                          checked ? fields.termsIds.filter((id) => id !== row._id) : [...fields.termsIds, row._id],
                        )
                      }
                    />
                    <span className="min-w-0 break-words">
                      {row.label} ({row.version})
                    </span>
                  </label>
                );
              })
            )}
          </div>
          <Label htmlFor="invoice-additional-terms" className="text-xs">
            Additional terms
          </Label>
          <Textarea
            id="invoice-additional-terms"
            className="min-h-16"
            placeholder="Anything specific to this quote"
            value={fields.additionalTermsMarkdown}
            onChange={(event) => setField("additionalTermsMarkdown", event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="invoice-notes" className="text-xs">
            Notes
          </Label>
          <Textarea
            id="invoice-notes"
            className="min-h-32"
            value={fields.notes}
            onChange={(event) => setField("notes", event.target.value)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
