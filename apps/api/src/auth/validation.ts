import { z } from 'zod';

/** Normalise an email for storage/lookup: trim + lowercase. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Build the register/login validation schemas. Password minimum length is
 * configurable; an upper bound guards against denial-of-service on hashing.
 */
export function buildAuthSchemas(passwordMinLength: number) {
  const registerSchema = z.object({
    email: z.string().trim().min(3).max(255).email(),
    password: z.string().min(passwordMinLength).max(200),
  });

  const loginSchema = z.object({
    email: z.string().trim().min(1).max(255),
    password: z.string().min(1).max(200),
  });

  return { registerSchema, loginSchema };
}
