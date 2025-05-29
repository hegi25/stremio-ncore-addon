import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { ok, type Result } from 'neverthrow';
import { PASSWORD_SALT_ROUNDS } from './constants';
import type { LoginCredentials } from '@/schemas/login.schema';
import type { Database } from '@/db';
import { UserRole, usersTable } from '@/db/schema/users';
import { deviceTokensTable } from '@/db/schema/device-tokens';
import type { Transaction } from '@/db/client';
import type { CreateUserRequest, EditUserRequest } from '@/types/user';
import { User } from '@/types/user';
import type { AppError } from '@/errors';
import { createUnauthorizedError, createUserServiceError } from '@/errors';

export class UserService {
  constructor(private db: Database) {}

  public async getUserByDeviceToken(deviceToken: string): Promise<User | null> {
    const [{ users: user }] = await this.db
      .select()
      .from(deviceTokensTable)
      .leftJoin(usersTable, eq(deviceTokensTable.userId, usersTable.id))
      .where(eq(deviceTokensTable.token, deviceToken));
    if (!user) {
      return null;
    }
    return new User(user);
  }

  public async getUserByCredentials(credentials: LoginCredentials): Promise<User | null> {
    const [userFromDb] = await this.db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, credentials.username));
    const isPasswordCorrect = await bcrypt.compare(
      credentials.password,
      userFromDb?.passwordHash ?? '',
    );

    if (!userFromDb || !isPasswordCorrect) {
      return null;
    }
    return new User(userFromDb);
  }

  public async createUser(
    userDetails: CreateUserRequest,
    tx: Transaction | Database = this.db,
    role = UserRole.USER,
  ): Promise<User> {
    const { username, password, preferredLanguage, preferredResolutions } = userDetails;
    const passwordHash = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);

    const [userFromDb] = await tx
      .insert(usersTable)
      .values({
        role,
        username,
        passwordHash,
        preferred_language: preferredLanguage,
        preferred_resolutions: preferredResolutions,
      })
      .returning();
    return new User(userFromDb);
  }

  public async updateUser(userId: number, userDetails: EditUserRequest): Promise<User> {
    const { username, preferredLanguage, preferredResolutions } = userDetails;
    const [updatedUser] = await this.db
      .update(usersTable)
      .set({
        username,
        preferred_language: preferredLanguage,
        preferred_resolutions: preferredResolutions,
      })
      .where(eq(usersTable.id, userId))
      .returning();
    return new User(updatedUser);
  }

  public async updateUserPassword(userId: number, newPassword: string): Promise<User> {
    const passwordHash = await bcrypt.hash(newPassword, PASSWORD_SALT_ROUNDS);
    const [updatedUser] = await this.db
      .update(usersTable)
      .set({
        passwordHash,
      })
      .where(eq(usersTable.id, userId))
      .returning();
    return new User(updatedUser);
  }

  public async getAllUsers() {
    const usersResult = await this.db.select().from(usersTable);
    return usersResult;
  }

  public async deleteUser(userId: number): Promise<Result<void, AppError>> {
    const [user] = await this.db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    if (!user) {
      return createUserServiceError('User not found for deletion', {
        userId,
      });
    }
    if (user.role === UserRole.ADMIN) {
      return createUnauthorizedError('Cannot delete admin user');
    }
    await this.db.delete(usersTable).where(eq(usersTable.id, userId));
    return ok();
  }
}
