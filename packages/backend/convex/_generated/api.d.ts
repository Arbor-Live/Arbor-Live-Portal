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
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as inventoryCategories from "../inventoryCategories.js";
import type * as inventoryItems from "../inventoryItems.js";
import type * as inventoryPackages from "../inventoryPackages.js";
import type * as inventoryTypes from "../inventoryTypes.js";
import type * as storageLocations from "../storageLocations.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  bootstrap: typeof bootstrap;
  capabilityDefinitions: typeof capabilityDefinitions;
  health: typeof health;
  http: typeof http;
  inventoryCategories: typeof inventoryCategories;
  inventoryItems: typeof inventoryItems;
  inventoryPackages: typeof inventoryPackages;
  inventoryTypes: typeof inventoryTypes;
  storageLocations: typeof storageLocations;
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
