import { z } from "zod";

export const newsletterSubscribeSchema = z.object({
  website: z.string().max(0).optional(),
  email: z.string().trim().email("Enter a valid email address"),
  name: z.string().trim().max(120).optional(),
});

export type NewsletterSubscribeFormValues = z.infer<typeof newsletterSubscribeSchema>;

export const newsletterSubscribeDefaultValues: NewsletterSubscribeFormValues = {
  website: "",
  email: "",
  name: "",
};
