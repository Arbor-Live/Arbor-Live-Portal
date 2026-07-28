import { z } from "zod";

export const profileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120, "Name is too long"),
  phone: z.string().trim().max(40, "Phone is too long").optional(),
  title: z.string().trim().max(120, "Title is too long").optional(),
  pronouns: z.string().trim().max(80, "Pronouns are too long").optional(),
  gradYear: z
    .string()
    .trim()
    .optional()
    .refine(
      (value) =>
        !value ||
        (/^\d{4}$/.test(value) && Number(value) >= 1950 && Number(value) <= 2100),
      { message: "Enter a 4-digit graduation year" },
    ),
  publicCrewDescription: z
    .string()
    .trim()
    .max(280, "Keep your public description to 280 characters")
    .optional(),
  calendarInviteEmail: z
    .string()
    .trim()
    .max(200, "Email is too long")
    .refine((value) => value === "" || z.string().email().safeParse(value).success, {
      message: "Enter a valid email address",
    })
    .optional(),
});

export type ProfileFormValues = z.infer<typeof profileSchema>;

export const changeEmailSchema = z.object({
  newEmail: z.string().email("Enter a valid email address"),
});

export type ChangeEmailFormValues = z.infer<typeof changeEmailSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(8, "Confirm your password"),
    revokeOtherSessions: z.boolean(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;

export const addPasskeySchema = z.object({
  name: z.string().trim().max(80, "Name is too long").optional(),
});

export type AddPasskeyFormValues = z.infer<typeof addPasskeySchema>;
