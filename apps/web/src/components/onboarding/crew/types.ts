import type { StanfordPositionOption } from "@/lib/validations/users";

export type StepId =
  | "welcome"
  | "profile"
  | "passkey"
  | "whatsapp"
  | "instagram"
  | "fws"
  | "training"
  | "gettingPaid"
  | "hours"
  | "contractorPay"
  | "signature"
  | "thankYou";

export type FormState = {
  name: string;
  /** Account email — Boring Avatar seed (not calendar invite). */
  email: string;
  phone: string;
  calendarInviteEmail: string;
  showOnPublicCrewPage: boolean;
  publicCrewDescription: string;
  username: string;
  pronouns: string;
  gradYear: string;
  stanfordPosition: StanfordPositionOption | "";
  whatsappAcknowledged: boolean;
  instagramAcknowledged: boolean;
  hasFederalWorkStudy: boolean | null;
  fwsAcknowledged: boolean;
  narcanCompleted: boolean;
  soberMonitorCompleted: boolean;
  emergencySopsAcknowledged: boolean;
  crewExpectationsAcknowledged: boolean;
  liftingCompleted: boolean;
  hasValidDriversLicense: boolean;
  cartTrainingCompleted: boolean;
  studentId: string;
  /** Pacific date key (`YYYY-MM-DD`) from the start-date input. */
  employmentStartDate: string;
  hasOtherCampusEmployment: boolean | null;
  otherCampusEmploymentHours: string;
  i9Acknowledged: boolean;
  timecardAcknowledged: boolean;
  contractorPayAcknowledged: boolean;
  signatureLegalName: string;
  agreedToDoc: boolean;
};
