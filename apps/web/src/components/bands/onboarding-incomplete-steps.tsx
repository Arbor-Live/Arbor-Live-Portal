export function OnboardingIncompleteStepsList({
  steps,
  compact = false,
}: {
  steps: Array<{ id: string; label: string }>;
  /** Plain list for popovers / dense UI — no amber card chrome. */
  compact?: boolean;
}) {
  if (steps.length === 0) return null;
  if (compact) {
    return (
      <ul className="list-disc space-y-0.5 pl-4 text-sm text-muted-foreground">
        {steps.map((step) => (
          <li key={step.id}>{step.label}</li>
        ))}
      </ul>
    );
  }
  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm">
      <p className="font-medium text-amber-800 dark:text-amber-200">Still missing</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-amber-900/90 dark:text-amber-100/90">
        {steps.map((step) => (
          <li key={step.id}>{step.label}</li>
        ))}
      </ul>
    </div>
  );
}
