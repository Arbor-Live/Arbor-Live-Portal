"use client";

import { useEffect, useRef } from "react";
import { Controller } from "react-hook-form";
import { useMutation, useQuery } from "convex/react";
import { CurrencyDollarIcon, GlobeIcon, LockSimpleIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { FormSaveBar } from "@/components/forms";
import { MarketingLinksEditor } from "@/components/marketing/marketing-links-editor";
import { Form } from "@/components/ui/form";
import { TextFormField } from "@/components/forms/text-form-field";
import { TextareaFormField } from "@/components/forms/textarea-form-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/list-page";
import { BandHeroUploadField } from "@/components/files/file-upload-field";
import { useResolvedAssetUrl } from "@/components/files/stored-asset-image";
import { BandPayeePayoutMethodField } from "@/components/bands/band-payee-payout-method-field";
import { useConvexForm } from "@/hooks/use-convex-form";
import { useBandPublicSlugAutofill } from "@/hooks/use-band-public-slug-autofill";
import {
  BAND_PAYEE_1099_NOTICE,
  BAND_PAYEE_MAILING_ADDRESS_HINT,
  BAND_PAYEE_MAILING_ADDRESS_PLACEHOLDER,
  DEFAULT_BAND_PAYEE_PAYOUT_METHOD,
  type BandPayeePayoutMethod,
} from "@/lib/band-payout-copy";
import { bandOrgProfileSchema, type BandOrgProfileFormValues } from "@/lib/validations/users";
import { ensureBandPublicSlug } from "@/lib/validations/bands";
import { useAdminBandSelection } from "@/components/bands/admin-band-selection";
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

function valuesFromOrg(org: {
  displayName: string;
  bio: string;
  oneLiner: string;
  genres: string[];
  demoURL: string;
  mainContactName: string;
  mainContactEmail: string;
  mainContactPhone: string;
  performerHourlyRateUsd: number;
  designatedPayeeUserId: string;
  designatedPayeeName: string;
  designatedPayeeEmail: string;
  designatedPayeeMailingAddress: string;
  designatedPayeePayoutMethod: string;
  publicListing: boolean;
  publicSlug: string;
  publicHeroImageUrl: string;
  artistLinks?: Array<{ label: string; url: string; icon?: string }>;
}): BandOrgProfileFormValues {
  return {
    displayName: org.displayName ?? "",
    bio: org.bio ?? "",
    ...bandListingFieldsFromProfile(org),
    performerHourlyRateUsd: org.performerHourlyRateUsd ?? 0,
    designatedPayeeUserId: org.designatedPayeeUserId ?? "",
    designatedPayeeName: org.designatedPayeeName ?? "",
    designatedPayeeEmail: org.designatedPayeeEmail ?? "",
    designatedPayeeMailingAddress: org.designatedPayeeMailingAddress ?? "",
    designatedPayeePayoutMethod:
      org.designatedPayeePayoutMethod === "pickup" || org.designatedPayeePayoutMethod === "delivery"
        ? org.designatedPayeePayoutMethod
        : DEFAULT_BAND_PAYEE_PAYOUT_METHOD,
    artistLinks: org.artistLinks ?? [],
    publicListing: org.publicListing ?? false,
    publicSlug: org.publicSlug ?? "",
    publicHeroImageUrl: org.publicHeroImageUrl ?? "",
  };
}

export function AdminBandProfileClient() {
  const { organizationId } = useAdminBandSelection();
  const bands = useQuery(api.users.listBandOrganizationsAdmin, { includeArchived: false });
  const updateBand = useMutation(api.users.updateBandOrganizationProfileAdmin);
  const org = bands?.find((row) => row.organizationId === organizationId);
  const hydratedOrganizationId = useRef<string | null>(null);

  const form = useConvexForm<BandOrgProfileFormValues>({
    schema: bandOrgProfileSchema,
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
      designatedPayeeUserId: "",
      designatedPayeeName: "",
      designatedPayeeEmail: "",
      designatedPayeeMailingAddress: "",
      designatedPayeePayoutMethod: DEFAULT_BAND_PAYEE_PAYOUT_METHOD,
      artistLinks: [],
      publicListing: false,
      publicSlug: "",
      publicHeroImageUrl: "",
    },
    mode: "onChange",
  });

  const watched = form.watch();
  const heroUrl = useResolvedAssetUrl(watched.publicHeroImageUrl);
  const { markSlugTouched, syncSlugTouchedFromForm, resetSlugTouched } =
    useBandPublicSlugAutofill(form);

  // Hydrate from the loaded row. Switching bands is authoritative even when the
  // form is dirty, and the row is normalized the same way a save is, so the
  // form does not load dirty.
  useEffect(() => {
    if (!organizationId || !org) return;
    const switchedBand = hydratedOrganizationId.current !== organizationId;
    if (!switchedBand && form.formState.isDirty) return;
    hydratedOrganizationId.current = organizationId;
    resetSlugTouched();
    form.reset(valuesFromOrg(org));
    syncSlugTouchedFromForm();
  }, [organizationId, org, form, resetSlugTouched, syncSlugTouchedFromForm]);

  const onSave = form.submitMutation(
    async (values) => {
      if (!organizationId) throw new Error("Select an artist first.");
      if (!org || org.organizationId !== organizationId) {
        throw new Error("Selected artist is still loading. Wait a moment and try again.");
      }
      const payoutMethod =
        values.designatedPayeePayoutMethod === "pickup" ||
        values.designatedPayeePayoutMethod === "delivery"
          ? values.designatedPayeePayoutMethod
          : DEFAULT_BAND_PAYEE_PAYOUT_METHOD;
      const payload = ensureBandPublicSlug(values);
      await updateBand({
        organizationId,
        displayName: trimOptional(payload.displayName),
        bio: trimOptional(payload.bio),
        ...bandListingFieldsToMutation(payload),
        performerHourlyRateUsd: payload.performerHourlyRateUsd,
        designatedPayeeUserId: trimOptional(payload.designatedPayeeUserId),
        designatedPayeeName: trimOptional(payload.designatedPayeeName),
        designatedPayeeEmail: trimOptional(payload.designatedPayeeEmail),
        designatedPayeeMailingAddress: trimOptional(payload.designatedPayeeMailingAddress),
        designatedPayeePayoutMethod: payoutMethod,
        ...bandPublicUrlsToMutation(payload),
        publicListing: payload.publicListing,
      });
      return payload;
    },
    {
      onSuccess: (values) => {
        form.reset(values);
        syncSlugTouchedFromForm();
      },
    },
  );

  if (!organizationId) {
    return (
      <EmptyState>Pick an artist in the header to edit their profile.</EmptyState>
    );
  }

  if (bands === undefined || !org) {
    return <p className="text-sm text-muted-foreground">Loading artist profile…</p>;
  }

  const payoutMethod =
    form.watch("designatedPayeePayoutMethod") === "delivery"
      ? "delivery"
      : form.watch("designatedPayeePayoutMethod") === "pickup"
        ? "pickup"
        : DEFAULT_BAND_PAYEE_PAYOUT_METHOD;

  return (
    <div className="space-y-4 pb-20">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <Form {...form}>
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
                  <BandPublicListingToggle control={form.control} />
                </CardHeader>
                <CardContent className="space-y-3">
                  <TextFormField name="displayName" label="Display name" />
                  <TextareaFormField name="bio" label="Bio" />
                  <BandPublicListingFields />
                  <Controller
                    control={form.control}
                    name="artistLinks"
                    render={({ field }) => (
                      <MarketingLinksEditor
                        idPrefix="admin-band-artist-links"
                        links={field.value ?? []}
                        onLinksChange={field.onChange}
                      />
                    )}
                  />
                  <BandHeroUploadField
                    organizationId={organizationId}
                    currentUrl={form.watch("publicHeroImageUrl")}
                    urlValue={form.watch("publicHeroImageUrl")}
                    onUploaded={(url) => form.setValue("publicHeroImageUrl", url, { shouldDirty: true })}
                    onUrlChange={(url) => form.setValue("publicHeroImageUrl", url, { shouldDirty: true })}
                    onClear={() => form.setValue("publicHeroImageUrl", "", { shouldDirty: true })}
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

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CurrencyDollarIcon className="size-4 text-muted-foreground" aria-hidden />
                    Payment payee
                  </CardTitle>
                  <CardDescription>
                    Only Arbor staff see this. Artists can also edit it on their Payments tab.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-2 md:grid-cols-2">
                    <TextFormField name="designatedPayeeName" label="Payee name" />
                    <TextFormField name="designatedPayeeEmail" label="Payee email" />
                  </div>
                  <BandPayeePayoutMethodField
                    value={payoutMethod}
                    onChange={(method: BandPayeePayoutMethod) => {
                      form.setValue("designatedPayeePayoutMethod", method, { shouldDirty: true });
                    }}
                    idPrefix={`admin-band-profile-${organizationId}`}
                  />
                  <TextareaFormField
                    name="designatedPayeeMailingAddress"
                    label="Mailing address"
                    placeholder={BAND_PAYEE_MAILING_ADDRESS_PLACEHOLDER}
                  />
                  <p className="text-xs text-muted-foreground">{BAND_PAYEE_MAILING_ADDRESS_HINT}</p>
                  <p className="text-xs text-muted-foreground">{BAND_PAYEE_1099_NOTICE}</p>
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
        saveStatus={form.saveStatus}
        saveError={form.saveError}
        isDirty={form.formState.isDirty}
        onSave={() => void form.handleSubmit(onSave)()}
        onDiscard={() => {
          if (!org) return;
          resetSlugTouched();
          form.reset(valuesFromOrg(org));
          syncSlugTouchedFromForm();
        }}
        onRetry={() => void form.handleSubmit(onSave)()}
      />
    </div>
  );
}
