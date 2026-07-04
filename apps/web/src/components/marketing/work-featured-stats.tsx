"use client";

export function WorkFeaturedStats({
  stats,
  variant = "light",
}: {
  stats: Array<{ label: string; value: string }>;
  variant?: "light" | "dark";
}) {
  if (!stats.length) return null;

  const isDark = variant === "dark";

  return (
    <div
      className={
        isDark
          ? "mt-8 grid gap-4 border-t border-white/15 pt-8 sm:grid-cols-2 lg:grid-cols-3"
          : "grid gap-4 border-y py-8 sm:grid-cols-2 lg:grid-cols-3"
      }
    >
      {stats.map((stat) => (
        <div
          key={`${stat.label}-${stat.value}`}
          className={isDark ? "rounded-none border border-white/10 bg-white/5 px-4 py-3" : "border px-4 py-3"}
        >
          <p className={isDark ? "text-2xl font-semibold text-white" : "text-2xl font-semibold tracking-tight"}>
            {stat.value}
          </p>
          <p className={isDark ? "mt-1 text-sm text-zinc-300" : "mt-1 text-sm text-muted-foreground"}>
            {stat.label}
          </p>
        </div>
      ))}
    </div>
  );
}
