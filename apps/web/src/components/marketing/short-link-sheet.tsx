"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { CopyIcon } from "@phosphor-icons/react";
import { EventSelect } from "@/components/events/event-select";
import { TextFormField } from "@/components/forms/text-form-field";
import {
  DetailSheet,
  DetailSheetFooter,
  DetailSheetHeader,
  SheetField,
  SheetFields,
  SheetSection,
} from "@/components/list-page";
import { StatusPill, type Tone } from "@/components/page-header";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useConvexForm } from "@/hooks/use-convex-form";
import { api, type Id } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { formatRelativeTime, pacificDateKey } from "@/lib/format";
import { notify } from "@/lib/notify";
import {
  formatExpiresAt,
  formatShortLinkUrl,
  shortLinkExpiryModeLabels,
  shortLinkFormSchema,
  slugifyShortLinkLabel,
  type ShortLinkExpiryMode,
  type ShortLinkFormValues,
} from "@/lib/validations/short-links";

export const SHORT_LINK_BASE_URL = process.env.NEXT_PUBLIC_SHORT_LINK_BASE_URL?.trim() || "https://arbor.st";

export type ShortLinkRow = {
  _id: Id<"shortLinks">;
  slug: string;
  label: string;
  destinationUrl: string;
  enabled: boolean;
  eventId: Id<"events"> | null;
  eventTitle: string | null;
  expiryMode: ShortLinkExpiryMode;
  expiresAt: number | null;
  clickCount: number;
  lastClickedAt: number | null;
  status: "active" | "disabled" | "expired";
};

export const LINK_STATUS_LABELS: Record<ShortLinkRow["status"], string> = {
  active: "Active",
  expired: "Expired",
  disabled: "Disabled",
};

export const LINK_STATUS_TONES: Record<ShortLinkRow["status"], Tone> = {
  active: "emerald",
  expired: "amber",
  disabled: "neutral",
};

export async function copyShortLink(slug: string) {
  try {
    await navigator.clipboard.writeText(formatShortLinkUrl(slug, SHORT_LINK_BASE_URL));
    notify.success("Short link copied.");
  } catch {
    notify.error("Could not copy the link.");
  }
}

const EMPTY: ShortLinkFormValues = {
  slug: "",
  label: "",
  destinationUrl: "",
  enabled: true,
  eventId: "",
  expiryMode: "none",
  manualExpiresAtDate: "",
};

function toValues(link: ShortLinkRow): ShortLinkFormValues {
  return {
    slug: link.slug,
    label: link.label,
    destinationUrl: link.destinationUrl,
    enabled: link.enabled,
    eventId: link.eventId ?? "",
    expiryMode: link.expiryMode,
    manualExpiresAtDate: link.expiryMode === "manual" && link.expiresAt != null ? pacificDateKey(link.expiresAt) : "",
  };
}

/**
 * Create or edit a short link. Pass `link: null` with `open` for a new one;
 * `defaults` prefill it (the event page sets the event and its public page).
 * Closes after a successful save or delete.
 */
export function ShortLinkSheet({
  open,
  link,
  defaults,
  onOpenChange,
}: {
  open: boolean;
  link: ShortLinkRow | null;
  defaults?: Partial<ShortLinkFormValues>;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <DetailSheet open={open} onOpenChange={onOpenChange} testId="short-link-sheet">
      {open ? (
        <ShortLinkSheetBody
          key={link?._id ?? "new"}
          link={link}
          defaults={defaults}
          onClose={() => onOpenChange(false)}
        />
      ) : null}
    </DetailSheet>
  );
}

