import { PublicRequestLifecycleClient } from "@/components/public/public-request-lifecycle-client";

export const metadata = {
  title: "Track booking request | Arbor Live",
};

export default async function PublicRequestTrackPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return <PublicRequestLifecycleClient token={token} />;
}
