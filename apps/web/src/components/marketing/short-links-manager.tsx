"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { CopyIcon } from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { EventSelect } from "@/components/events/event-select";
import { TextFormField } from "@/components/forms/text-form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConvexForm } from "@/hooks/use-convex-form";
import { pacificDateKey } from "@/lib/format";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import {
  formatExpiresAt,
  formatRelativeTime,
  formatShortLinkUrl,
  shortLinkExpiryModeLabels,
  shortLinkFormSchema,
  slugifyShortLinkLabel,
  type ShortLinkFormValues,
  type ShortLinkExpiryMode,
} from "@/lib/validations/short-links";
import { cn } from "@/lib/utils";

const SHORT_LINK_BASE_URL =
  process.env.NEXT_PUBLIC_SHORT_LINK_BASE_URL?.trim() || "https://arbor.st";

const defaultValues: ShortLinkFormValues = {
  slug: "",
  label: "",
  destinationUrl: "",
  enabled: true,
  eventId: "",
  expiryMode: "none",
  manualExpiresAtDate: "",
};

function StatusBadge({ status }: { status: "active" | "disabled" | "expired" }) {
  if (status === "active") {
    return (
      <span className="rounded-none border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs text-primary">
        Active
      </span>
    );
  }
  if (status === "expired") {
    return (
      <span className="rounded-none border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">
        Expired
      </span>
    );
  }
  return (
    <span className="rounded-none border px-2 py-0.5 text-xs text-muted-foreground">Disabled</span>
  );
}

