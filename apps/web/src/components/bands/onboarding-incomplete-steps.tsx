export function OnboardingIncompleteStepsList({
  steps,
}: {
  steps: Array<{ id: string; label: string }>;
}) {
  if (steps.length === 0) return null;
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
