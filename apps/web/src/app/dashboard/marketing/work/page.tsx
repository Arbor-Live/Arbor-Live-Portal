import { WorkPostsManager } from "@/components/marketing/work-posts-manager";

export default function MarketingWorkPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Work & stories</h1>
        <p className="text-sm text-muted-foreground">
          Manage case studies and blog posts for the public site.
        </p>
      </div>
      <WorkPostsManager />
    </div>
  );
}
