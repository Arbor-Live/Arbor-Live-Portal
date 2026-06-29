/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as adminDeletes from "../adminDeletes.js";
import type * as auth from "../auth.js";
import type * as bootstrap from "../bootstrap.js";
import type * as capabilityDefinitions from "../capabilityDefinitions.js";
import type * as crons from "../crons.js";
import type * as email_authEmails from "../email/authEmails.js";
import type * as email_bookingRequestEmails from "../email/bookingRequestEmails.js";
import type * as email_constants from "../email/constants.js";
import type * as email_enqueue from "../email/enqueue.js";
import type * as email_invitations from "../email/invitations.js";
import type * as email_invoiceEmailData from "../email/invoiceEmailData.js";
import type * as email_recipients from "../email/recipients.js";
import type * as email_reminders from "../email/reminders.js";
import type * as email_send from "../email/send.js";
import type * as email_templates from "../email/templates.js";
import type * as email_triggers from "../email/triggers.js";
import type * as eventArtifacts from "../eventArtifacts.js";
import type * as eventAssignments from "../eventAssignments.js";
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
import type * as inventoryCategories from "../inventoryCategories.js";
import type * as inventoryItems from "../inventoryItems.js";
import type * as inventoryPackages from "../inventoryPackages.js";
import type * as inventoryTypes from "../inventoryTypes.js";
import type * as invoiceContacts from "../invoiceContacts.js";
import type * as invoiceFeeDefinitions from "../invoiceFeeDefinitions.js";
import type * as invoiceGroups from "../invoiceGroups.js";
import type * as invoicePdf from "../invoicePdf.js";
import type * as invoiceSettings from "../invoiceSettings.js";
import type * as invoiceTerms from "../invoiceTerms.js";
import type * as invoices from "../invoices.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_bookingChainDelete from "../lib/bookingChainDelete.js";
import type * as lib_bookingRequestQuote from "../lib/bookingRequestQuote.js";
import type * as lib_crewCost from "../lib/crewCost.js";
import type * as lib_crewTeams from "../lib/crewTeams.js";
import type * as lib_eventSeriesCosts from "../lib/eventSeriesCosts.js";
import type * as lib_eventSeriesGeneration from "../lib/eventSeriesGeneration.js";
import type * as lib_eventStatus from "../lib/eventStatus.js";
import type * as lib_invoiceEvents from "../lib/invoiceEvents.js";
import type * as lib_invoicePdfGenerate from "../lib/invoicePdfGenerate.js";
import type * as lib_publicQuoteView from "../lib/publicQuoteView.js";
import type * as lib_publicReferenceIds from "../lib/publicReferenceIds.js";
import type * as lostFoundSettings from "../lostFoundSettings.js";
import type * as migrations_referenceIds from "../migrations/referenceIds.js";
import type * as publicInventory from "../publicInventory.js";
import type * as storageLocations from "../storageLocations.js";
import type * as userInvites from "../userInvites.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  adminDeletes: typeof adminDeletes;
  auth: typeof auth;
  bootstrap: typeof bootstrap;
  capabilityDefinitions: typeof capabilityDefinitions;
  crons: typeof crons;
  "email/authEmails": typeof email_authEmails;
  "email/bookingRequestEmails": typeof email_bookingRequestEmails;
  "email/constants": typeof email_constants;
  "email/enqueue": typeof email_enqueue;
  "email/invitations": typeof email_invitations;
  "email/invoiceEmailData": typeof email_invoiceEmailData;
  "email/recipients": typeof email_recipients;
  "email/reminders": typeof email_reminders;
  "email/send": typeof email_send;
  "email/templates": typeof email_templates;
  "email/triggers": typeof email_triggers;
  eventArtifacts: typeof eventArtifacts;
  eventAssignments: typeof eventAssignments;
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
  inventoryCategories: typeof inventoryCategories;
  inventoryItems: typeof inventoryItems;
  inventoryPackages: typeof inventoryPackages;
  inventoryTypes: typeof inventoryTypes;
  invoiceContacts: typeof invoiceContacts;
  invoiceFeeDefinitions: typeof invoiceFeeDefinitions;
  invoiceGroups: typeof invoiceGroups;
  invoicePdf: typeof invoicePdf;
  invoiceSettings: typeof invoiceSettings;
  invoiceTerms: typeof invoiceTerms;
  invoices: typeof invoices;
  "lib/auth": typeof lib_auth;
  "lib/bookingChainDelete": typeof lib_bookingChainDelete;
  "lib/bookingRequestQuote": typeof lib_bookingRequestQuote;
  "lib/crewCost": typeof lib_crewCost;
  "lib/crewTeams": typeof lib_crewTeams;
  "lib/eventSeriesCosts": typeof lib_eventSeriesCosts;
  "lib/eventSeriesGeneration": typeof lib_eventSeriesGeneration;
  "lib/eventStatus": typeof lib_eventStatus;
  "lib/invoiceEvents": typeof lib_invoiceEvents;
  "lib/invoicePdfGenerate": typeof lib_invoicePdfGenerate;
  "lib/publicQuoteView": typeof lib_publicQuoteView;
  "lib/publicReferenceIds": typeof lib_publicReferenceIds;
  lostFoundSettings: typeof lostFoundSettings;
  "migrations/referenceIds": typeof migrations_referenceIds;
  publicInventory: typeof publicInventory;
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
};
