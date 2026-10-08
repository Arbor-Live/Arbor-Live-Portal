"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { z } from "zod";
import { api } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { useConvexForm } from "@/hooks/use-convex-form";
import { OnboardingIncompleteStepsList } from "@/components/bands/onboarding-incomplete-steps";
import { ListRow } from "@/components/list-row";
import { StatusPill } from "@/components/page-header";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  SheetSection,
  roleLabel,
  userStatusOption,
  type BandOrgRow,
  type OrgOption,
} from "@/components/users/directory/shared";

/** One Organizations row: any portal org, plus its artist profile when it is an artist org. */
export type DirectoryOrg = {
  id: string;
  name: string;
  displayName: string;
  slug: string;
  organizationType: OrgOption["organizationType"];
  archived: boolean;
  artist: BandOrgRow | null;
};

export const ORG_TYPE_LABELS: Record<DirectoryOrg["organizationType"], string> = {
  arbor_internal: "Internal",
  band: "Band",
  dj: "DJ",
  singer_songwriter: "Singer-songwriter",
  other: "Artist",
};

/** Actions shared by an Organizations row's `⋯` menu and the panel. Each returns whether it succeeded. */
export function useOrganizationActions() {
  const { confirm } = useAppDialog();
  const archiveOrg = useMutation(api.users.archiveBandOrganizationAdmin);
  const unarchiveOrg = useMutation(api.users.unarchiveBandOrganizationAdmin);
  const deleteArchivedOrg = useMutation(api.users.deleteArchivedBandOrganizationAdmin);
  const setActiveOrganization = useMutation(api.users.setActiveOrganization);

  return {
    async archive(org: DirectoryOrg) {
      const confirmed = await confirm({
        title: `Archive ${org.displayName}?`,
        description:
          "Members with no other active organization lose access. The organization and its history stay, and you can restore it later.",
        confirmLabel: "Archive",
        destructive: true,
      });
      if (!confirmed) return false;
      try {
        const result = await archiveOrg({ organizationId: org.id });
        notify.success(
          result.deactivatedUserIds.length > 0
            ? `Archived ${org.displayName}. Deactivated ${result.deactivatedUserIds.length} user(s) with no remaining access.`
            : `Archived ${org.displayName}.`,
        );
        return true;
      } catch (error) {
        notify.error(getConvexErrorMessage(error));
        return false;
      }
    },
    async restore(org: DirectoryOrg) {
      try {
        await unarchiveOrg({ organizationId: org.id });
        notify.success(`Restored ${org.displayName} from archive.`);
        return true;
      } catch (error) {
        notify.error(getConvexErrorMessage(error));
        return false;
      }
    },
    async deletePermanently(org: DirectoryOrg) {
      const confirmed = await confirm({
        title: `Permanently delete ${org.displayName}?`,
        description:
          "This removes memberships, onboarding, and event participation records. This cannot be undone.",
        confirmLabel: "Delete permanently",
        destructive: true,
      });
      if (!confirmed) return false;
      try {
        await deleteArchivedOrg({ organizationId: org.id });
        notify.success(`Deleted ${org.displayName}.`);
        return true;
      } catch (error) {
        notify.error(getConvexErrorMessage(error));
        return false;
      }
    },
    /** Opens the artist's portal without joining the org. Navigates away on success. */
    async viewAsArtist(org: DirectoryOrg) {
      try {
        await setActiveOrganization({ organizationId: org.id });
        notify.success(`Viewing as ${org.displayName}.`);
        window.location.href = "/dashboard";
        return true;
      } catch (error) {
        notify.error(getConvexErrorMessage(error));
        return false;
      }
    },
  };
}

