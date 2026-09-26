"use client";

import {
  CalendarBlankIcon,
  IdentificationBadgeIcon,
  MapPinIcon,
  NotepadIcon,
  ShapesIcon,
  SparkleIcon,
  TruckIcon,
  UserCircleIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateTimeRangePicker } from "@/components/ui/date-time-picker";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import { VenuePicker } from "@/components/venues/venue-picker";
import { UserSelect } from "@/components/users/user-select";
import { CommentsSection } from "@/components/comments/comments-section";
import { EventContactsSection } from "@/components/events/event-contacts-section";
import {
  EventPostMortemSection,
  EventPostMortemSummary,
} from "@/components/events/event-post-mortem-section";
import {
  FULFILLMENT_OPTIONS,
  RENTAL_EVENT_TYPES,
  type RentalFulfillmentMode,
} from "@/components/events/workspace/event-draft";
import {
  EventTypeSelect,
  Field,
  TeamsInterestedPicker,
} from "@/components/events/workspace/event-fields";
import { EventFilesCard } from "@/components/events/workspace/event-files-card";
import { useEventWorkspace } from "@/components/events/workspace/event-workspace-provider";

export function OverviewTab() {
  const {
    eventId,
    eventData,
    draft,
    updateDraft,
    readOnly,
    canEdit,
    isAdmin,
    linkedInvoice,
    userSelectOptions,
  } = useEventWorkspace();
  const showFulfillment = RENTAL_EVENT_TYPES.includes(draft.eventType);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-4">
        {linkedInvoice?.clientApprovalStatus === "approved" && draft.status === "tentative" ? (
          <Alert>
            <SparkleIcon className="size-4" />
            <AlertDescription>
              The quote is approved — status moves to Logistics when you save.
            </AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <NotepadIcon className="size-4 text-muted-foreground" />
              Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <fieldset disabled={readOnly} className="grid gap-4 md:grid-cols-2">
              <Field label="When" icon={CalendarBlankIcon}>
                <DateTimeRangePicker
                  startValue={draft.startAt}
                  endValue={draft.endAt}
                  onChange={({ start, end }) => updateDraft({ startAt: start, endAt: end })}
                  placeholder="Select start and end"
                />
              </Field>
              <Field label="Venue" icon={MapPinIcon}>
                <VenuePicker
                  value={draft.venueId}
                  onChange={(venueId) => updateDraft({ venueId })}
                  allowCreate={isAdmin}
                />
              </Field>
              <Field label="Event Type" icon={ShapesIcon}>
                <EventTypeSelect
                  value={draft.eventType}
                  onChange={(eventType) => updateDraft({ eventType })}
                />
              </Field>
              {showFulfillment ? (
                <Field label="Fulfillment" icon={TruckIcon}>
                  <SearchableSelect
                    value={draft.rentalFulfillmentMode}
                    onChange={(value) =>
                      updateDraft({ rentalFulfillmentMode: value as RentalFulfillmentMode })
                    }
                    options={FULFILLMENT_OPTIONS}
                    placeholder="Search fulfillment..."
                  />
                </Field>
              ) : null}
              <Field
                label="Teams interested"
                icon={UsersThreeIcon}
                className="md:col-span-2"
                hint="Teams that get pinged about this event."
              >
                <TeamsInterestedPicker
                  value={draft.teamsInterested}
                  onChange={(teamsInterested) => updateDraft({ teamsInterested })}
                  disabled={readOnly}
                />
              </Field>
              <Field label="Notes" icon={NotepadIcon} className="md:col-span-2">
                <textarea
                  className="min-h-24 w-full border bg-background px-3 py-2 text-sm"
                  value={draft.notes}
                  onChange={(e) => updateDraft({ notes: e.target.value })}
                  placeholder="Anything the team should know"
                />
              </Field>
            </fieldset>
          </CardContent>
        </Card>

        <EventContactsSection eventId={eventId} canEdit={canEdit} />
        <EventFilesCard eventId={eventId} artifacts={eventData?.artifacts ?? []} canEdit={canEdit} />
        <EventPostMortemSection eventId={eventId} />
        {canEdit ? <EventPostMortemSummary eventId={eventId} /> : null}
      </div>

      <aside className="min-w-0 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IdentificationBadgeIcon className="size-4 text-muted-foreground" />
              People
            </CardTitle>
          </CardHeader>
          <CardContent>
            <fieldset disabled={readOnly} className="space-y-4">
              <Field label="Event Manager" icon={UserCircleIcon}>
                <UserSelect
                  value={draft.managerUserId}
                  onChange={(managerUserId) => updateDraft({ managerUserId })}
                  options={userSelectOptions}
                  emptyLabel="Select event manager"
                  clearable
                />
              </Field>
              <Field label="Day-Of Lead" icon={UserCircleIcon}>
                <UserSelect
                  value={draft.dayOfLeadUserId}
                  onChange={(dayOfLeadUserId) => updateDraft({ dayOfLeadUserId })}
                  options={userSelectOptions}
                  emptyLabel="Select day-of lead"
                  clearable
                />
              </Field>
            </fieldset>
          </CardContent>
        </Card>
        <CommentsSection subjectType="event" subjectId={eventId} />
      </aside>
    </div>
  );
}
