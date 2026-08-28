"use client";

import { useState } from "react";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { CopyIcon } from "@phosphor-icons/react";
import { FormControl, FormField, FormItem } from "@/components/ui/form";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatBandPublicArtistUrl } from "@/lib/band-public-link";
import { notify } from "@/lib/notify";

export function BandPublicListingToggle<T extends FieldValues>({
  control,
  listingFieldName = "publicListing" as FieldPath<T>,
}: {
  control: Control<T>;
  listingFieldName?: FieldPath<T>;
}) {
  return (
    <FormField
      control={control}
      name={listingFieldName}
      render={({ field }) => (
        <FormItem className="space-y-0">
          <FormControl>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              spacing={0}
              value={field.value ? "public" : "internal"}
              onValueChange={(value) => {
                if (value) field.onChange(value === "public");
              }}
            >
              <ToggleGroupItem value="internal" aria-label="Internal only">
                Internal only
              </ToggleGroupItem>
              <ToggleGroupItem value="public" aria-label="Public listing">
                Public
              </ToggleGroupItem>
            </ToggleGroup>
          </FormControl>
        </FormItem>
      )}
    />
  );
}

export function BandPublicArtistLinkCopy({
  publicSlug,
  disabled,
}: {
  publicSlug?: string;
  disabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const url = formatBandPublicArtistUrl(publicSlug ?? "");

  async function onCopy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      notify.success("Artist link copied.");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      notify.error("Could not copy link.");
    }
  }

  if (!url) {
    return (
      <p className="text-sm text-muted-foreground">
        Add a URL slug to get your public artist link.
      </p>
    );
  }

  return (
    <InputGroup>
      <InputGroupInput readOnly value={url} aria-label="Public artist link" />
      <InputGroupAddon align="inline-end">
        <InputGroupButton disabled={disabled} onClick={() => void onCopy()}>
          <CopyIcon data-icon="inline-start" />
          {copied ? "Copied" : "Copy link"}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
