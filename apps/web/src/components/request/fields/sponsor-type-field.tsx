"use client";

import { useEffect } from "react";
import { useFormContext } from "react-hook-form";
import { SingleChoiceField } from "@/components/request/fields/single-choice-field";
import { OrganizationSearchField } from "@/components/request/fields/organization-search-field";
import {
  INDIVIDUAL_SPONSOR_TYPE,
  requiresOrganizationName,
  sponsorTypeOptionsForContext,
  type BookingRequestFormValues,
} from "@/lib/validations/booking-request";

export function SponsorTypeField() {
  const { watch, setValue } = useFormContext<BookingRequestFormValues>();
  const requestContext = watch("requestContext");
  const sponsorType = watch("sponsorType");
  const invoiceGroupId = watch("invoiceGroupId");
  const sponsorOptions = sponsorTypeOptionsForContext(requestContext);
  const showOrganization = requiresOrganizationName(sponsorType, invoiceGroupId);

  useEffect(() => {
    if (!showOrganization) {
      setValue("organization", "", { shouldDirty: true, shouldValidate: true });
      setValue("invoiceGroupId", "", { shouldDirty: true });
    }
  }, [showOrganization, setValue]);

  return (
    <div className="space-y-4">
      <SingleChoiceField
        name="sponsorType"
        options={sponsorOptions}
        otherFieldName="sponsorTypeOther"
        otherTriggerValue="Other"
        otherPlaceholder="Who is sponsoring this event?"
      />
      {showOrganization ? <OrganizationSearchField /> : null}
      {sponsorType === INDIVIDUAL_SPONSOR_TYPE ? (
        <p className="text-xs text-muted-foreground">
          Personal requests do not need an organization name.
        </p>
      ) : null}
    </div>
  );
}
