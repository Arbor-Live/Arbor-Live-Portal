import { createElement, type ComponentProps } from "react";
import {
  BellIcon,
  CalendarXIcon,
  ChatCircleIcon,
  ClipboardTextIcon,
  CurrencyDollarIcon,
  DeviceMobileIcon,
  ImagesIcon,
  ListChecksIcon,
  MicrophoneStageIcon,
  PackageIcon,
  ReceiptIcon,
  SignatureIcon,
  TruckIcon,
  UserCircleIcon,
  UsersThreeIcon,
  WarningIcon,
  type Icon,
} from "@phosphor-icons/react";

/** Row icon per notification template (mirrors IN_APP_TEMPLATES in the backend). */
const TEMPLATE_ICONS: Record<string, Icon> = {
  event_cancelled: CalendarXIcon,
  schedule_published: UsersThreeIcon,
  crew_scheduled: UsersThreeIcon,
  crew_unscheduled: UsersThreeIcon,
  schedule_reminder: UsersThreeIcon,
  booking_request_admin: ClipboardTextIcon,
  payment_proof_submitted: ReceiptIcon,
  quote_changes_requested: ReceiptIcon,
  quote_approved: ReceiptIcon,
  paying_party_added: ReceiptIcon,
  band_assigned: MicrophoneStageIcon,
  band_scheduled: MicrophoneStageIcon,
  band_unscheduled: MicrophoneStageIcon,
  band_event_onboarding_invite: MicrophoneStageIcon,
  band_onboarding_reminder: ListChecksIcon,
  band_payment_confirmation: SignatureIcon,
  band_payment_completed: CurrencyDollarIcon,
  band_payment_payee_required: CurrencyDollarIcon,
  onboarding_completed: UserCircleIcon,
  onboarding_reminder: ListChecksIcon,
  band_application_received: ClipboardTextIcon,
  crew_application_received: ClipboardTextIcon,
  artist_need_inquiry: ClipboardTextIcon,
  rental_outbound_packed: TruckIcon,
  rental_return_processed: TruckIcon,
  post_event_album: ImagesIcon,
  event_comment_mention: ChatCircleIcon,
  comment_mention: ChatCircleIcon,
  equipment_borrow_request_admin: PackageIcon,
  equipment_borrow_request_decided: PackageIcon,
  damage_report_admin: WarningIcon,
  app_install: DeviceMobileIcon,
};

/** The row icon for a notification template; a bell for anything unmapped. */
export function NotificationKindIcon({
  template,
  ...props
}: { template: string } & ComponentProps<Icon>) {
  return createElement(TEMPLATE_ICONS[template] ?? BellIcon, props);
}

/**
 * Titles mirror email subjects ("You're scheduled: Frost Music Festival").
 * Split the prefix off as the row's small label so the subject reads first.
 */
export function splitNotificationTitle(title: string): { label?: string; title: string } {
  const index = title.indexOf(": ");
  if (index <= 0 || index > 48) return { title };
  return { label: title.slice(0, index), title: title.slice(index + 2) };
}
