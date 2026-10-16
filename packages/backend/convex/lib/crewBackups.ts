import type { LegacyResponseStatus } from "./crewNights";

type AvailabilityResponse = { userId: string; responseStatus: LegacyResponseStatus };

/** People who answered "only if necessary" (a Backup night) for an event. */
export function backupUserIdsFrom(responses: AvailabilityResponse[]) {
  return new Set(
    responses
      .filter((response) => response.responseStatus === "only_if_necessary")
      .map((response) => response.userId),
  );
}

/** Backups for one event, for callers that haven't loaded its answers. */
export { loadBackupUserIds } from "./crewNightAnswers";
