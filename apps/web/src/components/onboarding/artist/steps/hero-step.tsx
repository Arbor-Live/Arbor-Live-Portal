import { BandHeroUploadField } from "@/components/files/file-upload-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormState } from "../types";

export function HeroStep({
  form,
  patch,
  profile,
}: {
  form: FormState;
  patch: (next: Partial<FormState>) => void;
  profile: { organizationId: string } | null;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground/70">
        Add a hero photo for your public artist page. You can skip this and add one
        later.
      </p>
      {profile ? (
        <BandHeroUploadField
          organizationId={profile.organizationId}
          currentUrl={form.publicHeroImageUrl}
          urlValue={form.publicHeroImageUrl}
          onUploaded={(url) => patch({ publicHeroImageUrl: url })}
          onUrlChange={(url) => patch({ publicHeroImageUrl: url })}
          onClear={() => patch({ publicHeroImageUrl: "" })}
        />
      ) : (
        <p className="rounded-md border border-dashed border-border/80 px-3 py-6 text-center text-sm text-muted-foreground">
          Hero upload needs an active artist org — paste a URL below for UI preview.
        </p>
      )}
      {!profile ? (
        <div className="space-y-2">
          <Label htmlFor="band-hero-url">Hero image URL</Label>
          <Input
            id="band-hero-url"
            value={form.publicHeroImageUrl}
            onChange={(event) => patch({ publicHeroImageUrl: event.target.value })}
            placeholder="https://…"
          />
        </div>
      ) : null}
    </div>
  );
}
