"use client";

import { useMemo } from "react";
import { useMutation } from "convex/react";
import { EnvelopeSimpleIcon, UserIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { notify } from "@/lib/notify";
import { useConvexForm } from "@/hooks/use-convex-form";
import { TextFormField } from "@/components/forms/text-form-field";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  VerticalsAndDisciplines,
  getRoleOptionsForOrg,
  isArborOrg,
  type OrgOption,
} from "@/components/users/directory/shared";
import {
  USER_INVITE_KIND_OPTIONS,
  addPersonSchema,
  type AddPersonFormValues,
  type CrewRateModeOption,
  type PayrollMethodOption,
  type UserInviteKindOption,
} from "@/lib/validations/users";

const MODES = [
  { value: "invite", label: "Send invite", icon: EnvelopeSimpleIcon },
  { value: "create", label: "Create account", icon: UserIcon },
] as const;

function defaultValues(organizationId: string, orgOptions: OrgOption[]): AddPersonFormValues {
  return {
    mode: "invite",
    organizationId,
    email: "",
    name: "",
    title: "",
    password: "",
    role: getRoleOptionsForOrg(orgOptions, organizationId)[0]?.value ?? "member",
    inviteKind: "crew",
    verticals: [],
    disciplines: [],
    rateMode: "normal",
    customHourlyRateUsd: "0",
    payrollMethod: "stanford",
  };
}

/**
 * One way to add someone: email them an invite (they set up their own account),
 * or create the account directly with a temporary password. Both land the
 * person in the chosen organization with the same role and crew settings.
 */
