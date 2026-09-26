import { describe, expect, it } from "vitest";
import { renderOnboardingCompletedEmail } from "../src/render";
import type { OnboardingCompletedEmailProps } from "../src/types";

const props = {
  crewName: "Alex Crew",
  crewEmail: "alex@stanford.edu",
  hasFederalWorkStudy: true,
  hasValidDriversLicense: false,
  signatureLegalName: "Alexandra Crew",
  studentId: "12345678",
  employmentStartDateLabel: "Sep 1, 2026",
  otherCampusEmploymentLabel: "No",
  i9ScheduledByFirstDay: true,
  hourlyRateLabel: "$20.00/hr · Normal",
  dashboardUsersUrl: "http://localhost:3000/dashboard/users",
} satisfies OnboardingCompletedEmailProps;

describe("renderOnboardingCompletedEmail", () => {
  it("includes the hourly rate for admins and HR", async () => {
    const html = await renderOnboardingCompletedEmail(props);
    expect(html).toContain("Rate");
    expect(html).toContain("$20.00/hr · Normal");
    expect(html).toContain("Alex Crew");
  });
});
