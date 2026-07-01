import { PublicEventLifecycleClient } from "@/components/public/public-event-lifecycle-client";

export const metadata = {
  title: "Event quote | Arbor Live",
  description: "Review your Arbor Live event quote, schedule, and approval details.",
};

export default async function PublicEventPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PublicEventLifecycleClient token={token} />;
}