export function AddPersonDialog({
  open,
  onOpenChange,
  orgOptions,
  defaultOrgId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgOptions: OrgOption[];
  defaultOrgId: string;
}) {
  const inviteUser = useMutation(api.users.inviteUserAdmin);
  const createUser = useMutation(api.users.createUserAdmin);
  const form = useConvexForm<AddPersonFormValues>({
    schema: addPersonSchema,
    defaultValues: defaultValues(defaultOrgId, orgOptions),
    mode: "onTouched",
  });

  const mode = form.watch("mode");
  const organizationId = form.watch("organizationId");
  const inviteKind = form.watch("inviteKind");
  const rateMode = form.watch("rateMode");
  const arborOrg = isArborOrg(orgOptions, organizationId);
  const showCompensation = arborOrg && inviteKind === "crew";
  const roleOptions = getRoleOptionsForOrg(orgOptions, organizationId);
  const submitting = form.saveStatus === "saving" || form.formState.isSubmitting;

  const orgSelectOptions = useMemo(
    () => orgOptions.map((org) => ({ value: org.id, label: org.name })),
    [orgOptions],
  );

  const onSubmit = form.submitMutation(async (values) => {
    const kind = arborOrg ? values.inviteKind : "crew";
    const crew = arborOrg && kind === "crew";
    const compensation = {
      inviteKind: arborOrg ? kind : undefined,
      rateMode: crew ? values.rateMode : undefined,
      customHourlyRateUsd:
        crew && values.rateMode === "custom" ? Number(values.customHourlyRateUsd || "0") : undefined,
      payrollMethod: crew ? values.payrollMethod : undefined,
    };
    if (values.mode === "invite") {
      await inviteUser({
        organizationId: values.organizationId,
        email: values.email.trim(),
        role: values.role,
        verticals: values.verticals,
        disciplines: values.disciplines,
        ...compensation,
      });
      notify.success("Invite sent.");
    } else {
      await createUser({
        organizationId: values.organizationId,
        name: values.name.trim(),
        title: values.title.trim() || undefined,
        email: values.email.trim(),
        tempPassword: values.password,
        role: values.role,
        verticals: values.verticals,
        disciplines: values.disciplines,
        ...compensation,
      });
      notify.success("User created.");
    }
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl" data-testid="add-person-dialog">
        <DialogHeader>
          <DialogTitle>Add person</DialogTitle>
          <DialogDescription>
            An invite emails a link to set up their own account. Creating the account signs them
            in with a temporary password you share.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <ToggleGroup
              type="single"
              variant="outline"
              aria-label="Add person mode"
              value={mode}
              onValueChange={(value) =>
                value && form.setValue("mode", value as AddPersonFormValues["mode"])
              }
              className="flex w-full"
            >
              {MODES.map(({ value, label, icon: ModeIcon }) => (
                <ToggleGroupItem key={value} value={value} className="flex-1 gap-1.5">
                  <ModeIcon className="size-4" aria-hidden />
                  {label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>

            <div className="space-y-1">
              <p className="text-sm font-medium">Organization</p>
              <SearchableSelect
                value={organizationId}
                onChange={(value) => {
                  form.setValue("organizationId", value, { shouldDirty: true, shouldValidate: true });
                  form.setValue("role", getRoleOptionsForOrg(orgOptions, value)[0]?.value ?? "member");
                }}
                options={orgSelectOptions}
                placeholder="Search organizations…"
                emptyLabel="Organization"
              />
              {form.formState.errors.organizationId ? (
                <p className="text-sm text-destructive">{form.formState.errors.organizationId.message}</p>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {mode === "create" ? (
                <>
                  <TextFormField name="name" label="Name" />
                  <TextFormField name="title" label="Title (optional)" />
                </>
              ) : null}
              <TextFormField name="email" label="Email" type="email" />
              {mode === "create" ? (
                <TextFormField name="password" label="Temporary password" type="password" />
              ) : null}
              <div className="space-y-1">
                <Label htmlFor="add-person-role">Role</Label>
                <Select
                  value={form.watch("role")}
                  onValueChange={(value) => form.setValue("role", value, { shouldDirty: true })}
                >
                  <SelectTrigger id="add-person-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {arborOrg ? (
                <div className="space-y-1">
                  <Label htmlFor="add-person-kind">Member type</Label>
                  <Select
                    value={inviteKind}
                    onValueChange={(value) =>
                      form.setValue("inviteKind", value as UserInviteKindOption, { shouldDirty: true })
                    }
                  >
                    <SelectTrigger id="add-person-kind">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {USER_INVITE_KIND_OPTIONS.map((kind) => (
                        <SelectItem key={kind} value={kind}>
                          {kind === "advisor" ? "Advisor" : "Crew"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>

            <VerticalsAndDisciplines
              verticals={form.watch("verticals")}
              disciplines={form.watch("disciplines")}
              onVerticalsChange={(next) => form.setValue("verticals", next, { shouldDirty: true })}
              onDisciplinesChange={(next) => form.setValue("disciplines", next, { shouldDirty: true })}
              idPrefix="add-person"
            />

            {showCompensation ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="add-person-rate">Rate</Label>
                  <Select
                    value={rateMode}
                    onValueChange={(value) =>
                      form.setValue("rateMode", value as CrewRateModeOption, { shouldDirty: true })
                    }
                  >
                    <SelectTrigger id="add-person-rate">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="add-person-payroll">Payment method</Label>
                  <Select
                    value={form.watch("payrollMethod")}
                    onValueChange={(value) =>
                      form.setValue("payrollMethod", value as PayrollMethodOption, { shouldDirty: true })
                    }
                  >
                    <SelectTrigger id="add-person-payroll">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stanford">Stanford payroll</SelectItem>
                      <SelectItem value="external">External payroll</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {rateMode === "custom" ? (
                  <TextFormField name="customHourlyRateUsd" label="Custom hourly rate (USD)" />
                ) : (
                  <p className="self-end pb-2 text-sm text-muted-foreground">
                    Uses the global {rateMode} rate.
                  </p>
                )}
              </div>
            ) : null}

            {form.saveError ? <p className="text-sm text-destructive">{form.saveError}</p> : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {mode === "invite" ? "Send invite" : "Create user"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
