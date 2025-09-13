import type { InferSelectModel } from 'drizzle-orm';
import type { z } from 'zod';
import type { Language, Resolution, UserRole, usersTable } from '@/db/schema/users';
import type {
  createUserSchema,
  updateUserSchema,
  updatePasswordSchema,
} from '@/schemas/user.schema';

export class User {
  public id: number;
  public username: string;
  public role: UserRole;
  public preferredLanguage: Language;
  public preferredResolutions: Resolution[];
  public token: string;

  constructor(dbResult: InferSelectModel<typeof usersTable>) {
    this.id = dbResult.id;
    this.username = dbResult.username;
    this.role = dbResult.role;
    this.preferredLanguage = dbResult.preferred_language;
    this.preferredResolutions = dbResult.preferred_resolutions;
    this.token = dbResult.token;
  }
}

export type CreateUserRequest = z.infer<typeof createUserSchema>;

export type UpdateUserRequest = z.infer<typeof updateUserSchema>;

export type UpdatePasswordRequest = z.infer<typeof updatePasswordSchema>;
