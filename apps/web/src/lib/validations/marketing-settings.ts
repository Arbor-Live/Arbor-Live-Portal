import { z } from "zod";

export const marketingSettingsSchema = z.object({
  openMicMarketingBoost: z.boolean(),
});

export type MarketingSettingsFormValues = z.infer<typeof marketingSettingsSchema>;