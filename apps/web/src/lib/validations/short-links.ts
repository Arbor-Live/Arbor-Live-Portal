import { z } from "zod";
import { formatDate, formatDateTime } from "@/lib/format";

export const shortLinkExpiryModes = ["none", "manual", "event_plus_30_days"] as const;

export type ShortLinkExpiryMode = (typeof shortLinkExpiryModes)[number];

export const shortLinkExpiryModeLabels: Record<ShortLinkExpiryMode, string> = {
  none: "Never",
  manual: "Custom date",
  event_plus_30_days: "30 days after linked event",
};

export const shortLinkFormSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(1, "Slug is required.")
      .max(200, "Slug must be 200 characters or fewer.")
      .refine((value) => !value.includes(".."), "Slug cannot contain '..'.")
      .refine((value) => !value.includes("://"), "Slug cannot contain a URL scheme."),
    label: z.string().trim().optional(),
    destinationUrl: z
      .string()
      .trim()
      .min(1, "Destination URL is required.")
      .url("Destination URL must be a valid URL.")
      .refine(
        (value) => value.startsWith("https://") || /^http:\/\/(localhost|127\.0\.0\.1)/.test(value),
        "Destination URL must use https://.",
      ),
    enabled: z.boolean(),
    eventId: z.string().optional(),
    expiryMode: z.enum(shortLinkExpiryModes),
    manualExpiresAtDate: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    if (values.expiryMode === "manual" && !values.manualExpiresAtDate?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Expiry date is required for custom expiry.",
        path: ["manualExpiresAtDate"],
      });
    }
    if (values.expiryMode === "event_plus_30_days" && !values.eventId?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Linked event is required for event-based expiry.",
        path: ["eventId"],
      });
    }
  });

export type ShortLinkFormValues = z.infer<typeof shortLinkFormSchema>;

export function slugifyShortLinkLabel(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-/]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function formatShortLinkUrl(slug: string, baseUrl = "https://arbor.st") {
  const base = baseUrl.replace(/\/+$/, "");
  const path = slug.replace(/^\/+/, "");
  return `${base}/${path}`;
}

export function formatRelativeTime(ms: number | null | undefined) {
  if (ms == null) return "—";
  const delta = Date.now() - ms;
  const minutes = Math.round(delta / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  return formatDate(ms);
}

export function formatExpiresAt(ms: number | null | undefined) {
  if (ms == null) return "Never";
  return formatDateTime(ms, "long");
}
