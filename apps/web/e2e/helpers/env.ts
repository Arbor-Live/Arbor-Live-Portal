export const e2eEnv = {
  baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
  adminEmail: process.env.E2E_ADMIN_EMAIL ?? "e2e-admin@arborlive.test",
  adminPassword: process.env.E2E_ADMIN_PASSWORD ?? "E2eTestPassword1!",
  adminName: process.env.E2E_ADMIN_NAME ?? "E2E Admin",
  crewEmail: process.env.E2E_CREW_EMAIL ?? "e2e-crew@arborlive.test",
  crewPassword: process.env.E2E_CREW_PASSWORD ?? "E2eTestPassword1!",
  crewName: process.env.E2E_CREW_NAME ?? "E2E Crew",
};
