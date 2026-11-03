"use client";

import Link from "next/link";
import {
  CalendarBlankIcon,
  CarSimpleIcon,
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
import { Switch } from "@/components/ui/switch";
import { DraftTextarea } from "@/components/forms/draft-text-input";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import { VenuePicker } from "@/components/venues/venue-picker";
import { UserSelect } from "@/components/users/user-select";
import { CommentsSection } from "@/components/comments/comments-section";
import { BookingMessages } from "@/components/email-threads/booking-messages";
import { EventContactsSection } from "@/components/events/event-contacts-section";
import {
  EventPostMortemSection,
  EventPostMortemSummary,
} from "@/components/events/event-post-mortem-section";
import {
  eventTypeHasLogistics,
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
import { HashingCard } from "@/components/events/workspace/hashing-card";
import { useEventWorkspace } from "@/components/events/workspace/event-workspace-provider";
import { formatDateTimeRange } from "@/lib/format";
import { HASHING_BASE_PATH } from "@/lib/hashing-tabs";

export function OverviewTab() {
  const {
    eventId,
    eventData,
    draft,
    updateDraft,
    readOnly,
    canEdit,
    linkedInvoice,
    userSelectOptions,
    isHash,
    hasOperationsAccess,
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
                {isHash && eventData ? (
                  <p className="flex min-h-9 flex-wrap items-center gap-x-3 text-sm" data-testid="event-when-locked">
                    <span className="tabular-nums">
                      {formatDateTimeRange(eventData.event.startAt, eventData.event.endAt)}
                    </span>
                    <Link href={`${HASHING_BASE_PATH}/setup`} className="text-primary hover:underline">
                      Set in Hashing
                    </Link>
                  </p>
                ) : (
                  <DateTimeRangePicker
                    startValue={draft.startAt}
                    endValue={draft.endAt}
                    onChange={({ start, end }) => updateDraft({ startAt: start, endAt: end })}
                    placeholder="Select start and end"
                  />
                )}
              </Field>
              <Field label="Venue" icon={MapPinIcon}>
                {isHash && !eventData?.event.venueId ? (
                  <p className="flex min-h-9 items-center text-sm" data-testid="event-where-locked">
                    {eventData?.event.venueName ?? "No venue"}
                  </p>
                ) : (
                  <VenuePicker
                    value={draft.venueId}
                    onChange={(venueId) => updateDraft({ venueId })}
                    allowCreate
                  />
                )}
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
              {eventTypeHasLogistics(draft.eventType) ? (
                <Field
                  label="Cart event"
                  htmlFor="event-needs-cart"
                  icon={CarSimpleIcon}
                  hint="Gear moves by cart: setup and strike each need someone cart eligible."
                >
                  <div className="flex h-9 items-center gap-2">
                    <Switch
                      id="event-needs-cart"
                      checked={draft.needsCart}
                      onCheckedChange={(needsCart) => updateDraft({ needsCart })}
                      data-testid="event-needs-cart"
                    />
                    <span className="text-sm text-muted-foreground">
                      {draft.needsCart ? "Yes" : "No"}
                    </span>
                  </div>
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
              <Field label="Notes" htmlFor="event-notes" icon={NotepadIcon} className="md:col-span-2">
                <DraftTextarea
                  id="event-notes"
                  className="min-h-24"
                  value={draft.notes}
                  onCommit={(notes) => updateDraft({ notes })}
                  placeholder="Anything the team should know"
                />
              </Field>
            </fieldset>
          </CardContent>
        </Card>

        <EventContactsSection eventId={eventId} canEdit={canEdit} />
        <BookingMessages record={{ eventId }} />
        <EventFilesCard eventId={eventId} artifacts={eventData?.artifacts ?? []} canEdit={canEdit} />
        {isHash ? null : <EventPostMortemSection eventId={eventId} />}
        {canEdit && !isHash ? <EventPostMortemSummary eventId={eventId} /> : null}
      </div>

      <aside className="min-w-0 space-y-4">
        {isHash && hasOperationsAccess ? <HashingCard /> : null}
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
              <Field label="Operations Lead" icon={UserCircleIcon}>
                <UserSelect
                  value={draft.operationsLeadUserId}
                  onChange={(operationsLeadUserId) => updateDraft({ operationsLeadUserId })}
                  options={userSelectOptions}
                  emptyLabel="Select operations lead"
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
