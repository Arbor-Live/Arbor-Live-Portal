import { CropPreview } from "@/components/files/crop-preview";

export const dynamic = "force-static";

/**
 * Local-only surface for eyeballing the poster crop dialog without an event or
 * signed-in session. Gated to development; production build stays empty.
 */
export default function CropPreviewPage() {
  if (process.env.NODE_ENV !== "development") return null;
  return <CropPreview />;
}
