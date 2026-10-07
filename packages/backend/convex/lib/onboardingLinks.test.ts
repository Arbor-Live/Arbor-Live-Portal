import { describe, expect, it } from "vitest";
import {
  FWS_JOB_INFO,
  ONBOARDING_LINKS,
  fwsJobInfoValue,
  onboardingLinksValue,
} from "./onboardingLinks";

// The validators are exact: a key added to a constant but not its validator
// makes `getMyCrewOnboarding` throw at runtime, which typecheck can't catch.
describe("onboarding link validators", () => {
  it("cover exactly the ONBOARDING_LINKS keys", () => {
    expect(Object.keys(onboardingLinksValue.fields).sort()).toEqual(Object.keys(ONBOARDING_LINKS).sort());
  });

  it("cover exactly the FWS_JOB_INFO keys", () => {
    expect(Object.keys(fwsJobInfoValue.fields).sort()).toEqual(Object.keys(FWS_JOB_INFO).sort());
  });
});
