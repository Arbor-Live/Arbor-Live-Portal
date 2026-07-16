/** Average of Normal and Lead crew rates from Crew Rates settings. */
export function averageCrewHourlyRateUsd(args: {
  normalRateUsd?: number;
  leadRateUsd?: number;
}) {
  const rates = [args.normalRateUsd, args.leadRateUsd].filter(
    (rate): rate is number => rate !== undefined && Number.isFinite(rate) && rate > 0,
  );
  if (rates.length === 0) return undefined;
  return Math.round((rates.reduce((sum, rate) => sum + rate, 0) / rates.length) * 100) / 100;
}
