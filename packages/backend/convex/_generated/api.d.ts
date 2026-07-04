/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as adminDeletes from "../adminDeletes.js";
import type * as auth from "../auth.js";
import type * as bandPayments from "../bandPayments.js";
import type * as bootstrap from "../bootstrap.js";
import type * as capabilityDefinitions from "../capabilityDefinitions.js";
import type * as crons from "../crons.js";
import type * as email_authEmails from "../email/authEmails.js";
import type * as email_bandPaymentEmails from "../email/bandPaymentEmails.js";
import type * as email_bookingRequestEmails from "../email/bookingRequestEmails.js";
import type * as email_constants from "../email/constants.js";
import type * as email_enqueue from "../email/enqueue.js";
import type * as email_invitations from "../email/invitations.js";
import type * as email_invoiceEmailData from "../email/invoiceEmailData.js";
import type * as email_payingPartyEmails from "../email/payingPartyEmails.js";
import type * as email_paymentProofEmails from "../email/paymentProofEmails.js";
import type * as email_paymentProofReminderShared from "../email/paymentProofReminderShared.js";
import type * as email_paymentProofReminders from "../email/paymentProofReminders.js";
import type * as email_recipients from "../email/recipients.js";
import type * as email_reminders from "../email/reminders.js";
import type * as email_scheduleEmailData from "../email/scheduleEmailData.js";
import type * as email_send from "../email/send.js";
import type * as email_templates from "../email/templates.js";
import type * as email_triggers from "../email/triggers.js";
import type * as eventArtifacts from "../eventArtifacts.js";
import type * as eventAssignments from "../eventAssignments.js";
import type * as eventBands from "../eventBands.js";
import type * as eventCrew from "../eventCrew.js";
import type * as eventCrewAvailability from "../eventCrewAvailability.js";
import type * as eventExpenses from "../eventExpenses.js";
import type * as eventPullLists from "../eventPullLists.js";
import type * as eventRequests from "../eventRequests.js";
import type * as eventSchedule from "../eventSchedule.js";
import type * as eventSeries from "../eventSeries.js";
import type * as events from "../events.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as http_resendInbound from "../http/resendInbound.js";
import type * as immich from "../immich.js";
import type * as immichActions from "../immichActions.js";
import type * as immichDb from "../immichDb.js";
import type * as immichEnsure from "../immichEnsure.js";
import type * as inventoryCategories from "../inventoryCategories.js";
import type * as inventoryItems from "../inventoryItems.js";
import type * as inventoryPackages from "../inventoryPackages.js";
import type * as inventoryR2 from "../inventoryR2.js";
import type * as inventoryTypes from "../inventoryTypes.js";
import type * as invoiceContacts from "../invoiceContacts.js";
import type * as invoiceFeeDefinitions from "../invoiceFeeDefinitions.js";
import type * as invoiceGroups from "../invoiceGroups.js";
import type * as invoicePdf from "../invoicePdf.js";
import type * as invoiceSettings from "../invoiceSettings.js";
import type * as invoiceTerms from "../invoiceTerms.js";
import type * as invoices from "../invoices.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_bandPayments from "../lib/bandPayments.js";
import type * as lib_bookingChainDelete from "../lib/bookingChainDelete.js";
import type * as lib_bookingDayLoad from "../lib/bookingDayLoad.js";
import type * as lib_bookingRequestQuote from "../lib/bookingRequestQuote.js";
import type * as lib_contactName from "../lib/contactName.js";
import type * as lib_crewCost from "../lib/crewCost.js";
import type * as lib_crewTeams from "../lib/crewTeams.js";
import type * as lib_eventBandAccess from "../lib/eventBandAccess.js";
import type * as lib_eventSeriesCosts from "../lib/eventSeriesCosts.js";
import type * as lib_eventSeriesGeneration from "../lib/eventSeriesGeneration.js";
import type * as lib_eventStatus from "../lib/eventStatus.js";
import type * as lib_immichAccess from "../lib/immichAccess.js";
import type * as lib_immichAlbumLinks from "../lib/immichAlbumLinks.js";
import type * as lib_immichClient from "../lib/immichClient.js";
import type * as lib_immichValidators from "../lib/immichValidators.js";
import type * as lib_inventoryUpload from "../lib/inventoryUpload.js";
import type * as lib_invoiceEvents from "../lib/invoiceEvents.js";
import type * as lib_invoicePaymentStatus from "../lib/invoicePaymentStatus.js";
import type * as lib_marketingContent from "../lib/marketingContent.js";
import type * as lib_paymentProof from "../lib/paymentProof.js";
import type * as lib_publicQuoteView from "../lib/publicQuoteView.js";
import type * as lib_publicReferenceIds from "../lib/publicReferenceIds.js";
import type * as lib_publicSlug from "../lib/publicSlug.js";
import type * as lib_trustedOrigins from "../lib/trustedOrigins.js";
import type * as lostFoundSettings from "../lostFoundSettings.js";
import type * as marketingPosts from "../marketingPosts.js";
import type * as migrations_convertedEventLinks from "../migrations/convertedEventLinks.js";
import type * as migrations_referenceIds from "../migrations/referenceIds.js";
import type * as paymentProof from "../paymentProof.js";
import type * as paymentProofInternals from "../paymentProofInternals.js";
import type * as paymentProofPublic from "../paymentProofPublic.js";
import type * as publicDirectory from "../publicDirectory.js";
import type * as publicInventory from "../publicInventory.js";
import type * as publicMarketing from "../publicMarketing.js";
import type * as storageLocations from "../storageLocations.js";
import type * as userInvites from "../userInvites.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  adminDeletes: typeof adminDeletes;
  auth: typeof auth;
  bandPayments: typeof bandPayments;
  bootstrap: typeof bootstrap;
  capabilityDefinitions: typeof capabilityDefinitions;
  crons: typeof crons;
  "email/authEmails": typeof email_authEmails;
  "email/bandPaymentEmails": typeof email_bandPaymentEmails;
  "email/bookingRequestEmails": typeof email_bookingRequestEmails;
  "email/constants": typeof email_constants;
  "email/enqueue": typeof email_enqueue;
  "email/invitations": typeof email_invitations;
  "email/invoiceEmailData": typeof email_invoiceEmailData;
  "email/payingPartyEmails": typeof email_payingPartyEmails;
  "email/paymentProofEmails": typeof email_paymentProofEmails;
  "email/paymentProofReminderShared": typeof email_paymentProofReminderShared;
  "email/paymentProofReminders": typeof email_paymentProofReminders;
  "email/recipients": typeof email_recipients;
  "email/reminders": typeof email_reminders;
  "email/scheduleEmailData": typeof email_scheduleEmailData;
  "email/send": typeof email_send;
  "email/templates": typeof email_templates;
  "email/triggers": typeof email_triggers;
  eventArtifacts: typeof eventArtifacts;
  eventAssignments: typeof eventAssignments;
  eventBands: typeof eventBands;
  eventCrew: typeof eventCrew;
  eventCrewAvailability: typeof eventCrewAvailability;
  eventExpenses: typeof eventExpenses;
  eventPullLists: typeof eventPullLists;
  eventRequests: typeof eventRequests;
  eventSchedule: typeof eventSchedule;
  eventSeries: typeof eventSeries;
  events: typeof events;
  health: typeof health;
  http: typeof http;
  "http/resendInbound": typeof http_resendInbound;
  immich: typeof immich;
  immichActions: typeof immichActions;
  immichDb: typeof immichDb;
  immichEnsure: typeof immichEnsure;
  inventoryCategories: typeof inventoryCategories;
  inventoryItems: typeof inventoryItems;
  inventoryPackages: typeof inventoryPackages;
  inventoryR2: typeof inventoryR2;
  inventoryTypes: typeof inventoryTypes;
  invoiceContacts: typeof invoiceContacts;
  invoiceFeeDefinitions: typeof invoiceFeeDefinitions;
  invoiceGroups: typeof invoiceGroups;
  invoicePdf: typeof invoicePdf;
  invoiceSettings: typeof invoiceSettings;
  invoiceTerms: typeof invoiceTerms;
  invoices: typeof invoices;
  "lib/auth": typeof lib_auth;
  "lib/bandPayments": typeof lib_bandPayments;
  "lib/bookingChainDelete": typeof lib_bookingChainDelete;
  "lib/bookingDayLoad": typeof lib_bookingDayLoad;
  "lib/bookingRequestQuote": typeof lib_bookingRequestQuote;
  "lib/contactName": typeof lib_contactName;
  "lib/crewCost": typeof lib_crewCost;
  "lib/crewTeams": typeof lib_crewTeams;
  "lib/eventBandAccess": typeof lib_eventBandAccess;
  "lib/eventSeriesCosts": typeof lib_eventSeriesCosts;
  "lib/eventSeriesGeneration": typeof lib_eventSeriesGeneration;
  "lib/eventStatus": typeof lib_eventStatus;
  "lib/immichAccess": typeof lib_immichAccess;
  "lib/immichAlbumLinks": typeof lib_immichAlbumLinks;
  "lib/immichClient": typeof lib_immichClient;
  "lib/immichValidators": typeof lib_immichValidators;
  "lib/inventoryUpload": typeof lib_inventoryUpload;
  "lib/invoiceEvents": typeof lib_invoiceEvents;
  "lib/invoicePaymentStatus": typeof lib_invoicePaymentStatus;
  "lib/marketingContent": typeof lib_marketingContent;
  "lib/paymentProof": typeof lib_paymentProof;
  "lib/publicQuoteView": typeof lib_publicQuoteView;
  "lib/publicReferenceIds": typeof lib_publicReferenceIds;
  "lib/publicSlug": typeof lib_publicSlug;
  "lib/trustedOrigins": typeof lib_trustedOrigins;
  lostFoundSettings: typeof lostFoundSettings;
  marketingPosts: typeof marketingPosts;
  "migrations/convertedEventLinks": typeof migrations_convertedEventLinks;
  "migrations/referenceIds": typeof migrations_referenceIds;
  paymentProof: typeof paymentProof;
  paymentProofInternals: typeof paymentProofInternals;
  paymentProofPublic: typeof paymentProofPublic;
  publicDirectory: typeof publicDirectory;
  publicInventory: typeof publicInventory;
  publicMarketing: typeof publicMarketing;
  storageLocations: typeof storageLocations;
  userInvites: typeof userInvites;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("../betterAuth/_generated/component.js").ComponentApi<"betterAuth">;
  resend: import("@convex-dev/resend/_generated/component.js").ComponentApi<"resend">;
  r2: import("@convex-dev/r2/_generated/component.js").ComponentApi<"r2">;
};
