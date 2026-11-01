/** A hash, not a show: the one test behind every surface that treats hashes differently. */
export function isHashEvent(event: { hashingEnabled?: boolean }) {
  return event.hashingEnabled === true;
}
