import { PublicPostMortemSection } from "@/components/public/public-post-mortem-section";

export const metadata = {
  title: "Event post-mortem | Arbor Live",
  description: "Share your post-event review for an Arbor Live production.",
};

export default async function PublicPostMortemPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PublicPostMortemSection token={token} />;
}
