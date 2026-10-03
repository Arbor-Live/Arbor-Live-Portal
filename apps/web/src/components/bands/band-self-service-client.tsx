"use client";

import { useEffect, useRef } from "react";
import { Controller } from "react-hook-form";
import { useMutation, useQuery } from "convex/react";
import { GlobeIcon, LockSimpleIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { FormSaveBar } from "@/components/forms";
import { MarketingLinksEditor } from "@/components/marketing/marketing-links-editor";
import { Form } from "@/components/ui/form";
import { TextFormField } from "@/components/forms/text-form-field";
import { TextareaFormField } from "@/components/forms/textarea-form-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { BandHeroUploadField } from "@/components/files/file-upload-field";
import { useResolvedAssetUrl } from "@/components/files/stored-asset-image";
import { useConvexForm } from "@/hooks/use-convex-form";
import { useBandPublicSlugAutofill } from "@/hooks/use-band-public-slug-autofill";
import {
  bandProfileSchema,
  ensureBandPublicSlug,
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

export function BandSelfServiceClient() {
  const profile = useQuery(api.users.getActiveBandProfile, {});
  const updateProfile = useMutation(api.users.updateActiveBandProfile);

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
      artistLinks: [],
      publicListing: false,
      publicSlug: "",
      publicHeroImageUrl: "",
    },
    mode: "onChange",
  });

  const watched = profileForm.watch();
  const heroUrl = useResolvedAssetUrl(watched.publicHeroImageUrl);
  const { markSlugTouched, syncSlugTouchedFromForm, resetSlugTouched } =
    useBandPublicSlugAutofill(profileForm);

  // First load always hydrates (that is what clears the phantom dirty state);
  // after that, a same-artist push must not clobber unsaved edits, so skip it
  // while the form is dirty. `hasHydrated` is a ref so the decide-and-set is
  // synchronous and unaffected by React re-renders.
  const hasHydrated = useRef(false);
  useEffect(() => {
    if (profile === undefined) return;
    if (hasHydrated.current && profileForm.formState.isDirty) return;
    hasHydrated.current = true;
    resetSlugTouched();
    profileForm.reset({
      displayName: profile.displayName ?? "",
      bio: profile.bio ?? "",
      ...bandListingFieldsFromProfile(profile),
      performerHourlyRateUsd: profile.performerHourlyRateUsd ?? 0,
      artistLinks: profile.artistLinks ?? [],
      publicListing: profile.publicListing ?? false,
      publicSlug: profile.publicSlug ?? "",
      publicHeroImageUrl: profile.publicHeroImageUrl ?? "",
    });
    syncSlugTouchedFromForm();
  }, [profile, profileForm, resetSlugTouched, syncSlugTouchedFromForm]);

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
        syncSlugTouchedFromForm();
      },
    },
  );

  function resetProfileForm() {
    if (!profile) return;
    resetSlugTouched();
    profileForm.reset({
      displayName: profile.displayName ?? "",
      bio: profile.bio ?? "",
      ...bandListingFieldsFromProfile(profile),
      performerHourlyRateUsd: profile.performerHourlyRateUsd ?? 0,
      artistLinks: profile.artistLinks ?? [],
      publicListing: profile.publicListing ?? false,
      publicSlug: profile.publicSlug ?? "",
      publicHeroImageUrl: profile.publicHeroImageUrl ?? "",
    });
    syncSlugTouchedFromForm();
  }

  if (profile === undefined) {
    return <p className="text-sm text-muted-foreground">Loading artist profile…</p>;
  }

  return (
    <div className="space-y-4 pb-20">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <Form {...profileForm}>
            <form className="space-y-4">
              <Card>
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1.5">
                    <CardTitle className="flex items-center gap-2">
                      <GlobeIcon className="size-4 text-muted-foreground" aria-hidden />
                      Profile
                    </CardTitle>
                    <CardDescription>
                      {watched.publicListing
                        ? "What fans see on your public artist page and in event listings."
                        : "Arbor staff see this when booking. Switch to Public to list it on the site."}
                    </CardDescription>
                  </div>
                  <BandPublicListingToggle control={profileForm.control} />
                </CardHeader>
                <CardContent className="space-y-3">
                  <TextFormField name="displayName" label="Display name" />
                  <TextareaFormField name="bio" label="Bio" />
                  <BandPublicListingFields />
                  <Controller
                    control={profileForm.control}
                    name="artistLinks"
                    render={({ field }) => (
                      <MarketingLinksEditor
                        idPrefix="band-artist-links"
                        links={field.value ?? []}
                        onLinksChange={field.onChange}
                      />
                    )}
                  />
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
                        placeholder="my-artist-name"
                        onValueChange={() => markSlugTouched()}
                      />
                      <BandPublicArtistLinkCopy publicSlug={watched.publicSlug} />
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <LockSimpleIcon className="size-4 text-muted-foreground" aria-hidden />
                    Booking & contact
                  </CardTitle>
                  <CardDescription>
                    Only Arbor staff see this. The booking contact is who we call about shows.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <BandArborPrivateFields />
                </CardContent>
              </Card>
            </form>
          </Form>

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