export function ShortLinksManager() {
  const links = useQuery(api.shortLinks.list, {});
  const createLink = useMutation(api.shortLinks.create);
  const updateLink = useMutation(api.shortLinks.update);
  const removeLink = useMutation(api.shortLinks.remove);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [search, setSearch] = useState("");

  type AdminLink = NonNullable<typeof links>[number];

  const form = useConvexForm<ShortLinkFormValues>({
    schema: shortLinkFormSchema,
    defaultValues,
    mode: "onTouched",
  });

  const labelValue = form.watch("label");
  const expiryMode = form.watch("expiryMode");
  const slugValue = form.watch("slug");

  useEffect(() => {
    if (!slugTouched) {
      form.setValue("slug", slugifyShortLinkLabel(labelValue ?? ""), { shouldDirty: true });
    }
  }, [labelValue, slugTouched, form]);

  const filteredLinks = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !links) return links ?? [];
    return links.filter(
      (link) =>
        link.slug.toLowerCase().includes(q) ||
        link.label.toLowerCase().includes(q) ||
        link.destinationUrl.toLowerCase().includes(q),
    );
  }, [links, search]);

  const resetToLink = (link: AdminLink) => {
    form.reset({
      slug: link.slug,
      label: link.label,
      destinationUrl: link.destinationUrl,
      enabled: link.enabled,
      eventId: link.eventId ?? "",
      expiryMode: link.expiryMode,
      manualExpiresAtDate: "",
    });
    setSlugTouched(true);
    if (link.expiryMode === "manual" && link.expiresAt != null) {
      form.setValue(
        "manualExpiresAtDate",
        pacificDateKey(link.expiresAt),
      );
    }
  };

  const startNewLink = () => {
    setSelectedId(null);
    setSlugTouched(false);
    form.reset(defaultValues);
  };

  const selectLink = (id: string) => {
    setSelectedId(id);
    const link = links?.find((row) => row._id === id);
    if (link) resetToLink(link);
  };

  const onSave = form.submitMutation(
    async (values) => {
      const payload = {
        slug: values.slug,
        label: values.label || undefined,
        destinationUrl: values.destinationUrl,
        enabled: values.enabled,
        eventId: values.eventId ? (values.eventId as Id<"events">) : undefined,
        expiryMode: values.expiryMode,
        manualExpiresAtDate:
          values.expiryMode === "manual" ? values.manualExpiresAtDate : undefined,
      };
      if (selectedId) {
        await updateLink({ id: selectedId as Id<"shortLinks">, ...payload });
        return values;
      }
      const createdId = await createLink(payload);
      setSelectedId(createdId);
      setSlugTouched(Boolean(values.slug));
      return values;
    },
    {
      onSuccess: (values) => {
        form.reset(values);
        notify.success(selectedId ? "Short link updated." : "Short link created.");
      },
    },
  );

  async function onDelete() {
    if (!selectedId) return;
    if (!window.confirm("Delete this short link? This cannot be undone.")) return;
    try {
      await removeLink({ id: selectedId as Id<"shortLinks"> });
      startNewLink();
      notify.success("Short link deleted.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    }
  }

  async function copyPublicUrl() {
    const slug = form.getValues("slug");
    if (!slug.trim()) return;
    try {
      await navigator.clipboard.writeText(formatShortLinkUrl(slug, SHORT_LINK_BASE_URL));
      notify.success("Short link copied to clipboard.");
    } catch {
      notify.error("Could not copy link.");
    }
  }

  const selectedLink = links?.find((row) => row._id === selectedId);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(240px,320px)_1fr]">
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Short links</CardTitle>
            <Button type="button" size="sm" variant="outline" onClick={startNewLink}>
              New
            </Button>
          </div>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search slug, label, or URL…"
          />
        </CardHeader>
        <CardContent className="space-y-2">
          {links === undefined ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : null}
          {filteredLinks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No short links yet.</p>
          ) : null}
          {filteredLinks.map((link) => (
            <button
              key={link._id}
              type="button"
              onClick={() => selectLink(link._id)}
              className={cn(
                "w-full rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/50",
                selectedId === link._id && "border-primary bg-muted/40",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium leading-snug">{link.label || link.slug}</p>
                <StatusBadge status={link.status} />
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">/{link.slug}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {link.clickCount} click{link.clickCount === 1 ? "" : "s"}
                {link.lastClickedAt ? ` · last ${formatRelativeTime(link.lastClickedAt)}` : ""}
              </p>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {selectedId ? "Edit short link" : "New short link"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {form.saveError ? (
            <Alert className="mb-4">
              <AlertDescription>{form.saveError}</AlertDescription>
            </Alert>
          ) : null}

          <Form {...form}>
            <form className="space-y-4" onSubmit={form.handleSubmit(onSave)}>
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
                    <p className="text-sm text-muted-foreground">
                      Public URL: {formatShortLinkUrl(slugValue || "your-slug", SHORT_LINK_BASE_URL)}
                    </p>
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

              <FormField
                name="expiryMode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expiry</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(value: ShortLinkExpiryMode) =>
                        field.onChange(value)
                      }
                    >
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
                    onChange={(value) =>
                      form.setValue("manualExpiresAtDate", value, { shouldDirty: true })
                    }
                    placeholder="Select expiry date"
                  />
                </div>
              ) : null}

              {selectedLink && selectedLink.expiresAt != null ? (
                <p className="text-sm text-muted-foreground">
                  Expires {formatExpiresAt(selectedLink.expiresAt)}
                </p>
              ) : null}

              <FormField
                name="enabled"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-md border px-3 py-2">
                    <div>
                      <FormLabel>Enabled</FormLabel>
                      <p className="text-sm text-muted-foreground">
                        Disabled links pass through to the main site path.
                      </p>
                    </div>
                    <FormControl>
                      <input
                        type="checkbox"
                        checked={field.value}
                        onChange={(event) => field.onChange(event.target.checked)}
                        className="size-4 rounded border"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {selectedLink ? (
                <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
                  <p>
                    {selectedLink.clickCount} click{selectedLink.clickCount === 1 ? "" : "s"}
                    {selectedLink.lastClickedAt
                      ? ` · last clicked ${formatRelativeTime(selectedLink.lastClickedAt)}`
                      : ""}
                  </p>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? "Saving…" : "Save"}
                </Button>
                <Button type="button" variant="outline" onClick={copyPublicUrl}>
                  <CopyIcon className="mr-2 size-4" />
                  Copy link
                </Button>
                {selectedId ? (
                  <Button type="button" variant="destructive" onClick={onDelete}>
                    Delete
                  </Button>
                ) : null}
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
