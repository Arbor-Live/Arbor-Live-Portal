import { ArrowSquareOutIcon, MicrophoneStageIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { OpenMicEventsInbox } from "@/components/events/open-mic-nights-inbox";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Open Mic",
};

export default function OpenMicPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: "/dashboard/events", label: "Events" }}
        title="Open Mic"
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/open-mic" target="_blank" rel="noopener noreferrer">
              <MicrophoneStageIcon />
              Sign-up form
              <ArrowSquareOutIcon className="size-3" />
            </Link>
          </Button>
        }
      />
      <ArborOnlyGuard>
        <OpenMicEventsInbox />
      </ArborOnlyGuard>
    </div>
  );
}
