"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { FormSaveBar } from "@/components/forms";
import { Form, FormField } from "@/components/ui/form";
import { TextFormField } from "@/components/forms/text-form-field";
import { TextareaFormField } from "@/components/forms/textarea-form-field";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BandHeroUploadField } from "@/components/files/file-upload-field";
import { useConvexForm } from "@/hooks/use-convex-form";
import { formatDate } from "@/lib/format";
import {
  bandInviteSchema,
  bandProfileSchema,
  type BandInviteFormValues,
  type BandProfileFormValues,
} from "@/lib/validations/bands";
import { bandListingFieldsFromProfile, bandListingFieldsToMutation } from "@/lib/band-profile-lists";
import { BandListingProfileFields } from "@/components/bands/band-listing-profile-fields";

export function BandSelfServiceClient() {
  const profile = useQuery(api.users.getActiveBandProfile, {});
  const members = useQuery(api.users.listMembersForActiveOrganization, {});
  const pendingInvites = useQuery(api.users.listPendingInvitesForActiveOrganization, {});
  const updateProfile = useMutation(api.users.updateActiveBandProfile);
  const inviteMember = useMutation(api.users.inviteMemberToActiveOrganization);
  const updateMemberBandRole = useMutation(api.users.updateMemberBandRole);
  const [inviteConfirmation, setInviteConfirmation] = useState<string | null>(null);
  const [bandRoleDrafts, setBandRoleDrafts] = useState<Record<string, string>>({});
  const [bandRoleBusyId, setBandRoleBusyId] = useState<string | null>(null);

  const profileForm = useConvexForm<BandProfileFormValues>({
    schema: bandProfileSchema,
    defaultValues: {
      displayName: "",
      bio: "",
      oneLiner: "",
      genres: "",
      demoURL: "",
      bandMembers: "",
      mainContactName: "",
      mainContactEmail: "",
      mainContactPhone: "",
      performerHourlyRateUsd: 0,
      publicWebsiteUrl: "",
      publicInstagramUrl: "",
      publicYoutubeUrl: "",
      publicSpotifyUrl: "",
      publicListing: false,
      publicSlug: "",
      publicHeroImageUrl: "",
    },
    mode: "onChange",
  });

  const inviteForm = useConvexForm<BandInviteFormValues>({
    schema: bandInviteSchema,
    defaultValues: { email: "", role: "org_member", bandRole: "" },
    mode: "onTouched",
  });

  useEffect(() => {
    if (!profile) return;
    if (profileForm.formState.isDirty) return;
    profileForm.reset({
      displayName: profile.displayName ?? "",
      bio: profile.bio ?? "",
      ...bandListingFieldsFromProfile(profile),
      performerHourlyRateUsd: profile.performerHourlyRateUsd ?? 0,
      publicWebsiteUrl: profile.publicWebsiteUrl ?? "",
      publicInstagramUrl: profile.publicInstagramUrl ?? "",
      publicYoutubeUrl: profile.publicYoutubeUrl ?? "",
      publicSpotifyUrl: profile.publicSpotifyUrl ?? "",
      publicListing: profile.publicListing ?? false,
      publicSlug: profile.publicSlug ?? "",
      publicHeroImageUrl: profile.publicHeroImageUrl ?? "",
    });
  }, [profile, profileForm]);

  const persistProfile = async (values: BandProfileFormValues) => {
    await updateProfile({
      displayName: values.displayName,
      bio: values.bio || undefined,
      ...bandListingFieldsToMutation(values),
      performerHourlyRateUsd: values.performerHourlyRateUsd,
      // Preserve payee fields managed on the Payments tab.
      designatedPayeeUserId: profile?.designatedPayeeUserId,
      designatedPayeeName: profile?.designatedPayeeName,
      designatedPayeeEmail: profile?.designatedPayeeEmail,
      designatedPayeeMailingAddress: profile?.designatedPayeeMailingAddress,
      designatedPayeePayoutMethod:
        profile?.designatedPayeePayoutMethod === "pickup" ||
        profile?.designatedPayeePayoutMethod === "delivery"
          ? profile.designatedPayeePayoutMethod
          : undefined,
      publicWebsiteUrl: values.publicWebsiteUrl || undefined,
      publicInstagramUrl: values.publicInstagramUrl || undefined,
      publicYoutubeUrl: values.publicYoutubeUrl || undefined,
      publicSpotifyUrl: values.publicSpotifyUrl || undefined,
      publicListing: values.publicListing,
      publicSlug: values.publicSlug || undefined,
      publicHeroImageUrl: values.publicHeroImageUrl || undefined,
    });
  };

  const onSaveProfile = profileForm.submitMutation(
    async (values) => {
      await persistProfile(values);
      return values;
    },
    {
      onSuccess: (values) => {
        profileForm.reset(values);
      },
    },
  );

  const onInvite = inviteForm.submitMutation(
    async (values) => {
      await inviteMember({
        email: values.email.trim(),
        role: values.role,
        bandRole: values.bandRole?.trim() || undefined,
      });
      return values;
    },
    {
      onSuccess: (values) => {
        setInviteConfirmation(`Invitation sent to ${values.email.trim()}.`);
        inviteForm.reset({ email: "", role: values.role, bandRole: "" });
      },
    },
  );

  async function onSaveBandRole(userId: string, currentBandRole: string) {
    const nextRole = (bandRoleDrafts[userId] ?? currentBandRole).trim();
    setBandRoleBusyId(userId);
    try {
      await updateMemberBandRole({
        userId,
        bandRole: nextRole,
      });
      setBandRoleDrafts((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    } finally {
      setBandRoleBusyId(null);
    }
  }

  if (profile === undefined) {
    return <p className="text-sm text-muted-foreground">Loading band profile…</p>;
  }

  return (
    <div className="space-y-4 pb-20">
      <Form {...profileForm}>
        <form className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Band Public Profile</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <TextFormField name="displayName" label="Display Name" />
                <TextareaFormField name="bio" label="Bio" />
                <BandListingProfileFields />
                <div className="grid gap-2 md:grid-cols-2">
                  <TextFormField
                    name="performerHourlyRateUsd"
                    label="Rate per person per hour (USD)"
                    type="number"
                  />
                  <TextFormField name="publicWebsiteUrl" label="Website" placeholder="https://..." />
                  <TextFormField name="publicInstagramUrl" label="Instagram URL" />
                  <TextFormField name="publicYoutubeUrl" label="YouTube URL" />
                  <TextFormField name="publicSpotifyUrl" label="Spotify URL" />
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
                </div>
                <BandHeroUploadField
                  organizationId={profile.organizationId}
                  currentUrl={profileForm.watch("publicHeroImageUrl")}
                  urlValue={profileForm.watch("publicHeroImageUrl")}
                  onUploaded={(url) =>
                    profileForm.setValue("publicHeroImageUrl", url, { shouldDirty: true })
                  }
                  onUrlChange={(url) =>
                    profileForm.setValue("publicHeroImageUrl", url, { shouldDirty: true })
                  }
                  onClear={() =>
                    profileForm.setValue("publicHeroImageUrl", "", { shouldDirty: true })
                  }
                />
              </div>
            </CardContent>
          </Card>
        </form>
      </Form>

      <Card>
        <CardHeader>
          <CardTitle>Invite your band</CardTitle>
          <CardDescription>
            Invite collaborators to join this organization. Invitations expire after 14 days.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Form {...inviteForm}>
            <form
              onSubmit={inviteForm.handleSubmit(onInvite)}
              className="grid gap-3 border p-3 md:grid-cols-[1fr_1fr_180px_auto] md:items-end"
            >
              <TextFormField
                name="email"
                label="Email address"
                placeholder="name@example.com"
                type="email"
              />
              <TextFormField
                name="bandRole"
                label="Role in band"
                placeholder="Guitarist, Manager…"
              />
              <FormField
                control={inviteForm.control}
                name="role"
                render={({ field }) => (
                  <label className="grid gap-2 text-sm font-medium">
                    Access level
                    <select
                      className="h-9 rounded-none border bg-background px-3 text-sm font-normal"
                      value={field.value}
                      onChange={field.onChange}
                    >
                      <option value="org_member">Member — collaborate on the band profile</option>
                      <option value="org_admin">Admin — manage members and access</option>
                    </select>
                  </label>
                )}
              />
              <Button type="submit" disabled={inviteForm.saveStatus === "saving"}>
                {inviteForm.saveStatus === "saving" ? "Sending…" : "Send invitation"}
              </Button>
            </form>
          </Form>
          {inviteConfirmation ? (
            <Alert>
              <AlertTitle>Invitation sent</AlertTitle>
              <AlertDescription>{inviteConfirmation}</AlertDescription>
            </Alert>
          ) : null}
          {inviteForm.saveError ? (
            <Alert variant="destructive">
              <AlertTitle>Invitation not sent</AlertTitle>
              <AlertDescription>{inviteForm.saveError}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Band access</CardTitle>
          <CardDescription>Current collaborators and outstanding invitations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Members
            </p>
            {(members ?? []).map((member) => (
              <div
                key={member.userId}
                className="flex flex-col gap-3 border p-3 text-sm sm:flex-row sm:items-end sm:justify-between"
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <div>
                    <p className="font-medium">{member.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[member.email, member.role === "org_admin" ? "Admin" : "Member"]
                        .filter(Boolean)
                        .join(" • ")}
                    </p>
                  </div>
                  <label className="grid max-w-sm gap-1 text-xs font-medium">
                    Role in band
                    <input
                      className="h-9 rounded-none border bg-background px-3 text-sm font-normal"
                      value={bandRoleDrafts[member.userId] ?? member.bandRole ?? ""}
                      onChange={(event) =>
                        setBandRoleDrafts((prev) => ({
                          ...prev,
                          [member.userId]: event.target.value,
                        }))
                      }
                      placeholder="Guitarist, Manager…"
                    />
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={
                      bandRoleBusyId === member.userId ||
                      (bandRoleDrafts[member.userId] ?? member.bandRole ?? "") ===
                        (member.bandRole ?? "")
                    }
                    onClick={() => void onSaveBandRole(member.userId, member.bandRole ?? "")}
                  >
                    {bandRoleBusyId === member.userId ? "Saving…" : "Save role"}
                  </Button>
                  <span
                    className={
                      member.active
                        ? "text-xs text-emerald-700 dark:text-emerald-400"
                        : "text-xs text-muted-foreground"
                    }
                  >
                    {member.active ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
            ))}
            {members?.length === 0 ? (
              <p className="text-sm text-muted-foreground">No members yet.</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Pending invitations
            </p>
            {pendingInvites === undefined ? (
              <p className="text-sm text-muted-foreground">Loading invitations…</p>
            ) : null}
            {pendingInvites?.map((invite) => (
              <div
                key={invite.invitationId}
                className="flex items-center justify-between gap-3 border border-dashed p-3 text-sm"
              >
                <div>
                  <p className="font-medium">{invite.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {invite.bandRole ? `${invite.bandRole} · ` : ""}
                    {invite.role === "org_admin" ? "Admin" : "Member"} access · expires{" "}
                    {invite.expiresAt ? formatDate(invite.expiresAt) : "soon"}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">Pending</span>
              </div>
            ))}
            {pendingInvites?.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No invitations waiting for a response.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <FormSaveBar
        tier="C"
        saveStatus={profileForm.saveStatus}
        saveError={profileForm.saveError}
        isDirty={profileForm.formState.isDirty}
        onSave={() => void profileForm.handleSubmit(onSaveProfile)()}
        onDiscard={() => {
          if (!profile) return;
          profileForm.reset({
            displayName: profile.displayName ?? "",
            bio: profile.bio ?? "",
            ...bandListingFieldsFromProfile(profile),
            performerHourlyRateUsd: profile.performerHourlyRateUsd ?? 0,
            publicWebsiteUrl: profile.publicWebsiteUrl ?? "",
            publicInstagramUrl: profile.publicInstagramUrl ?? "",
            publicYoutubeUrl: profile.publicYoutubeUrl ?? "",
            publicSpotifyUrl: profile.publicSpotifyUrl ?? "",
            publicListing: profile.publicListing ?? false,
            publicSlug: profile.publicSlug ?? "",
            publicHeroImageUrl: profile.publicHeroImageUrl ?? "",
          });
        }}
        onRetry={() => void profileForm.handleSubmit(onSaveProfile)()}
      />
    </div>
  );
}
