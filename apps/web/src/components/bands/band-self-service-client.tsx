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
import { Label } from "@/components/ui/label";
import { UserSelect } from "@/components/users/user-select";
import { BandHeroUploadField } from "@/components/files/file-upload-field";
import { useConvexForm } from "@/hooks/use-convex-form";
import { formatDate } from "@/lib/format";
import {
  bandInviteSchema,
  bandProfileSchema,
  type BandInviteFormValues,
  type BandProfileFormValues,
} from "@/lib/validations/bands";

export function BandSelfServiceClient() {
  const profile = useQuery(api.users.getActiveBandProfile, {});
  const members = useQuery(api.users.listMembersForActiveOrganization, {});
  const pendingInvites = useQuery(api.users.listPendingInvitesForActiveOrganization, {});
  const updateProfile = useMutation(api.users.updateActiveBandProfile);
  const inviteMember = useMutation(api.users.inviteMemberToActiveOrganization);
  const [inviteConfirmation, setInviteConfirmation] = useState<string | null>(null);

  const profileForm = useConvexForm<BandProfileFormValues>({
    schema: bandProfileSchema,
    defaultValues: {
      displayName: "",
      bio: "",
      performerHourlyRateUsd: 0,
      designatedPayeeUserId: "",
      designatedPayeeName: "",
      designatedPayeeEmail: "",
      designatedPayeeMailingAddress: "",
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
    if (profileForm.formState.isDirty) return;
    profileForm.reset({
      displayName: profile.displayName ?? "",
      bio: profile.bio ?? "",
      performerHourlyRateUsd: profile.performerHourlyRateUsd ?? 0,
      designatedPayeeUserId: profile.designatedPayeeUserId ?? "",
      designatedPayeeName: profile.designatedPayeeName ?? "",
      designatedPayeeEmail: profile.designatedPayeeEmail ?? "",
      designatedPayeeMailingAddress: profile.designatedPayeeMailingAddress ?? "",
      publicWebsiteUrl: profile.publicWebsiteUrl ?? "",
      publicInstagramUrl: profile.publicInstagramUrl ?? "",
      publicYoutubeUrl: profile.publicYoutubeUrl ?? "",
      publicListing: profile.publicListing ?? false,
      publicSlug: profile.publicSlug ?? "",
      publicHeroImageUrl: profile.publicHeroImageUrl ?? "",
    });
  }, [profile, profileForm]);

  const persistProfile = async (values: BandProfileFormValues) => {
    await updateProfile({
      displayName: values.displayName,
      bio: values.bio || undefined,
      performerHourlyRateUsd: values.performerHourlyRateUsd,
      designatedPayeeUserId: values.designatedPayeeUserId || undefined,
      designatedPayeeName: values.designatedPayeeName || undefined,
      designatedPayeeEmail: values.designatedPayeeEmail || undefined,
      designatedPayeeMailingAddress: values.designatedPayeeMailingAddress || undefined,
      publicWebsiteUrl: values.publicWebsiteUrl || undefined,
      publicInstagramUrl: values.publicInstagramUrl || undefined,
      publicYoutubeUrl: values.publicYoutubeUrl || undefined,
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
      await inviteMember({ email: values.email.trim(), role: values.role });
      return values;
    },
    {
      onSuccess: (values) => {
        setInviteConfirmation(`Invitation sent to ${values.email.trim()}.`);
        inviteForm.reset({ email: "", role: values.role });
      },
    },
  );

  const payeeUserId = profileForm.watch("designatedPayeeUserId");

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
                onClear={() => profileForm.setValue("publicHeroImageUrl", "", { shouldDirty: true })}
              />
            </div>
        </CardContent>
      </Card>

      <Card id="payment-payee">
        <CardHeader>
          <CardTitle>Payment Payee</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!profile.payeeComplete ? (
            <p className="rounded-md border border-dashed px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
              Required before band payments can be processed. Provide one designated payee who receives and
              distributes payment, plus a mailing address for GrantEd.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Payee on file. Update here if your band&apos;s payment contact or address changes.
            </p>
          )}
          <div className="space-y-1">
            <Label>Designated payee</Label>
            <UserSelect
              value={payeeUserId ?? ""}
              onChange={(userId) => {
                profileForm.setValue("designatedPayeeUserId", userId, { shouldDirty: true });
                const user = (members ?? []).find((row) => row.userId === userId);
                if (user) {
                  profileForm.setValue("designatedPayeeName", user.name, { shouldDirty: true });
                  profileForm.setValue("designatedPayeeEmail", user.email ?? "", { shouldDirty: true });
                }
              }}
              options={(members ?? []).map((user) => ({
                value: user.userId,
                label: user.name,
                email: user.email,
                description: user.email,
              }))}
              placeholder="Select band member payee..."
              emptyLabel="Select payee"
            />
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <TextFormField name="designatedPayeeName" label="Payee name" />
            <TextFormField name="designatedPayeeEmail" label="Payee email" type="email" />
          </div>
          <TextareaFormField
            name="designatedPayeeMailingAddress"
            label="Mailing address"
            placeholder={"123 Example St\nStanford, CA 94305"}
          />
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
              className="grid gap-3 border p-3 md:grid-cols-[1fr_180px_auto] md:items-end"
            >
              <TextFormField name="email" label="Email address" placeholder="name@example.com" type="email" />
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
          {inviteConfirmation ? <Alert><AlertTitle>Invitation sent</AlertTitle><AlertDescription>{inviteConfirmation}</AlertDescription></Alert> : null}
          {inviteForm.saveError ? <Alert variant="destructive"><AlertTitle>Invitation not sent</AlertTitle><AlertDescription>{inviteForm.saveError}</AlertDescription></Alert> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Band access</CardTitle>
          <CardDescription>Current collaborators and outstanding invitations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Members</p>
            {(members ?? []).map((member) => (
              <div key={member.userId} className="flex items-center justify-between gap-3 border p-3 text-sm">
                <div>
                  <p className="font-medium">{member.name}</p>
                  <p className="text-xs text-muted-foreground">
                  {[member.email, member.title, member.role].filter(Boolean).join(" • ")}
                  </p>
                </div>
                <span className={member.active ? "text-xs text-emerald-700 dark:text-emerald-400" : "text-xs text-muted-foreground"}>{member.active ? "Active" : "Inactive"}</span>
              </div>
            ))}
            {members?.length === 0 ? (
              <p className="text-sm text-muted-foreground">No members yet.</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Pending invitations</p>
            {pendingInvites === undefined ? <p className="text-sm text-muted-foreground">Loading invitations…</p> : null}
            {pendingInvites?.map((invite) => (
              <div key={invite.invitationId} className="flex items-center justify-between gap-3 border border-dashed p-3 text-sm">
                <div>
                  <p className="font-medium">{invite.email}</p>
                  <p className="text-xs text-muted-foreground">{invite.role === "org_admin" ? "Admin" : "Member"} access · expires {invite.expiresAt ? formatDate(invite.expiresAt) : "soon"}</p>
                </div>
                <span className="text-xs text-muted-foreground">Pending</span>
              </div>
            ))}
            {pendingInvites?.length === 0 ? <p className="text-sm text-muted-foreground">No invitations waiting for a response.</p> : null}
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
            performerHourlyRateUsd: profile.performerHourlyRateUsd ?? 0,
            designatedPayeeUserId: profile.designatedPayeeUserId ?? "",
            designatedPayeeName: profile.designatedPayeeName ?? "",
            designatedPayeeEmail: profile.designatedPayeeEmail ?? "",
            designatedPayeeMailingAddress: profile.designatedPayeeMailingAddress ?? "",
            publicWebsiteUrl: profile.publicWebsiteUrl ?? "",
            publicInstagramUrl: profile.publicInstagramUrl ?? "",
            publicYoutubeUrl: profile.publicYoutubeUrl ?? "",
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
