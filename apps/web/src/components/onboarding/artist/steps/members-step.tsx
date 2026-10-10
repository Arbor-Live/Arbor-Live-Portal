import { PlusIcon, XIcon } from "@phosphor-icons/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OnboardingAckCheckbox } from "@/components/onboarding/onboarding-ui";
import type { FormState } from "../types";

export function MembersStep({
  form,
  patch,
  addInviteEmail,
  displayedInviteEmails,
  sentInviteEmails,
  inviteConfirmation,
}: {
  form: FormState;
  patch: (next: Partial<FormState>) => void;
  addInviteEmail: () => void;
  displayedInviteEmails: Array<{ email: string; bandRole: string; pending: boolean }>;
  sentInviteEmails: string[];
  inviteConfirmation: string | null;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground/70">
        Invite members now so you can designate one of them as the payee on the next
        step. You can invite multiple people.
      </p>
      <OnboardingAckCheckbox
        checked={form.isSolo}
        onChange={(next) =>
          patch({
            isSolo: next,
            inviteDraft: next ? "" : form.inviteDraft,
            inviteEmails: next ? [] : form.inviteEmails,
          })
        }
        label="I'm performing solo — no other members to invite."
      />
      {!form.isSolo ? (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="band-invite-email">Member email</Label>
              <Input
                id="band-invite-email"
                type="email"
                value={form.inviteDraft}
                onChange={(event) => patch({ inviteDraft: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  event.stopPropagation();
                  addInviteEmail();
                }}
                placeholder="name@example.com"
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="band-invite-role">Role</Label>
              <Input
                id="band-invite-role"
                value={form.inviteRoleDraft}
                onChange={(event) => patch({ inviteRoleDraft: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  event.stopPropagation();
                  addInviteEmail();
                }}
                placeholder="Guitarist, Manager…"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              className="shrink-0 gap-1.5 sm:mb-0"
              onClick={addInviteEmail}
            >
              <PlusIcon className="size-4" weight="bold" />
              Add
            </Button>
          </div>

          {displayedInviteEmails.length > 0 ? (
            <ul className="space-y-2">
              {displayedInviteEmails.map((row) => {
                const alreadySent = sentInviteEmails.includes(row.email) || row.pending;
                return (
                  <li
                    key={row.email}
                    className="flex items-center justify-between gap-2 border border-border/50 bg-background/50 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      {row.email}
                      {row.bandRole ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {row.bandRole}
                        </span>
                      ) : null}
                      {alreadySent ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          invited
                        </span>
                      ) : null}
                    </span>
                    {!alreadySent ? (
                      <button
                        type="button"
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          patch({
                            inviteEmails: form.inviteEmails.filter(
                              (entry) => entry.email !== row.email,
                            ),
                          })
                        }
                        aria-label={`Remove ${row.email}`}
                      >
                        <XIcon className="size-4" weight="bold" />
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              Add each member&apos;s email and role, then continue. Invites send when
              you click Next.
            </p>
          )}
        </div>
      ) : null}
      {inviteConfirmation ? (
        <Alert>
          <AlertDescription>{inviteConfirmation}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
