"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { FormSaveBar } from "@/components/forms";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { TextFormField } from "@/components/forms/text-form-field";
import { TextareaFormField } from "@/components/forms/textarea-form-field";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BandHeroUploadField } from "@/components/files/file-upload-field";
import { useResolvedAssetUrl } from "@/components/files/stored-asset-image";
import { useConvexForm } from "@/hooks/use-convex-form";
import { useBandPublicSlugAutofill } from "@/hooks/use-band-public-slug-autofill";
import { formatDate } from "@/lib/format";
import {
  bandInviteSchema,
  bandProfileSchema,
  ensureBandPublicSlug,
  type BandInviteFormValues,
  type BandProfileFormValues,
} from "@/lib/validations/bands";
import {
  bandListingFieldsFromProfile,
  bandListingFieldsToMutation,
  bandPublicUrlsToMutation,
  trimOptional,
} from "@/lib/band-profile-lists";
import {
  BandArborPrivateFields,
  BandPublicListingFields,
} from "@/components/bands/band-listing-profile-fields";
import { BandProfilePreviewPanel } from "@/components/bands/band-profile-preview";
import {
  BandPublicArtistLinkCopy,
  BandPublicListingToggle,
} from "@/components/bands/band-public-listing-controls";
import { BandArborOnlyBadge, BandVisibilityBadge } from "@/components/bands/band-section-badge";

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

  const watched = profileForm.watch();
  const heroUrl = useResolvedAssetUrl(watched.publicHeroImageUrl);
  const { markSlugTouched, syncSlugTouchedFromForm } = useBandPublicSlugAutofill(profileForm);

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
    syncSlugTouchedFromForm();
  }, [profile, profileForm, syncSlugTouchedFromForm]);

  const persistProfile = async (values: BandProfileFormValues) => {
    const payload = ensureBandPublicSlug(values);
    await updateProfile({
      displayName: trimOptional(payload.displayName),
      bio: trimOptional(payload.bio),
      ...bandListingFieldsToMutation(payload),
      performerHourlyRateUsd: payload.performerHourlyRateUsd,
      designatedPayeeUserId: profile?.designatedPayeeUserId,
      designatedPayeeName: profile?.designatedPayeeName,
      designatedPayeeEmail: profile?.designatedPayeeEmail,
      designatedPayeeMailingAddress: profile?.designatedPayeeMailingAddress,
      designatedPayeePayoutMethod:
        profile?.designatedPayeePayoutMethod === "pickup" ||
        profile?.designatedPayeePayoutMethod === "delivery"
          ? profile.designatedPayeePayoutMethod
          : undefined,
      ...bandPublicUrlsToMutation(payload),
      publicListing: payload.publicListing,
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

  function resetProfileForm() {
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
    syncSlugTouchedFromForm();
  }

  if (profile === undefined) {
    return <p className="text-sm text-muted-foreground">Loading band profile…</p>;
  }

  return (
    <div className="space-y-4 pb-20">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Form {...profileForm}>
            <form className="space-y-4">
              <Card>
                <CardHeader className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle>Profile</CardTitle>
                      <BandVisibilityBadge listed={Boolean(watched.publicListing)} />
                    </div>
                    <BandPublicListingToggle control={profileForm.control} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <TextFormField name="displayName" label="Display name" />
                  <TextareaFormField name="bio" label="Bio" />
                  <BandPublicListingFields />
                  <div className="grid gap-2 md:grid-cols-2">
                    <TextFormField name="publicWebsiteUrl" label="Website" placeholder="https://..." />
                    <TextFormField name="publicInstagramUrl" label="Instagram URL" />
                    <TextFormField name="publicYoutubeUrl" label="YouTube URL" />
                    <TextFormField name="publicSpotifyUrl" label="Spotify URL" />
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
                  {watched.publicListing ? (
                    <div className="flex flex-col gap-3">
                      <Separator />
                      <TextFormField
                        name="publicSlug"
                        label="Public URL slug"
                        placeholder="my-band-name"
                        onValueChange={() => markSlugTouched()}
                      />
                      <BandPublicArtistLinkCopy publicSlug={watched.publicSlug} />
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle>Booking & contact</CardTitle>
                    <BandArborOnlyBadge />
                  </div>
                </CardHeader>
                <CardContent>
                  <BandArborPrivateFields />
                </CardContent>
              </Card>
            </form>
          </Form>

          <Card>
            <CardHeader>
              <CardTitle>Your team</CardTitle>
              <CardDescription>Invite bandmates and manage portal access.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="text-sm text-muted-foreground">
                Invite bandmates by email. Their instrument or role is how Arbor knows who&apos;s in
                the group — no separate member list to maintain.
              </p>
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
                    placeholder="Guitarist, vocals…"
                  />
                  <FormField
                    control={inviteForm.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Access level</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="org_member">Member — edit profile & riders</SelectItem>
                            <SelectItem value="org_admin">Admin — manage team & access</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
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
                      <div className="grid max-w-sm gap-2">
                        <Label htmlFor={`band-role-${member.userId}`}>Role in band</Label>
                        <Input
                          id={`band-role-${member.userId}`}
                          value={bandRoleDrafts[member.userId] ?? member.bandRole ?? ""}
                          onChange={(event) =>
                            setBandRoleDrafts((prev) => ({
                              ...prev,
                              [member.userId]: event.target.value,
                            }))
                          }
                          placeholder="Guitarist, vocals…"
                        />
                      </div>
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
        </div>

        <aside className="mx-auto w-full min-w-0 max-w-lg xl:sticky xl:top-4 xl:mx-0 xl:max-w-none xl:self-start">
          <Card className="gap-0 py-0">
            <CardContent className="p-4">
              <BandProfilePreviewPanel data={watched} heroUrl={heroUrl} />
            </CardContent>
          </Card>
        </aside>
      </div>

      <FormSaveBar
        tier="C"
        saveStatus={profileForm.saveStatus}
        saveError={profileForm.saveError}
        isDirty={profileForm.formState.isDirty}
        onSave={() => void profileForm.handleSubmit(onSaveProfile)()}
        onDiscard={resetProfileForm}
        onRetry={() => void profileForm.handleSubmit(onSaveProfile)()}
      />
    </div>
  );
}
