import { ShortLinksManager } from "@/components/marketing/short-links-manager";

export default function MarketingShortLinksPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Short links</h1>
        <p className="text-sm text-muted-foreground">
          Manage arbor.st redirects. Unknown paths still pass through to arborlive.stanford.edu.
        </p>
      </div>
      <ShortLinksManager />
    </div>
  );
}
