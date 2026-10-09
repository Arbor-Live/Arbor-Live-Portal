import { Button } from "@/components/ui/button";

export function ThankYouStep({ onGoToDashboard }: { onGoToDashboard: () => void }) {
  return (
    <div className="space-y-4 text-sm text-foreground/70">
      <p>Welcome to the crew! Your onboarding is complete.</p>
      <Button onClick={onGoToDashboard}>Go to dashboard</Button>
    </div>
  );
}
