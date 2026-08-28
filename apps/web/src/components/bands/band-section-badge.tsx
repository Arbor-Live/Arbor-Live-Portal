import { Badge } from "@/components/ui/badge";

export function BandVisibilityBadge({ listed }: { listed: boolean }) {
  return (
    <Badge variant={listed ? "default" : "outline"}>
      {listed ? "Public" : "Internal only"}
    </Badge>
  );
}

export function BandArborOnlyBadge() {
  return <Badge variant="secondary">Arbor staff only</Badge>;
}
