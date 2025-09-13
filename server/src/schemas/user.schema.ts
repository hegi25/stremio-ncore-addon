import { z } from 'zod';
import { Language, Resolution } from '@/db/schema/users';

export const createUserSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  preferredLanguage: z.nativeEnum(Language, {
    required_error: 'Preferred language is required',
  }),
  preferredResolutions: z
    .array(z.nativeEnum(Resolution))
    .min(1, 'At least one resolution is required'),
});

export const updateUserSchema = createUserSchema.omit({
  password: true,
});

export const updatePasswordSchema = createUserSchema.pick({
  password: true,
});
