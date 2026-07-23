"use client";

import { useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { FormSaveBar } from "@/components/forms";
import { Form } from "@/components/ui/form";
import { TextFormField } from "@/components/forms/text-form-field";
import { TextareaFormField } from "@/components/forms/textarea-form-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { UserSelect } from "@/components/users/user-select";
import { useConvexForm } from "@/hooks/use-convex-form";
import { bandPayeeSchema, type BandPayeeFormValues } from "@/lib/validations/bands";

export function BandPayeeSettingsSection() {
  const profile = useQuery(api.users.getActiveBandProfile, {});
  const members = useQuery(api.users.listMembersForActiveOrganization, {});
  const updateProfile = useMutation(api.users.updateActiveBandProfile);

  const form = useConvexForm<BandPayeeFormValues>({
    schema: bandPayeeSchema,
    defaultValues: {
      designatedPayeeUserId: "",
      designatedPayeeName: "",
      designatedPayeeEmail: "",
      designatedPayeeMailingAddress: "",
    },
    mode: "onChange",
  });

  useEffect(() => {
    if (!profile) return;
    if (form.formState.isDirty) return;
    form.reset({
      designatedPayeeUserId: profile.designatedPayeeUserId ?? "",
      designatedPayeeName: profile.designatedPayeeName ?? "",
      designatedPayeeEmail: profile.designatedPayeeEmail ?? "",
      designatedPayeeMailingAddress: profile.designatedPayeeMailingAddress ?? "",
    });
  }, [profile, form]);

  const onSave = form.submitMutation(
    async (values) => {
      if (!profile) throw new Error("Band profile is still loading.");
      // Preserve non-payee profile fields — updateActiveBandProfile clears omitted strings.
      await updateProfile({
        displayName: profile.displayName ?? "",
        bio: profile.bio,
        performerHourlyRateUsd: profile.performerHourlyRateUsd,
        designatedPayeeUserId: values.designatedPayeeUserId || undefined,
        designatedPayeeName: values.designatedPayeeName || undefined,
        designatedPayeeEmail: values.designatedPayeeEmail || undefined,
        designatedPayeeMailingAddress: values.designatedPayeeMailingAddress || undefined,
        publicWebsiteUrl: profile.publicWebsiteUrl,
        publicInstagramUrl: profile.publicInstagramUrl,
        publicYoutubeUrl: profile.publicYoutubeUrl,
        publicListing: profile.publicListing,
        publicSlug: profile.publicSlug,
        publicHeroImageUrl: profile.publicHeroImageUrl,
      });
      return values;
    },
    {
      onSuccess: (values) => {
        form.reset(values);
      },
    },
  );

  const payeeUserId = form.watch("designatedPayeeUserId");

  if (profile === undefined) {
    return <p className="text-sm text-muted-foreground">Loading payee settings…</p>;
  }

  return (
    <div className="space-y-4 pb-20">
      <Form {...form}>
        <form className="space-y-4">
          <Card id="payee">
            <CardHeader>
              <CardTitle>Payment payee</CardTitle>
              <CardDescription>
                Designate who receives Arbor Live payouts. The payee must be a band member account so
                they can e-sign payments in the portal.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!profile.payeeComplete ? (
                <p className="rounded-md border border-dashed px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
                  Required before band payments can be processed. Provide one designated payee who
                  receives and distributes payment, plus a mailing address for GrantEd.
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
                    form.setValue("designatedPayeeUserId", userId, { shouldDirty: true });
                    const user = (members ?? []).find((row) => row.userId === userId);
                    if (user) {
                      form.setValue("designatedPayeeName", user.name, { shouldDirty: true });
                      form.setValue("designatedPayeeEmail", user.email ?? "", { shouldDirty: true });
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

      <FormSaveBar
        tier="C"
        saveStatus={form.saveStatus}
        saveError={form.saveError}
        isDirty={form.formState.isDirty}
        onSave={() => void form.handleSubmit(onSave)()}
        onDiscard={() => {
          if (!profile) return;
          form.reset({
            designatedPayeeUserId: profile.designatedPayeeUserId ?? "",
            designatedPayeeName: profile.designatedPayeeName ?? "",
            designatedPayeeEmail: profile.designatedPayeeEmail ?? "",
            designatedPayeeMailingAddress: profile.designatedPayeeMailingAddress ?? "",
          });
        }}
        onRetry={() => void form.handleSubmit(onSave)()}
      />
    </div>
  );
}
