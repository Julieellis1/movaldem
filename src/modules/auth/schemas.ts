import { z } from "zod";

const phoneNg = z.string().regex(/^(\+234|0)[789][01]\d{8}$/);

export const registerSchema = z.object({
  full_name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: phoneNg.optional(),
  password: z.string().min(8).max(128),
  confirmPassword: z.string(),
  church: z.string().optional(),
  age_range: z.string().optional(),
  gender: z.string().optional(),
  // NOTE: zod@4 dropped the zod-3 `errorMap` option on `z.literal` (it is
  // silently ignored, so the message would fall back to "Invalid input:
  // expected true"). The zod-4 equivalent is the flat `{ message }` option.
  consent: z.literal(true, { message: "Consent is required" }),
}).refine((d) => d.password === d.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] });

export const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
export const forgotSchema = z.object({ email: z.string().email() });
export const resetSchema = z.object({ token: z.string(), password: z.string().min(8), confirmPassword: z.string() })
  .refine((d) => d.password === d.confirmPassword, { path: ["confirmPassword"] });
