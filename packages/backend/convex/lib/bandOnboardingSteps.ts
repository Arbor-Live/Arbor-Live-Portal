import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { BandOrgOnboardingStatus } from "./bandPayments";
import { isBandOrgOnboardingComplete } from "./bandPayments";

export const BAND_ONBOARDING_STEP_IDS = [
  "identity",
  "rates_payee",
  "members",
  "payment_explained",
  "finalize",
] as const;

export type BandOnboardingStepId = (typeof BAND_ONBOARDING_STEP_IDS)[number];

export const BAND_ONBOARDING_STEP_LABELS: Record<BandOnboardingStepId, string> = {
  identity: "Identity",
  rates_payee: "Rates & payee",
  members: "Members",
  payment_explained: "Payment explanation",
  finalize: "Submit final onboarding step",
};

export const bandOnboardingStepIdValue = v.union(
  v.literal("identity"),
  v.literal("rates_payee"),
  v.literal("members"),
  v.literal("payment_explained"),
  v.literal("finalize"),
);

export type BandOnboardingIncompleteStep = {
  id: BandOnboardingStepId;
  label: string;
};

const GATE_STEP_IDS = [
  "identity",
  "rates_payee",
  "members",
  "payment_explained",
] as const satisfies ReadonlyArray<Exclude<BandOnboardingStepId, "finalize">>;

/** Completion gates for `completeBandOnboarding` (hero/socials are optional). */
export function bandOnboardingIncompleteSteps(
  row: Doc<"organizationOnboarding"> | null | undefined,
): BandOnboardingIncompleteStep[] {
  if (row && isBandOrgOnboardingComplete(row.status as BandOrgOnboardingStatus)) {
    return [];
  }

  if (!row) {
    return GATE_STEP_IDS.map((id) => ({
      id,
      label: BAND_ONBOARDING_STEP_LABELS[id],
    }));
  }

  const missing: BandOnboardingIncompleteStep[] = [];
  if (!row.identityCompletedAt) {
    missing.push({ id: "identity", label: BAND_ONBOARDING_STEP_LABELS.identity });
  }
  if (!row.ratesPayeeCompletedAt) {
    missing.push({ id: "rates_payee", label: BAND_ONBOARDING_STEP_LABELS.rates_payee });
  }
  if (!row.membersCompletedAt && !row.soloAcknowledgedAt) {
    missing.push({ id: "members", label: BAND_ONBOARDING_STEP_LABELS.members });
  }
  if (!row.paymentExplainedAt) {
    missing.push({
      id: "payment_explained",
      label: BAND_ONBOARDING_STEP_LABELS.payment_explained,
    });
  }
  if (missing.length === 0) {
    return [{ id: "finalize", label: BAND_ONBOARDING_STEP_LABELS.finalize }];
  }
  return missing;
}

export const bandOnboardingIncompleteStepValidator = v.object({
  id: bandOnboardingStepIdValue,
  label: v.string(),
});
