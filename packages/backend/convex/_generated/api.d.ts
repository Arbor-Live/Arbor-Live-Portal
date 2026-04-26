/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as bootstrap from "../bootstrap.js";
import type * as capabilityDefinitions from "../capabilityDefinitions.js";
import type * as eventArtifacts from "../eventArtifacts.js";
import type * as eventAssignments from "../eventAssignments.js";
import type * as eventCrew from "../eventCrew.js";
import type * as eventExpenses from "../eventExpenses.js";
import type * as eventSchedule from "../eventSchedule.js";
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
import type * as lostFoundSettings from "../lostFoundSettings.js";
import type * as publicInventory from "../publicInventory.js";
import type * as storageLocations from "../storageLocations.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  bootstrap: typeof bootstrap;
  capabilityDefinitions: typeof capabilityDefinitions;
  eventArtifacts: typeof eventArtifacts;
  eventAssignments: typeof eventAssignments;
  eventCrew: typeof eventCrew;
  eventExpenses: typeof eventExpenses;
  eventSchedule: typeof eventSchedule;
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
  lostFoundSettings: typeof lostFoundSettings;
  publicInventory: typeof publicInventory;
  storageLocations: typeof storageLocations;
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
};
