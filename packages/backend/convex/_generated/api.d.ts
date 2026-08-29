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
import type * as analytics from "../analytics.js";
import type * as analyticsCrew from "../analyticsCrew.js";
import type * as analyticsDemand from "../analyticsDemand.js";
import type * as analyticsEvents from "../analyticsEvents.js";
import type * as analyticsFeedback from "../analyticsFeedback.js";
import type * as analyticsInstrumentation from "../analyticsInstrumentation.js";
import type * as analyticsOps from "../analyticsOps.js";
import type * as analyticsPostMortems from "../analyticsPostMortems.js";
import type * as auth from "../auth.js";
import type * as bandApplications from "../bandApplications.js";
import type * as bandPaymentPdfDownload from "../bandPaymentPdfDownload.js";
import type * as bandPayments from "../bandPayments.js";
import type * as bandRiderPdfDownload from "../bandRiderPdfDownload.js";
import type * as bandRiders from "../bandRiders.js";
import type * as bootstrap from "../bootstrap.js";
import type * as capabilityDefinitions from "../capabilityDefinitions.js";
import type * as comments from "../comments.js";
import type * as crewApplications from "../crewApplications.js";
import type * as crewPortal from "../crewPortal.js";
import type * as crons from "../crons.js";
import type * as damageReports from "../damageReports.js";
import type * as dashboardHome from "../dashboardHome.js";
import type * as dashboardPreferences from "../dashboardPreferences.js";
import type * as e2eBulkSeed from "../e2eBulkSeed.js";
import type * as e2eHelpers from "../e2eHelpers.js";
import type * as email_authEmails from "../email/authEmails.js";
import type * as email_bandAssignmentEmails from "../email/bandAssignmentEmails.js";
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
import type * as email_postEventAlbumReminders from "../email/postEventAlbumReminders.js";
import type * as email_quoteChangesRequestedEmails from "../email/quoteChangesRequestedEmails.js";
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
import type * as eventFeedback from "../eventFeedback.js";
import type * as eventNightRiderDownload from "../eventNightRiderDownload.js";
import type * as eventPatchPlan from "../eventPatchPlan.js";
import type * as eventPullLists from "../eventPullLists.js";
import type * as eventRentalFulfillment from "../eventRentalFulfillment.js";
import type * as eventRequests from "../eventRequests.js";
import type * as eventSchedule from "../eventSchedule.js";
import type * as eventSeries from "../eventSeries.js";
import type * as eventSeriesPullLists from "../eventSeriesPullLists.js";
import type * as eventShowFileDownload from "../eventShowFileDownload.js";
import type * as events from "../events.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as http_shortLinkRedirect from "../http/shortLinkRedirect.js";
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
import type * as invoicePdfDownload from "../invoicePdfDownload.js";
import type * as invoiceSettings from "../invoiceSettings.js";
import type * as invoiceTerms from "../invoiceTerms.js";
import type * as invoices from "../invoices.js";
import type * as lib_analyticsQuery from "../lib/analyticsQuery.js";
import type * as lib_analyticsTime from "../lib/analyticsTime.js";
import type * as lib_assetScan from "../lib/assetScan.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_bandIdentity from "../lib/bandIdentity.js";
import type * as lib_bandPayments from "../lib/bandPayments.js";
import type * as lib_bookingChainDelete from "../lib/bookingChainDelete.js";
import type * as lib_bookingDayLoad from "../lib/bookingDayLoad.js";
import type * as lib_bookingRequestQuote from "../lib/bookingRequestQuote.js";
import type * as lib_contactName from "../lib/contactName.js";
import type * as lib_copyDaySetup from "../lib/copyDaySetup.js";
import type * as lib_crewCompensation from "../lib/crewCompensation.js";
import type * as lib_crewCost from "../lib/crewCost.js";
import type * as lib_crewTeams from "../lib/crewTeams.js";
import type * as lib_crewTraineeIntro from "../lib/crewTraineeIntro.js";
import type * as lib_crewedEvents from "../lib/crewedEvents.js";
import type * as lib_e2eGuard from "../lib/e2eGuard.js";
import type * as lib_eventAccess from "../lib/eventAccess.js";
import type * as lib_eventBandAccess from "../lib/eventBandAccess.js";
import type * as lib_eventSeriesCosts from "../lib/eventSeriesCosts.js";
import type * as lib_eventSeriesGeneration from "../lib/eventSeriesGeneration.js";
import type * as lib_eventStatus from "../lib/eventStatus.js";
import type * as lib_eventVisibility from "../lib/eventVisibility.js";
import type * as lib_hostOrgIdentity from "../lib/hostOrgIdentity.js";
import type * as lib_hostOrgs from "../lib/hostOrgs.js";
import type * as lib_immichAccess from "../lib/immichAccess.js";
import type * as lib_immichAlbumLinks from "../lib/immichAlbumLinks.js";
import type * as lib_immichClient from "../lib/immichClient.js";
import type * as lib_immichValidators from "../lib/immichValidators.js";
import type * as lib_inventoryUpload from "../lib/inventoryUpload.js";
import type * as lib_invoiceDocumentBuild from "../lib/invoiceDocumentBuild.js";
import type * as lib_invoiceEvents from "../lib/invoiceEvents.js";
import type * as lib_invoicePaymentStatus from "../lib/invoicePaymentStatus.js";
import type * as lib_invoicePeople from "../lib/invoicePeople.js";
import type * as lib_invoiceProfit from "../lib/invoiceProfit.js";
import type * as lib_invoiceSeries from "../lib/invoiceSeries.js";
import type * as lib_marketingContent from "../lib/marketingContent.js";
import type * as lib_normalizeCrewLineLabel from "../lib/normalizeCrewLineLabel.js";
import type * as lib_onboardingLinks from "../lib/onboardingLinks.js";
import type * as lib_openMicAddon from "../lib/openMicAddon.js";
import type * as lib_otForecast from "../lib/otForecast.js";
import type * as lib_packageBom from "../lib/packageBom.js";
import type * as lib_packageContentMigration from "../lib/packageContentMigration.js";
import type * as lib_paymentProof from "../lib/paymentProof.js";
import type * as lib_publicEvents from "../lib/publicEvents.js";
import type * as lib_publicQuoteView from "../lib/publicQuoteView.js";
import type * as lib_publicReferenceIds from "../lib/publicReferenceIds.js";
import type * as lib_publicSlug from "../lib/publicSlug.js";
import type * as lib_r2Lifecycle from "../lib/r2Lifecycle.js";
import type * as lib_rentalFulfillment from "../lib/rentalFulfillment.js";
import type * as lib_riderSchema from "../lib/riderSchema.js";
import type * as lib_scheduleSiteRevalidation from "../lib/scheduleSiteRevalidation.js";
import type * as lib_shortLinkSlug from "../lib/shortLinkSlug.js";
import type * as lib_shortLinks from "../lib/shortLinks.js";
import type * as lib_siteRevalidation from "../lib/siteRevalidation.js";
import type * as lib_siteRevalidationPaths from "../lib/siteRevalidationPaths.js";
import type * as lib_stanfordHours from "../lib/stanfordHours.js";
import type * as lib_statusTransitions from "../lib/statusTransitions.js";
import type * as lib_trustedOrigins from "../lib/trustedOrigins.js";
import type * as lib_userProfileImage from "../lib/userProfileImage.js";
import type * as lib_userTimecards from "../lib/userTimecards.js";
import type * as lib_userVerticals from "../lib/userVerticals.js";
import type * as lib_username from "../lib/username.js";
import type * as lib_venueTypes from "../lib/venueTypes.js";
import type * as lib_venues from "../lib/venues.js";
import type * as lostFoundSettings from "../lostFoundSettings.js";
import type * as marketingDesigns from "../marketingDesigns.js";
import type * as marketingImmich from "../marketingImmich.js";
import type * as marketingImmichActions from "../marketingImmichActions.js";
import type * as marketingInstagram from "../marketingInstagram.js";
import type * as marketingInstagramActions from "../marketingInstagramActions.js";
import type * as marketingPosts from "../marketingPosts.js";
import type * as marketingSettings from "../marketingSettings.js";
import type * as migrations from "../migrations.js";
import type * as navBadges from "../navBadges.js";
import type * as onboarding from "../onboarding.js";
import type * as openMic from "../openMic.js";
import type * as organizationImporter from "../organizationImporter.js";
import type * as paymentProof from "../paymentProof.js";
import type * as paymentProofInternals from "../paymentProofInternals.js";
import type * as paymentProofPublic from "../paymentProofPublic.js";
import type * as postMortemFeedback from "../postMortemFeedback.js";
import type * as publicDirectory from "../publicDirectory.js";
import type * as publicEventPoster from "../publicEventPoster.js";
import type * as publicEvents from "../publicEvents.js";
import type * as publicInventory from "../publicInventory.js";
import type * as publicMarketing from "../publicMarketing.js";
import type * as r2Assets from "../r2Assets.js";
import type * as rateLimit from "../rateLimit.js";
import type * as shortLinks from "../shortLinks.js";
import type * as storageLocations from "../storageLocations.js";
import type * as timecards from "../timecards.js";
import type * as userInvites from "../userInvites.js";
import type * as users from "../users.js";
import type * as venues from "../venues.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  adminDeletes: typeof adminDeletes;
  analytics: typeof analytics;
  analyticsCrew: typeof analyticsCrew;
  analyticsDemand: typeof analyticsDemand;
  analyticsEvents: typeof analyticsEvents;
  analyticsFeedback: typeof analyticsFeedback;
  analyticsInstrumentation: typeof analyticsInstrumentation;
  analyticsOps: typeof analyticsOps;
  analyticsPostMortems: typeof analyticsPostMortems;
  auth: typeof auth;
  bandApplications: typeof bandApplications;
  bandPaymentPdfDownload: typeof bandPaymentPdfDownload;
  bandPayments: typeof bandPayments;
  bandRiderPdfDownload: typeof bandRiderPdfDownload;
  bandRiders: typeof bandRiders;
  bootstrap: typeof bootstrap;
  capabilityDefinitions: typeof capabilityDefinitions;
  comments: typeof comments;
  crewApplications: typeof crewApplications;
  crewPortal: typeof crewPortal;
  crons: typeof crons;
  damageReports: typeof damageReports;
  dashboardHome: typeof dashboardHome;
  dashboardPreferences: typeof dashboardPreferences;
  e2eBulkSeed: typeof e2eBulkSeed;
  e2eHelpers: typeof e2eHelpers;
  "email/authEmails": typeof email_authEmails;
  "email/bandAssignmentEmails": typeof email_bandAssignmentEmails;
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
  "email/postEventAlbumReminders": typeof email_postEventAlbumReminders;
  "email/quoteChangesRequestedEmails": typeof email_quoteChangesRequestedEmails;
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
  eventFeedback: typeof eventFeedback;
  eventNightRiderDownload: typeof eventNightRiderDownload;
  eventPatchPlan: typeof eventPatchPlan;
  eventPullLists: typeof eventPullLists;
  eventRentalFulfillment: typeof eventRentalFulfillment;
  eventRequests: typeof eventRequests;
  eventSchedule: typeof eventSchedule;
  eventSeries: typeof eventSeries;
  eventSeriesPullLists: typeof eventSeriesPullLists;
  eventShowFileDownload: typeof eventShowFileDownload;
  events: typeof events;
  health: typeof health;
  http: typeof http;
  "http/shortLinkRedirect": typeof http_shortLinkRedirect;
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
  invoicePdfDownload: typeof invoicePdfDownload;
  invoiceSettings: typeof invoiceSettings;
  invoiceTerms: typeof invoiceTerms;
  invoices: typeof invoices;
  "lib/analyticsQuery": typeof lib_analyticsQuery;
  "lib/analyticsTime": typeof lib_analyticsTime;
  "lib/assetScan": typeof lib_assetScan;
  "lib/auth": typeof lib_auth;
  "lib/bandIdentity": typeof lib_bandIdentity;
  "lib/bandPayments": typeof lib_bandPayments;
  "lib/bookingChainDelete": typeof lib_bookingChainDelete;
  "lib/bookingDayLoad": typeof lib_bookingDayLoad;
  "lib/bookingRequestQuote": typeof lib_bookingRequestQuote;
  "lib/contactName": typeof lib_contactName;
  "lib/copyDaySetup": typeof lib_copyDaySetup;
  "lib/crewCompensation": typeof lib_crewCompensation;
  "lib/crewCost": typeof lib_crewCost;
  "lib/crewTeams": typeof lib_crewTeams;
  "lib/crewTraineeIntro": typeof lib_crewTraineeIntro;
  "lib/crewedEvents": typeof lib_crewedEvents;
  "lib/e2eGuard": typeof lib_e2eGuard;
  "lib/eventAccess": typeof lib_eventAccess;
  "lib/eventBandAccess": typeof lib_eventBandAccess;
  "lib/eventSeriesCosts": typeof lib_eventSeriesCosts;
  "lib/eventSeriesGeneration": typeof lib_eventSeriesGeneration;
  "lib/eventStatus": typeof lib_eventStatus;
  "lib/eventVisibility": typeof lib_eventVisibility;
  "lib/hostOrgIdentity": typeof lib_hostOrgIdentity;
  "lib/hostOrgs": typeof lib_hostOrgs;
  "lib/immichAccess": typeof lib_immichAccess;
  "lib/immichAlbumLinks": typeof lib_immichAlbumLinks;
  "lib/immichClient": typeof lib_immichClient;
  "lib/immichValidators": typeof lib_immichValidators;
  "lib/inventoryUpload": typeof lib_inventoryUpload;
  "lib/invoiceDocumentBuild": typeof lib_invoiceDocumentBuild;
  "lib/invoiceEvents": typeof lib_invoiceEvents;
  "lib/invoicePaymentStatus": typeof lib_invoicePaymentStatus;
  "lib/invoicePeople": typeof lib_invoicePeople;
  "lib/invoiceProfit": typeof lib_invoiceProfit;
  "lib/invoiceSeries": typeof lib_invoiceSeries;
  "lib/marketingContent": typeof lib_marketingContent;
  "lib/normalizeCrewLineLabel": typeof lib_normalizeCrewLineLabel;
  "lib/onboardingLinks": typeof lib_onboardingLinks;
  "lib/openMicAddon": typeof lib_openMicAddon;
  "lib/otForecast": typeof lib_otForecast;
  "lib/packageBom": typeof lib_packageBom;
  "lib/packageContentMigration": typeof lib_packageContentMigration;
  "lib/paymentProof": typeof lib_paymentProof;
  "lib/publicEvents": typeof lib_publicEvents;
  "lib/publicQuoteView": typeof lib_publicQuoteView;
  "lib/publicReferenceIds": typeof lib_publicReferenceIds;
  "lib/publicSlug": typeof lib_publicSlug;
  "lib/r2Lifecycle": typeof lib_r2Lifecycle;
  "lib/rentalFulfillment": typeof lib_rentalFulfillment;
  "lib/riderSchema": typeof lib_riderSchema;
  "lib/scheduleSiteRevalidation": typeof lib_scheduleSiteRevalidation;
  "lib/shortLinkSlug": typeof lib_shortLinkSlug;
  "lib/shortLinks": typeof lib_shortLinks;
  "lib/siteRevalidation": typeof lib_siteRevalidation;
  "lib/siteRevalidationPaths": typeof lib_siteRevalidationPaths;
  "lib/stanfordHours": typeof lib_stanfordHours;
  "lib/statusTransitions": typeof lib_statusTransitions;
  "lib/trustedOrigins": typeof lib_trustedOrigins;
  "lib/userProfileImage": typeof lib_userProfileImage;
  "lib/userTimecards": typeof lib_userTimecards;
  "lib/userVerticals": typeof lib_userVerticals;
  "lib/username": typeof lib_username;
  "lib/venueTypes": typeof lib_venueTypes;
  "lib/venues": typeof lib_venues;
  lostFoundSettings: typeof lostFoundSettings;
  marketingDesigns: typeof marketingDesigns;
  marketingImmich: typeof marketingImmich;
  marketingImmichActions: typeof marketingImmichActions;
  marketingInstagram: typeof marketingInstagram;
  marketingInstagramActions: typeof marketingInstagramActions;
  marketingPosts: typeof marketingPosts;
  marketingSettings: typeof marketingSettings;
  migrations: typeof migrations;
  navBadges: typeof navBadges;
  onboarding: typeof onboarding;
  openMic: typeof openMic;
  organizationImporter: typeof organizationImporter;
  paymentProof: typeof paymentProof;
  paymentProofInternals: typeof paymentProofInternals;
  paymentProofPublic: typeof paymentProofPublic;
  postMortemFeedback: typeof postMortemFeedback;
  publicDirectory: typeof publicDirectory;
  publicEventPoster: typeof publicEventPoster;
  publicEvents: typeof publicEvents;
  publicInventory: typeof publicInventory;
  publicMarketing: typeof publicMarketing;
  r2Assets: typeof r2Assets;
  rateLimit: typeof rateLimit;
  shortLinks: typeof shortLinks;
  storageLocations: typeof storageLocations;
  timecards: typeof timecards;
  userInvites: typeof userInvites;
  users: typeof users;
  venues: typeof venues;
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
  migrations: import("@convex-dev/migrations/_generated/component.js").ComponentApi<"migrations">;
};
