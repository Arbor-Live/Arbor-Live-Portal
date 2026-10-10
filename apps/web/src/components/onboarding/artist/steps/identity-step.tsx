import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OnboardingTextarea } from "@/components/onboarding/onboarding-ui";
import type { FormState } from "../types";

export function IdentityStep({
  form,
  patch,
}: {
  form: FormState;
  patch: (next: Partial<FormState>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="band-display-name">Artist name</Label>
        <Input
          id="band-display-name"
          value={form.displayName}
          onChange={(event) => patch({ displayName: event.target.value })}
          placeholder="Your artist name"
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="band-bio">Bio</Label>
        <OnboardingTextarea
          id="band-bio"
          value={form.bio}
          onChange={(event) => patch({ bio: event.target.value })}
          placeholder="A short description of your sound and style…"
        />
      </div>
    </div>
  );
}
