"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { FormSaveBar } from "@/components/forms";
import { Form, FormField } from "@/components/ui/form";
import { TextFormField } from "@/components/forms/text-form-field";
import { TextareaFormField } from "@/components/forms/textarea-form-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BandHeroUploadField } from "@/components/files/file-upload-field";
import { BandPayeePayoutMethodField } from "@/components/bands/band-payee-payout-method-field";
import { useConvexForm } from "@/hooks/use-convex-form";
import {
  BAND_PAYEE_1099_NOTICE,
  BAND_PAYEE_MAILING_ADDRESS_HINT,
  BAND_PAYEE_MAILING_ADDRESS_PLACEHOLDER,
  DEFAULT_BAND_PAYEE_PAYOUT_METHOD,
  type BandPayeePayoutMethod,
} from "@/lib/band-payout-copy";
import { bandOrgProfileSchema, type BandOrgProfileFormValues } from "@/lib/validations/users";
import { useAdminBandSelection } from "@/components/bands/admin-band-selection";
import { bandListingFieldsFromProfile, bandListingFieldsToMutation } from "@/lib/band-profile-lists";
import { BandListingProfileFields } from "@/components/bands/band-listing-profile-fields";

function valuesFromOrg(org: {
  displayName: string;
  bio: string;
  oneLiner: string;
  genres: string[];
  demoURL: string;
  bandMembers: string[];
  mainContactName: string;
  mainContactEmail: string;
  mainContactPhone: string;
  performerHourlyRateUsd: number;
  designatedPayeeUserId: string;
  designatedPayeeName: string;
  designatedPayeeEmail: string;
  designatedPayeeMailingAddress: string;
  designatedPayeePayoutMethod: string;
  publicWebsiteUrl: string;
  publicInstagramUrl: string;
  publicYoutubeUrl: string;
  publicSpotifyUrl: string;
  publicListing: boolean;
  publicSlug: string;
  publicHeroImageUrl: string;
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
    publicWebsiteUrl: org.publicWebsiteUrl ?? "",
    publicInstagramUrl: org.publicInstagramUrl ?? "",
    publicYoutubeUrl: org.publicYoutubeUrl ?? "",
    publicSpotifyUrl: org.publicSpotifyUrl ?? "",
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

  useEffect(() => {
    if (!organizationId || !org) return;
    const switchedBand = hydratedOrganizationId.current !== organizationId;
    // Switching bands must always reload. Same-band server refreshes keep dirty edits.
    if (!switchedBand && form.formState.isDirty) return;
    hydratedOrganizationId.current = organizationId;
    form.reset(valuesFromOrg(org));
  }, [organizationId, org, form]);

  const onSave = form.submitMutation(
    async (values) => {
      if (!organizationId) throw new Error("Select a band first.");
      if (!org || org.organizationId !== organizationId) {
        throw new Error("Selected band is still loading. Wait a moment and try again.");
      }
      const payoutMethod =
        values.designatedPayeePayoutMethod === "pickup" ||
        values.designatedPayeePayoutMethod === "delivery"
          ? values.designatedPayeePayoutMethod
          : DEFAULT_BAND_PAYEE_PAYOUT_METHOD;
      await updateBand({
        organizationId,
        displayName: values.displayName || undefined,
        bio: values.bio || undefined,
        ...bandListingFieldsToMutation(values),
        performerHourlyRateUsd: values.performerHourlyRateUsd,
        designatedPayeeUserId: values.designatedPayeeUserId || undefined,
        designatedPayeeName: values.designatedPayeeName || undefined,
        designatedPayeeEmail: values.designatedPayeeEmail || undefined,
        designatedPayeeMailingAddress: values.designatedPayeeMailingAddress || undefined,
        designatedPayeePayoutMethod: payoutMethod,
        publicWebsiteUrl: values.publicWebsiteUrl || undefined,
        publicInstagramUrl: values.publicInstagramUrl || undefined,
        publicYoutubeUrl: values.publicYoutubeUrl || undefined,
        publicSpotifyUrl: values.publicSpotifyUrl || undefined,
        publicListing: values.publicListing,
        publicSlug: values.publicSlug || undefined,
        publicHeroImageUrl: values.publicHeroImageUrl || undefined,
      });
      return values;
    },
    {
      onSuccess: (values) => {
        form.reset(values);
      },
    },
  );

  if (!organizationId) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          Select a band above to edit its profile.
        </CardContent>
      </Card>
    );
  }

  if (bands === undefined || !org) {
    return <p className="text-sm text-muted-foreground">Loading band profile…</p>;
  }

  const payoutMethod =
    form.watch("designatedPayeePayoutMethod") === "delivery"
      ? "delivery"
      : form.watch("designatedPayeePayoutMethod") === "pickup"
        ? "pickup"
        : DEFAULT_BAND_PAYEE_PAYOUT_METHOD;

  return (
    <div className="space-y-4 pb-20">
      <Form {...form}>
        <form className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Band public profile</CardTitle>
              <CardDescription>
                Editing {org.displayName || org.name} without joining the organization.
              </CardDescription>
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
                    control={form.control}
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
                  organizationId={organizationId}
                  currentUrl={form.watch("publicHeroImageUrl")}
                  urlValue={form.watch("publicHeroImageUrl")}
                  onUploaded={(url) => form.setValue("publicHeroImageUrl", url, { shouldDirty: true })}
                  onUrlChange={(url) => form.setValue("publicHeroImageUrl", url, { shouldDirty: true })}
                  onClear={() => form.setValue("publicHeroImageUrl", "", { shouldDirty: true })}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payment payee</CardTitle>
              <CardDescription>
                Bands can also edit this on their Payments tab. Admins can set it here when needed.
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
      <FormSaveBar
        tier="C"
        saveStatus={form.saveStatus}
        saveError={form.saveError}
        isDirty={form.formState.isDirty}
        onSave={() => void form.handleSubmit(onSave)()}
        onDiscard={() => {
          if (!org) return;
          form.reset(valuesFromOrg(org));
        }}
        onRetry={() => void form.handleSubmit(onSave)()}
      />
    </div>
  );
}
