import { AvatarUploadField } from "@/components/account/avatar-upload-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OnboardingAckCheckbox, OnboardingTextarea } from "@/components/onboarding/onboarding-ui";
import {
  STANFORD_POSITION_LABELS,
  STANFORD_POSITION_OPTIONS,
  type StanfordPositionOption,
} from "@/lib/validations/users";
import type { FormState } from "../types";

export function ProfileStep({
  form,
  patch,
  fieldError,
  avatarBusy,
  avatarUrl,
  avatarSeedEmail,
  onAvatarSelected,
  previewOnly,
}: {
  form: FormState;
  patch: (next: Partial<FormState>) => void;
  fieldError: string | null;
  avatarBusy: boolean;
  avatarUrl: string;
  avatarSeedEmail: string;
  onAvatarSelected: (file: File) => void;
  previewOnly: boolean;
}) {
  return (
    <div className="space-y-4">
      <AvatarUploadField
        name={form.name || "Crew member"}
        email={avatarSeedEmail}
        imageUrl={avatarUrl || null}
        buttonLabel="Upload photo"
        busy={avatarBusy}
        previewOnly={previewOnly}
        onSelected={(file) => void onAvatarSelected(file)}
      />
      <p className="text-xs text-muted-foreground">PNG or JPG, up to 2 MB. Optional.</p>

      <div className="space-y-2">
        <Label htmlFor="crew-name">Full name</Label>
        <Input
          id="crew-name"
          value={form.name}
          onChange={(event) => patch({ name: event.target.value })}
          placeholder="Your full name"
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="crew-username">Username (optional)</Label>
        <Input
          id="crew-username"
          value={form.username}
          onChange={(event) => patch({ username: event.target.value })}
          placeholder="jane_doe"
          autoComplete="username"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="crew-phone">Phone number</Label>
        <Input
          id="crew-phone"
          type="tel"
          value={form.phone}
          onChange={(event) => patch({ phone: event.target.value })}
          placeholder="Your phone number"
          autoComplete="tel"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="crew-pronouns">Pronouns (optional)</Label>
          <Input
            id="crew-pronouns"
            value={form.pronouns}
            onChange={(event) => patch({ pronouns: event.target.value })}
            placeholder="she/her"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="crew-grad-year">Graduation year (optional)</Label>
          <Input
            id="crew-grad-year"
            inputMode="numeric"
            value={form.gradYear}
            onChange={(event) => patch({ gradYear: event.target.value })}
            placeholder="2027"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="crew-student-type">Student type</Label>
        <Select
          value={form.stanfordPosition || undefined}
          onValueChange={(value) =>
            patch({ stanfordPosition: value as StanfordPositionOption })
          }
        >
          <SelectTrigger id="crew-student-type">
            <SelectValue placeholder="Select a student type" />
          </SelectTrigger>
          <SelectContent>
            {STANFORD_POSITION_OPTIONS.map((position) => (
              <SelectItem key={position} value={position}>
                {STANFORD_POSITION_LABELS[position]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="crew-calendar-email">Calendar invite email (optional)</Label>
        <Input
          id="crew-calendar-email"
          type="email"
          value={form.calendarInviteEmail}
          onChange={(event) => patch({ calendarInviteEmail: event.target.value })}
          placeholder="Leave blank to use your account email"
        />
      </div>

      <OnboardingAckCheckbox
        checked={form.showOnPublicCrewPage}
        onChange={(next) => patch({ showOnPublicCrewPage: next })}
        label="List me on the public crew page with a short blurb."
      />

      {form.showOnPublicCrewPage ? (
        <OnboardingTextarea
          value={form.publicCrewDescription}
          onChange={(event) => patch({ publicCrewDescription: event.target.value })}
          placeholder="A sentence or two about yourself…"
        />
      ) : null}

      {fieldError ? <p className="text-sm text-destructive">{fieldError}</p> : null}
    </div>
  );
}
