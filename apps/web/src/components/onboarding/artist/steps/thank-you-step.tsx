import { Button } from "@/components/ui/button";

export function ThankYouStep({ onGoToDashboard }: { onGoToDashboard: () => void }) {
  return (
    <div className="space-y-4 text-sm text-foreground/70">
      <p>Your artist profile is ready. We&apos;ll be in touch about booking!</p>
      <Button onClick={onGoToDashboard}>Go to dashboard</Button>
    </div>
  );
}
