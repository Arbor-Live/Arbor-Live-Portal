"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "backend/convex/_generated/dataModel";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/convex-api";
import { Form } from "@/components/ui/form";
import { TextFormField } from "@/components/forms/text-form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useConvexForm } from "@/hooks/use-convex-form";
import {
  addPasskeySchema,
  changeEmailSchema,
  changePasswordSchema,
  profileSchema,
  type AddPasskeyFormValues,
  type ChangeEmailFormValues,
  type ChangePasswordFormValues,
  type ProfileFormValues,
} from "@/lib/validations/account";
import { UserAvatarUploadPreview } from "@/components/account/user-avatar";
import {
  FingerprintIcon,
  KeyIcon,
  ShieldCheckIcon,
  TrashIcon,
  UserCircleIcon,
} from "@phosphor-icons/react";

type PasskeyRow = {
  id: string;
  name?: string | null;
  deviceType?: string | null;
  createdAt?: string | Date | null;
};

function formatPasskeyDate(value: string | Date | null | undefined) {
  if (!value) return "Unknown";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function authErrorMessage(error: { message?: unknown }, fallback: string) {
  return typeof error.message === "string" ? error.message : fallback;
}

export function AccountSettingsClient() {
  const account = useQuery(api.account.getMyAccount, {});
  const generateAvatarUploadUrl = useMutation(api.account.generateAvatarUploadUrl);
  const setMyAvatar = useMutation(api.account.setMyAvatar);
  const removeMyAvatar = useMutation(api.account.removeMyAvatar);
  const updateMyProfileDetails = useMutation(api.account.updateMyProfileDetails);
  const { data: session, refetch: refetchSession } = authClient.useSession();
  const passkeysQuery = authClient.useListPasskeys();
  const passkeys = (passkeysQuery.data ?? []) as PasskeyRow[];

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyMessage, setPasskeyMessage] = useState<string | null>(null);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);

  const profileForm = useConvexForm<ProfileFormValues>({
    schema: profileSchema,
    defaultValues: { name: "", phone: "", title: "", calendarInviteEmail: "" },
    mode: "onTouched",
  });

  const emailForm = useConvexForm<ChangeEmailFormValues>({
    schema: changeEmailSchema,
    defaultValues: { newEmail: "" },
    mode: "onTouched",
  });

  const passwordForm = useConvexForm<ChangePasswordFormValues>({
    schema: changePasswordSchema,
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
      revokeOtherSessions: true,
    },
    mode: "onTouched",
  });

  const passkeyForm = useConvexForm<AddPasskeyFormValues>({
    schema: addPasskeySchema,
    defaultValues: { name: "" },
    mode: "onTouched",
  });

  useEffect(() => {
    if (!account) return;
    if (profileForm.formState.isDirty) return;
    profileForm.reset({
      name: account.name,
      phone: account.phone ?? "",
      title: account.title ?? "",
      calendarInviteEmail: account.calendarInviteEmail ?? "",
    });
  }, [account, profileForm]);

  if (account === undefined) {
    return <p className="text-sm text-muted-foreground">Loading account settings…</p>;
  }

  const displayName = account.name;
  const displayEmail = account.email;
  const avatarUrl = account.avatarUrl ?? account.image ?? null;
  const emailVerified = account.emailVerified || Boolean(session?.user?.emailVerified);

  const onProfileSubmit = profileForm.submitMutation(async (values) => {
    const result = await authClient.updateUser({ name: values.name.trim() });
    if (result.error) {
      throw new Error(result.error.message ?? "Unable to update profile.");
    }
    await updateMyProfileDetails({
      phone: values.phone?.trim() || undefined,
      title: values.title?.trim() || undefined,
      calendarInviteEmail: values.calendarInviteEmail?.trim() || undefined,
    });
    await refetchSession();
    return result;
  });

  const onEmailSubmit = emailForm.submitMutation(async (values) => {
    const result = await authClient.changeEmail({
      newEmail: values.newEmail.trim(),
      callbackURL: `${window.location.origin}/dashboard/account`,
    });
    if (result.error) {
      throw new Error(result.error.message ?? "Unable to request email change.");
    }
    emailForm.reset({ newEmail: "" });
    return result;
  });

  const onPasswordSubmit = passwordForm.submitMutation(async (values) => {
    const result = await authClient.changePassword({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
      revokeOtherSessions: values.revokeOtherSessions,
    });
    if (result.error) {
      throw new Error(result.error.message ?? "Unable to change password.");
    }
    passwordForm.reset({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
      revokeOtherSessions: values.revokeOtherSessions,
    });
    return result;
  });

  const onResendVerification = async () => {
    const result = await authClient.sendVerificationEmail({
      email: displayEmail,
      callbackURL: `${window.location.origin}/dashboard/account`,
    });
    if (result.error) {
      throw new Error(result.error.message ?? "Unable to send verification email.");
    }
    return result;
  };

  async function onAvatarSelected(file: File) {
    setAvatarBusy(true);
    setAvatarMessage(null);
    setAvatarError(null);
    try {
      if (!file.type.startsWith("image/")) {
        throw new Error("Please choose an image file.");
      }
      if (file.size > 2 * 1024 * 1024) {
        throw new Error("Profile image must be 2 MB or smaller.");
      }
      const uploadUrl = await generateAvatarUploadUrl({});
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!response.ok) throw new Error("Upload failed.");
      const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
      await setMyAvatar({ storageId });
      await refetchSession();
      setAvatarMessage("Profile photo updated.");
    } catch (error) {
      setAvatarError(error instanceof Error ? error.message : "Unable to update profile photo.");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function onRemoveAvatar() {
    setAvatarBusy(true);
    setAvatarMessage(null);
    setAvatarError(null);
    try {
      await removeMyAvatar({});
      await refetchSession();
      setAvatarMessage("Profile photo removed.");
    } catch (error) {
      setAvatarError(error instanceof Error ? error.message : "Unable to remove profile photo.");
    } finally {
      setAvatarBusy(false);
    }
  }

  const onAddPasskey = passkeyForm.submitMutation(async (values) => {
    setPasskeyMessage(null);
    setPasskeyError(null);
    setPasskeyBusy(true);
    try {
      const result = await authClient.passkey.addPasskey({
        name: values.name?.trim() || "My passkey",
        authenticatorAttachment: "platform",
      });
      if (result.error) {
        throw new Error(authErrorMessage(result.error, "Unable to add passkey."));
      }
      setPasskeyMessage("Passkey added successfully.");
      passkeyForm.reset({ name: "" });
      return result;
    } finally {
      setPasskeyBusy(false);
    }
  });

  async function onDeletePasskey(id: string) {
    setPasskeyMessage(null);
    setPasskeyError(null);
    setPasskeyBusy(true);
    try {
      const result = await authClient.passkey.deletePasskey({ id });
      if (result.error) {
        throw new Error(result.error.message ?? "Unable to remove passkey.");
      }
      setPasskeyMessage("Passkey removed.");
    } catch (error) {
      setPasskeyError(error instanceof Error ? error.message : "Unable to remove passkey.");
    } finally {
      setPasskeyBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCircleIcon className="size-5" />
            Profile
          </CardTitle>
          <CardDescription>Update how your name and photo appear across the portal.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <UserAvatarUploadPreview
              name={displayName}
              email={displayEmail}
              imageUrl={avatarUrl}
            />
            <div className="space-y-2">
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void onAvatarSelected(file);
                }}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={avatarBusy}
                  onClick={() => avatarInputRef.current?.click()}
                >
                  {avatarBusy ? "Uploading…" : "Upload photo"}
                </Button>
                {avatarUrl ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={avatarBusy}
                    onClick={() => void onRemoveAvatar()}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">PNG or JPG, up to 2 MB.</p>
              {avatarMessage ? (
                <Alert>
                  <AlertDescription>{avatarMessage}</AlertDescription>
                </Alert>
              ) : null}
              {avatarError ? (
                <Alert variant="destructive">
                  <AlertDescription>{avatarError}</AlertDescription>
                </Alert>
              ) : null}
            </div>
          </div>

          <Form {...profileForm}>
            <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
              <TextFormField name="name" label="Display name" />
              <TextFormField name="title" label="Job title" />
              <TextFormField name="phone" label="Phone" type="tel" />
              <TextFormField
                name="calendarInviteEmail"
                label="Calendar invite email"
                type="email"
                placeholder={displayEmail}
                description="Crew schedule emails and calendar invites are sent here. Leave blank to use your account email."
              />
              <Button type="submit" disabled={profileForm.saveStatus === "saving"}>
                {profileForm.saveStatus === "saving" ? "Saving…" : "Save profile"}
              </Button>
              {profileForm.saveError ? (
                <Alert variant="destructive">
                  <AlertDescription>{profileForm.saveError}</AlertDescription>
                </Alert>
              ) : null}
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheckIcon className="size-5" />
            Email
          </CardTitle>
          <CardDescription>
            Manage your sign-in email. Changing email requires verification.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <p className="font-medium">{displayEmail}</p>
            <p className="text-muted-foreground">
              {emailVerified ? "Verified" : "Not verified yet"}
            </p>
          </div>

          {!emailVerified ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void onResendVerification().catch((error: unknown) => {
                  emailForm.setError("newEmail", {
                    message: error instanceof Error ? error.message : "Unable to send verification email.",
                  });
                });
              }}
            >
              Resend verification email
            </Button>
          ) : null}

          <Form {...emailForm}>
            <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="space-y-4">
              <TextFormField name="newEmail" label="New email" type="email" />
              <p className="text-xs text-muted-foreground">
                We will email your current address to approve the change, then send a verification
                link to the new address.
              </p>
              <Button type="submit" disabled={emailForm.saveStatus === "saving"}>
                {emailForm.saveStatus === "saving" ? "Sending…" : "Request email change"}
              </Button>
              {emailForm.saveStatus === "saved" ? (
                <Alert>
                  <AlertDescription>
                    Check your inbox to approve and verify the email change.
                  </AlertDescription>
                </Alert>
              ) : null}
              {emailForm.saveError ? (
                <Alert variant="destructive">
                  <AlertDescription>{emailForm.saveError}</AlertDescription>
                </Alert>
              ) : null}
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyIcon className="size-5" />
            Password
          </CardTitle>
          <CardDescription>Change your password or use the forgot-password flow if needed.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...passwordForm}>
            <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
              <TextFormField name="currentPassword" label="Current password" type="password" />
              <TextFormField name="newPassword" label="New password" type="password" />
              <TextFormField name="confirmPassword" label="Confirm new password" type="password" />
              <div className="flex items-center gap-2">
                <input
                  id="revokeOtherSessions"
                  type="checkbox"
                  className="size-4 rounded border"
                  checked={passwordForm.watch("revokeOtherSessions")}
                  onChange={(event) =>
                    passwordForm.setValue("revokeOtherSessions", event.target.checked)
                  }
                />
                <Label htmlFor="revokeOtherSessions">Sign out other devices</Label>
              </div>
              <Button type="submit" disabled={passwordForm.saveStatus === "saving"}>
                {passwordForm.saveStatus === "saving" ? "Updating…" : "Update password"}
              </Button>
              {passwordForm.saveStatus === "saved" ? (
                <Alert>
                  <AlertDescription>Password updated.</AlertDescription>
                </Alert>
              ) : null}
              {passwordForm.saveError ? (
                <Alert variant="destructive">
                  <AlertDescription>{passwordForm.saveError}</AlertDescription>
                </Alert>
              ) : null}
              <Button asChild variant="link" className="px-0">
                <a href="/forgot-password">Forgot your current password?</a>
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FingerprintIcon className="size-5" />
            Passkeys
          </CardTitle>
          <CardDescription>
            Use Face ID, Touch ID, or another device passkey for faster sign-in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {passkeys.length ? (
            <div className="space-y-2">
              {passkeys.map((passkey) => (
                <div
                  key={passkey.id}
                  className="flex items-center justify-between gap-3 rounded-md border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">{passkey.name || "Passkey"}</p>
                    <p className="text-xs text-muted-foreground">
                      {passkey.deviceType ?? "Device"} · Added {formatPasskeyDate(passkey.createdAt)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={passkeyBusy}
                    aria-label={`Remove ${passkey.name || "passkey"}`}
                    onClick={() => void onDeletePasskey(passkey.id)}
                  >
                    <TrashIcon className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No passkeys registered yet.</p>
          )}

          <Separator />

          <Form {...passkeyForm}>
            <form onSubmit={passkeyForm.handleSubmit(onAddPasskey)} className="space-y-4">
              <TextFormField
                name="name"
                label="Passkey name (optional)"
                placeholder="MacBook Touch ID"
              />
              <Button type="submit" disabled={passkeyBusy || passkeyForm.saveStatus === "saving"}>
                {passkeyBusy || passkeyForm.saveStatus === "saving" ? "Adding…" : "Add passkey"}
              </Button>
            </form>
          </Form>

          {passkeyMessage ? (
            <Alert>
              <AlertDescription>{passkeyMessage}</AlertDescription>
            </Alert>
          ) : null}
          {passkeyError ? (
            <Alert variant="destructive">
              <AlertDescription>{passkeyError}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
