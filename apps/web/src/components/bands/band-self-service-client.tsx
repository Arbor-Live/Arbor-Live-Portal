"use client";

import { useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { FormSaveBar } from "@/components/forms";
import { Form, FormField } from "@/components/ui/form";
import { TextFormField } from "@/components/forms/text-form-field";
import { TextareaFormField } from "@/components/forms/textarea-form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConvexForm } from "@/hooks/use-convex-form";
import {
  bandInviteSchema,
  bandProfileSchema,
  type BandInviteFormValues,
  type BandProfileFormValues,
} from "@/lib/validations/bands";

export function BandSelfServiceClient() {
  const profile = useQuery(api.users.getActiveBandProfile, {});
  const members = useQuery(api.users.listMembersForActiveOrganization, {});
  const updateProfile = useMutation(api.users.updateActiveBandProfile);
  const inviteMember = useMutation(api.users.inviteMemberToActiveOrganization);

  const profileForm = useConvexForm<BandProfileFormValues>({
    schema: bandProfileSchema,
    defaultValues: {
      displayName: "",
      bio: "",
      performerHourlyRateUsd: 0,
      publicWebsiteUrl: "",
      publicInstagramUrl: "",
      publicYoutubeUrl: "",
      publicListing: false,
      publicSlug: "",
      publicHeroImageUrl: "",
    },
    mode: "onChange",
  });

  const inviteForm = useConvexForm<BandInviteFormValues>({
    schema: bandInviteSchema,
    defaultValues: { email: "", role: "org_member" },
    mode: "onTouched",
  });

  useEffect(() => {
    if (!profile) return;
    profileForm.reset({
      displayName: profile.displayName ?? "",
      bio: profile.bio ?? "",
      performerHourlyRateUsd: profile.performerHourlyRateUsd ?? 0,
      publicWebsiteUrl: profile.publicWebsiteUrl ?? "",
      publicInstagramUrl: profile.publicInstagramUrl ?? "",
      publicYoutubeUrl: profile.publicYoutubeUrl ?? "",
      publicListing: profile.publicListing ?? false,
      publicSlug: profile.publicSlug ?? "",
      publicHeroImageUrl: profile.publicHeroImageUrl ?? "",
    });
    profileForm.suppressNextAutoSave();
  }, [profile, profileForm]);

  const persistProfile = async (values: BandProfileFormValues) => {
    await updateProfile({
      displayName: values.displayName,
      bio: values.bio || undefined,
      performerHourlyRateUsd: values.performerHourlyRateUsd,
      publicWebsiteUrl: values.publicWebsiteUrl || undefined,
      publicInstagramUrl: values.publicInstagramUrl || undefined,
      publicYoutubeUrl: values.publicYoutubeUrl || undefined,
      publicListing: values.publicListing,
      publicSlug: values.publicSlug || undefined,
      publicHeroImageUrl: values.publicHeroImageUrl || undefined,
    });
  };

  const watchedProfile = profileForm.watch();
  useEffect(() => {
    profileForm.debouncedAutoSave(persistProfile, {
      delayMs: 1000,
      enabled: profileForm.formState.isDirty && profile !== undefined,
    });
  }, [watchedProfile, profileForm, profile]);

  const onInvite = inviteForm.submitMutation(async (values) => {
    await inviteMember({ email: values.email.trim(), role: values.role });
    inviteForm.reset({ email: "", role: values.role });
  });

  if (profile === undefined) {
    return <p className="text-sm text-muted-foreground">Loading band profile…</p>;
  }

  return (
    <div className="space-y-4 pb-20">
      <Card>
        <CardHeader>
          <CardTitle>Band Public Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...profileForm}>
            <form className="space-y-3">
              <TextFormField name="displayName" label="Display Name" />
              <TextareaFormField name="bio" label="Bio" />
              <div className="grid gap-2 md:grid-cols-2">
                <TextFormField
                  name="performerHourlyRateUsd"
                  label="Performer hourly rate (USD)"
                  type="number"
                />
                <TextFormField name="publicWebsiteUrl" label="Website" placeholder="https://..." />
                <TextFormField name="publicInstagramUrl" label="Instagram URL" />
                <TextFormField name="publicYoutubeUrl" label="YouTube URL" />
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <FormField
                  control={profileForm.control}
                  name="publicListing"
                  render={({ field }) => (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(field.value)}
                        onChange={(e) => field.onChange(e.target.checked)}
                      />
                      List on public artists page
                    </label>
                  )}
                />
                <TextFormField
                  name="publicSlug"
                  label="Public URL slug"
                  placeholder="my-band-name"
                />
                <TextFormField
                  name="publicHeroImageUrl"
                  label="Hero image URL"
                  placeholder="https://..."
                />
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Band Members</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Form {...inviteForm}>
            <form
              onSubmit={inviteForm.handleSubmit(onInvite)}
              className="grid gap-2 md:grid-cols-[1fr_180px_auto]"
            >
              <TextFormField name="email" label="" placeholder="Invite member email" type="email" />
              <FormField
                control={inviteForm.control}
                name="role"
                render={({ field }) => (
                  <select
                    className="h-9 self-end rounded-md border bg-background px-3 text-sm"
                    value={field.value}
                    onChange={field.onChange}
                  >
                    <option value="org_member">Org Member</option>
                    <option value="org_admin">Org Admin</option>
                  </select>
                )}
              />
              <Button type="submit" disabled={inviteForm.saveStatus === "saving"}>
                Invite
              </Button>
            </form>
          </Form>
          <div className="space-y-2">
            {(members ?? []).map((member) => (
              <div key={member.userId} className="rounded-md border p-2 text-sm">
                <p className="font-medium">{member.name}</p>
                <p className="text-xs text-muted-foreground">
                  {[member.email, member.title, member.role].filter(Boolean).join(" • ")}
                </p>
              </div>
            ))}
            {members?.length === 0 ? (
              <p className="text-sm text-muted-foreground">No members yet.</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <FormSaveBar
        tier="B"
        saveStatus={profileForm.saveStatus}
        saveError={profileForm.saveError}
        isDirty={profileForm.formState.isDirty}
        onSave={() =>
          void profileForm.handleSubmit((values) =>
            profileForm.runMutation(() => persistProfile(values)),
          )()
        }
        onRetry={() =>
          void profileForm.handleSubmit((values) =>
            profileForm.runMutation(() => persistProfile(values)),
          )()
        }
      />
    </div>
  );
}
