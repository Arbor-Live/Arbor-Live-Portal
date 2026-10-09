import type { FormState, StepId } from "./types";

export const QUESTION_STEPS: StepId[] = [
  "welcome",
  "profile",
  "passkey",
  "whatsapp",
  "instagram",
  "fws",
  "training",
  "gettingPaid",
  "hours",
  "contractorPay",
  "signature",
];

export const STANFORD_STEP_ORDER: StepId[] = [
  "welcome",
  "profile",
  "passkey",
  "whatsapp",
  "instagram",
  "fws",
  "training",
  "gettingPaid",
  "hours",
  "signature",
  "thankYou",
];

export const EXTERNAL_STEP_ORDER: StepId[] = [
  "welcome",
  "profile",
  "passkey",
  "whatsapp",
  "instagram",
  "training",
  "contractorPay",
  "signature",
  "thankYou",
];

export function stepOrderForPayroll(payrollMethod: "stanford" | "external" | undefined): StepId[] {
  return payrollMethod === "external" ? EXTERNAL_STEP_ORDER : STANFORD_STEP_ORDER;
}

export const STEP_HEADLINES: Record<StepId, string> = {
  welcome: "Welcome to Arbor Live",
  profile: "Tell us about yourself",
  passkey: "Secure your account",
  whatsapp: "Join the crew chat",
  instagram: "Follow us on Instagram",
  fws: "Federal Work Study",
  training: "Required training",
  gettingPaid: "Getting hired",
  hours: "Logging your hours",
  contractorPay: "Getting paid as a contractor",
  signature: "Sign your onboarding agreement",
  thankYou: "You're all set!",
};

export const EMPTY_FORM: FormState = {
  name: "",
  email: "",
  phone: "",
  calendarInviteEmail: "",
  showOnPublicCrewPage: false,
  publicCrewDescription: "",
  username: "",
  pronouns: "",
  gradYear: "",
  stanfordPosition: "",
  whatsappAcknowledged: false,
  instagramAcknowledged: false,
  hasFederalWorkStudy: null,
  fwsAcknowledged: false,
  narcanCompleted: false,
  soberMonitorCompleted: false,
  emergencySopsAcknowledged: false,
  crewExpectationsAcknowledged: false,
  liftingCompleted: false,
  hasValidDriversLicense: false,
  cartTrainingCompleted: false,
  studentId: "",
  employmentStartDate: "",
  hasOtherCampusEmployment: null,
  otherCampusEmploymentHours: "",
  i9Acknowledged: false,
  timecardAcknowledged: false,
  contractorPayAcknowledged: false,
  signatureLegalName: "",
  agreedToDoc: false,
};