export function OrganizationSheet({
  org,
  onAddPerson,
  onOpenChange,
}: {
  org: DirectoryOrg | null;
  onAddPerson: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={org !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg" data-testid="organization-sheet">
        {org ? (
          // Keyed so drafts reset when another organization opens.
          <OrganizationSheetBody key={org.id} org={org} onAddPerson={onAddPerson} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

const artistProfileSchema = z.object({
  displayName: z.string(),
  performerHourlyRateUsd: z
    .string()
    .refine((value) => Number.isFinite(Number(value || "0")) && Number(value || "0") >= 0, {
      message: "Enter a valid rate",
    }),
});

type ArtistProfileValues = z.infer<typeof artistProfileSchema>;

function artistValues(artist: BandOrgRow): ArtistProfileValues {
  return {
    displayName: artist.displayName ?? "",
    performerHourlyRateUsd: String(artist.performerHourlyRateUsd ?? 0),
  };
}

function OrganizationSheetBody({ org, onAddPerson }: { org: DirectoryOrg; onAddPerson: () => void }) {
  const actions = useOrganizationActions();
  const members = useQuery(api.users.listOrganizationMembersForAdmin, {
    organizationId: org.id,
  });
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex flex-wrap items-center gap-2">
          {org.displayName}
          <StatusPill tone={org.archived ? "neutral" : "emerald"}>
            {org.archived ? "Archived" : "Active"}
          </StatusPill>
        </SheetTitle>
        <SheetDescription>
          {ORG_TYPE_LABELS[org.organizationType]} · /{org.slug}
          {org.displayName !== org.name ? ` · ${org.name}` : ""}
        </SheetDescription>
      </SheetHeader>

      {org.artist ? <ArtistProfileSection artist={org.artist} archived={org.archived} /> : null}

      {org.artist?.awaitingOnboarding ? (
        <ArtistOnboardingSection artist={org.artist} archived={org.archived} />
      ) : null}

      <SheetSection title="Members" testId="organization-members">
        {members === undefined ? (
          <p className="text-sm text-muted-foreground">Loading members…</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No members yet.{" "}
            <button type="button" className="underline underline-offset-2" onClick={onAddPerson}>
              Add a person
            </button>{" "}
            to invite someone into it.
          </p>
        ) : (
          <ul className="divide-y border text-sm">
            {members.map((member) => {
              const status = userStatusOption(member.status);
              return (
                <ListRow
                  key={member.id}
                  href={`/dashboard/users?user=${member.id}`}
                  className="border-0 gap-2 pr-0 pl-0"
                  bodyClassName="gap-2 px-3 py-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{member.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{member.email}</span>
                  </span>
                  <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
                    {roleLabel(member.membershipRole)}
                  </span>
                  {member.status !== "active" ? (
                    <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
                      {status.label}
                    </span>
                  ) : null}
                </ListRow>
              );
            })}
          </ul>
        )}
      </SheetSection>

      {org.artist ? (
        <SheetFooter className="flex-row flex-wrap justify-end gap-2 border-t">
          {org.archived ? (
            <>
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void run(() => actions.restore(org))}>
                Restore
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() => void run(() => actions.deletePermanently(org))}
              >
                Delete permanently
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void run(() => actions.viewAsArtist(org))}>
                View as artist
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() => void run(() => actions.archive(org))}
              >
                Archive
              </Button>
            </>
          )}
        </SheetFooter>
      ) : null}
    </>
  );
}

function ArtistProfileSection({ artist, archived }: { artist: BandOrgRow; archived: boolean }) {
  const updateProfile = useMutation(api.users.updateBandOrganizationProfileAdmin);
  const form = useConvexForm<ArtistProfileValues>({
    schema: artistProfileSchema,
    defaultValues: artistValues(artist),
    mode: "onChange",
  });
  const { isDirty } = form.formState;

  useEffect(() => {
    if (form.formState.isDirty) return;
    form.reset(artistValues(artist));
  }, [artist, form]);

  const onSave = form.submitMutation(
    async (values) => {
      await updateProfile({
        organizationId: artist.organizationId,
        displayName: values.displayName || undefined,
        performerHourlyRateUsd: Number(values.performerHourlyRateUsd || "0"),
      });
      return values;
    },
    {
      onSuccess: (values) => {
        form.reset(values);
        notify.success(`Saved ${values.displayName || artist.name}.`);
      },
    },
  );

  const id = (name: string) => `org-${artist.organizationId}-${name}`;
  return (
    <SheetSection title="Artist profile">
      <fieldset disabled={archived} className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={id("display-name")}>Display name</Label>
          <Input id={id("display-name")} {...form.register("displayName")} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={id("rate")}>Rate / person / hr (USD)</Label>
          <Input id={id("rate")} inputMode="decimal" {...form.register("performerHourlyRateUsd")} />
          {form.formState.errors.performerHourlyRateUsd ? (
            <p className="text-sm text-destructive">{form.formState.errors.performerHourlyRateUsd.message}</p>
          ) : null}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {form.saveError ? <p className="mr-auto text-sm text-destructive">{form.saveError}</p> : null}
        <Button type="button" variant="outline" size="sm" asChild>
          <Link href="/dashboard/artists">Edit profile</Link>
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!isDirty || archived || form.saveStatus === "saving"}
          onClick={() => void form.handleSubmit(onSave)()}
        >
          {form.saveStatus === "saving" ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </SheetSection>
  );
}

function ArtistOnboardingSection({ artist, archived }: { artist: BandOrgRow; archived: boolean }) {
  const sendOnboardingReminder = useMutation(api.bandPayments.sendOnboardingReminderForOrganization);
  const refreshPendingPayments = useMutation(api.bandPayments.refreshPendingPaymentsForOrganization);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<string>) {
    setBusy(true);
    try {
      notify.success(await action());
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SheetSection title="Payout onboarding">
      {artist.onboardingIncompleteSteps.length > 0 ? (
        <OnboardingIncompleteStepsList steps={artist.onboardingIncompleteSteps} />
      ) : (
        <p className="text-sm text-muted-foreground">Onboarding hasn&apos;t started yet.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={busy || archived}
          onClick={() =>
            void run(async () => {
              const result = await sendOnboardingReminder({ organizationId: artist.organizationId });
              return result.enqueuedCount === 1
                ? "Onboarding reminder sent."
                : `Onboarding reminder sent to ${result.enqueuedCount} contacts.`;
            })
          }
        >
          Send reminder
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || archived}
          onClick={() =>
            void run(async () => {
              const result = await refreshPendingPayments({ organizationId: artist.organizationId });
              return result.updated > 0
                ? "Payout queue updated."
                : "Still pending onboarding — see missing steps.";
            })
          }
        >
          Recheck payouts
        </Button>
      </div>
    </SheetSection>
  );
}
