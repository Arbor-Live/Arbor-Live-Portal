export const e2eEnv = {
  baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
  adminEmail: process.env.E2E_ADMIN_EMAIL ?? "e2e-admin@arborlive.test",
  adminPassword: process.env.E2E_ADMIN_PASSWORD ?? "E2eTestPassword1!",
  adminName: process.env.E2E_ADMIN_NAME ?? "E2E Admin",
  crewEmail: process.env.E2E_CREW_EMAIL ?? "e2e-crew@arborlive.test",
  crewPassword: process.env.E2E_CREW_PASSWORD ?? "E2eTestPassword1!",
  crewName: process.env.E2E_CREW_NAME ?? "E2E Crew",
  /** @handle for comment mentions; keep in sync with `ensureCrewUser`. */
  crewUsername: process.env.E2E_CREW_USERNAME ?? "e2e_crew",
  bandEmail: process.env.E2E_BAND_EMAIL ?? "e2e-band@arborlive.test",
  bandPassword: process.env.E2E_BAND_PASSWORD ?? "E2eTestPassword1!",
  bandName: process.env.E2E_BAND_NAME ?? "E2E Band Payee",
  bandOrgName: process.env.E2E_BAND_ORG_NAME ?? "E2E Test Band",
};
