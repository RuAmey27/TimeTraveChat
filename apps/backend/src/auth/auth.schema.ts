import { z } from 'zod'

// E.164 phone format: +<country_code><number>, e.g. +919876543210
const phoneRegex = /^\+[1-9]\d{7,14}$/

export const registerSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-zA-Z0-9_]+$/, 'Username may only contain letters, numbers and underscores'),
  email:    z.string().email(),
  phone:    z.string().regex(phoneRegex, 'Phone must be in E.164 format e.g. +919876543210').optional(),
  password: z.string().min(8).max(72),
})

export const loginSchema = z.object({
  email:    z.string().email().optional(),
  phone:    z.string().optional(),
  password: z.string().min(1),
}).refine((d) => d.email || d.phone, {
  message: 'Provide either email or phone to log in',
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput    = z.infer<typeof loginSchema>
