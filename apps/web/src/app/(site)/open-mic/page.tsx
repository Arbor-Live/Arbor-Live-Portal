import { OpenMicWizard } from "@/components/request/open-mic-wizard";

export const metadata = {
  title: "Open Mic sign-up",
  description: "Sign up to perform at the next Arbor Live open mic.",
};

export default async function PublicOpenMicPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string | string[] }>;
}) {
  // `?event=<id>` comes from an event's Lineup tab and pins the sign-up to it.
  const { event } = await searchParams;
  return <OpenMicWizard eventId={typeof event === "string" && event ? event : undefined} />;
}