function ShortLinkSheetBody({
  link,
  defaults,
  onClose,
}: {
  link: ShortLinkRow | null;
  defaults?: Partial<ShortLinkFormValues>;
  onClose: () => void;
}) {
  const { confirm } = useAppDialog();
  const createLink = useMutation(api.shortLinks.create);
  const updateLink = useMutation(api.shortLinks.update);
  const removeLink = useMutation(api.shortLinks.remove);
  // A new link's slug follows its label until the slug is edited by hand.
  const [slugTouched, setSlugTouched] = useState(Boolean(link));

  const form = useConvexForm<ShortLinkFormValues>({
    schema: shortLinkFormSchema,
    defaultValues: link ? toValues(link) : { ...EMPTY, ...defaults },
    mode: "onTouched",
  });
  const labelValue = form.watch("label");
  const slugValue = form.watch("slug");
  const expiryMode = form.watch("expiryMode");

  useEffect(() => {
    if (!slugTouched) {
      form.setValue("slug", slugifyShortLinkLabel(labelValue ?? ""), { shouldDirty: true });
    }
  }, [labelValue, slugTouched, form]);

  const onSave = form.submitMutation(
    async (values: ShortLinkFormValues) => {
      const payload = {
        slug: values.slug,
        label: values.label || undefined,
        destinationUrl: values.destinationUrl,
        enabled: values.enabled,
        eventId: values.eventId ? (values.eventId as Id<"events">) : undefined,
        expiryMode: values.expiryMode,
        manualExpiresAtDate: values.expiryMode === "manual" ? values.manualExpiresAtDate : undefined,
      };
      if (link) await updateLink({ id: link._id, ...payload });
      else await createLink(payload);
    },
    {
      onSuccess: () => {
        notify.success(link ? "Short link updated." : "Short link created.");
        onClose();
      },
    },
  );

  async function onDelete() {
    if (!link) return;
    const ok = await confirm({
      title: `Delete ${formatShortLinkUrl(link.slug, SHORT_LINK_BASE_URL)}?`,
      description: "The short URL stops redirecting and falls through to the main site. This can't be undone.",
      destructive: true,
      confirmLabel: "Delete short link",
    });
    if (!ok) return;
    try {
      await removeLink({ id: link._id });
      notify.success("Short link deleted.");
      onClose();
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    }
  }

  const saving = form.saveStatus === "saving";

  return (
    <Form {...form}>
      <form className="flex min-h-full flex-col" onSubmit={form.handleSubmit(onSave)} data-testid="short-link-form">
        <DetailSheetHeader
          title={link ? link.label || `/${link.slug}` : "New short link"}
          pill={
            link ? (
              <StatusPill tone={LINK_STATUS_TONES[link.status]} className="h-6">
                {LINK_STATUS_LABELS[link.status]}
              </StatusPill>
            ) : null
          }
          description={formatShortLinkUrl(slugValue || "your-slug", SHORT_LINK_BASE_URL)}
        />

        <SheetSection title="Link">
          <TextFormField name="label" label="Label" placeholder="Spring show poster" />
          <FormField
            name="slug"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Slug</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    onFocus={() => setSlugTouched(true)}
                    placeholder="spring-show"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <TextFormField
            name="destinationUrl"
            label="Destination URL"
            placeholder="https://arborlive.stanford.edu/work/spring-show"
          />
          <div className="space-y-2">
            <Label>Linked event (optional)</Label>
            <EventSelect
              value={form.watch("eventId") ?? ""}
              onChange={(eventId) => form.setValue("eventId", eventId, { shouldDirty: true })}
              placeholder="Search events…"
              emptyLabel="No linked event"
            />
          </div>
        </SheetSection>

        <SheetSection title="When it works">
          <FormField
            name="expiryMode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Expiry</FormLabel>
                <Select value={field.value} onValueChange={(value: ShortLinkExpiryMode) => field.onChange(value)}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.entries(shortLinkExpiryModeLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          {expiryMode === "manual" ? (
            <div className="space-y-2">
              <Label>Expiry date</Label>
              <DatePickerField
                value={form.watch("manualExpiresAtDate") ?? ""}
                onChange={(value) => form.setValue("manualExpiresAtDate", value, { shouldDirty: true })}
                placeholder="Select expiry date"
              />
            </div>
          ) : null}
          {link?.expiresAt != null ? (
            <p className="text-xs text-muted-foreground">Expires {formatExpiresAt(link.expiresAt)}</p>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label htmlFor="short-link-enabled">Enabled</Label>
              <p className="text-xs text-muted-foreground">Disabled links pass through to the main site path.</p>
            </div>
            <Switch
              id="short-link-enabled"
              checked={form.watch("enabled")}
              onCheckedChange={(checked) => form.setValue("enabled", checked, { shouldDirty: true })}
            />
          </div>
        </SheetSection>

        {link ? (
          <SheetSection title="Clicks">
            <SheetFields>
              <SheetField label="Total">
                <span className="tabular-nums">{link.clickCount}</span>
              </SheetField>
              <SheetField label="Last click">
                {link.lastClickedAt ? formatRelativeTime(link.lastClickedAt) : "Not clicked yet"}
              </SheetField>
            </SheetFields>
          </SheetSection>
        ) : null}

        <DetailSheetFooter
          start={
            link ? (
              <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => void onDelete()}>
                Delete
              </Button>
            ) : undefined
          }
        >
          {form.saveError ? (
            <span className="max-w-48 text-xs text-destructive" role="alert">
              {form.saveError}
            </span>
          ) : null}
          <Button type="button" size="sm" variant="outline" disabled={!slugValue.trim()} onClick={() => void copyShortLink(slugValue)}>
            <CopyIcon />
            Copy link
          </Button>
          <Button type="submit" size="sm" disabled={saving || (Boolean(link) && !form.formState.isDirty)}>
            {saving ? "Saving…" : link ? "Save changes" : "Create short link"}
          </Button>
        </DetailSheetFooter>
      </form>
    </Form>
  );
}
