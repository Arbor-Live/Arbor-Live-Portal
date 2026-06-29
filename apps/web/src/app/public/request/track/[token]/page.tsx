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

  return (
    <div className="mx-auto min-h-dvh max-w-2xl px-4 py-10">
      <PublicRequestLifecycleClient token={token} />
    </div>
  );
}
