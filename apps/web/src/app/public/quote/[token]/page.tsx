import { PublicEventLifecycleClient } from "@/components/public/public-event-lifecycle-client";

export default async function PublicQuotePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PublicEventLifecycleClient token={token} />;
}
