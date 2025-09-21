import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { db } from 'src/db';
import { usersTable } from 'src/db/schema/users';
import { User } from 'src/types/user';
import {
  createUserSchema,
  updatePasswordSchema,
  updateUserSchema,
} from 'src/schemas/user.schema';
import { HttpStatusCode } from 'src/types/http';
import { logger } from 'src/logger';
import { useCookieAuth } from '../auth/auth.middleware';
import { userFromUrlExists } from './user.middleware';
import {
  createUserRequestToInsertStatement,
  generateRandomToken,
  hashPassword,
  updateUserRequestToUpdateStatement,
} from './user.utils';

export const userRoutes = new Hono()
  .basePath('/api/users')
  .get('/', useCookieAuth('adminOnly'), (c) => {
    const users = db.select().from(usersTable).all();
    return c.json(users.map((u) => new User(u)));
  })
  .get('/me', useCookieAuth(), (c) => {
    return c.json(c.var.user);
  })
  .post(
    '/',
    useCookieAuth('adminOnly'),
    zValidator('json', createUserSchema),
    async (c) => {
      const userData = c.req.valid('json');
      const existingUser = db
        .select()
        .from(usersTable)
        .where(eq(usersTable.username, userData.username))
        .limit(1)
        .get();
      if (existingUser) {
        return c.json(
          { success: false, message: 'Username is already taken.' },
          HttpStatusCode.BAD_REQUEST,
        );
      }
      try {
        const [createdUser] = await db
          .insert(usersTable)
          .values(
            await createUserRequestToInsertStatement({ user: userData, isAdmin: false }),
          )
          .returning();
        return c.json(new User(createdUser));
      } catch (error) {
        logger.error(error, 'Error creating user');
        return c.json(
          { success: false, message: 'Failed to create user.' },
          HttpStatusCode.INTERNAL_SERVER_ERROR,
        );
      }
    },
  )
  .put(
    '/:userId',
    useCookieAuth('adminOrSelfOnly'),
    zValidator('json', updateUserSchema),
    userFromUrlExists(),
    async (c) => {
      const { userFromUrl } = c.var;
      const userDetails = c.req.valid('json');
      try {
        const [updatedUser] = await db
          .update(usersTable)
          .set(updateUserRequestToUpdateStatement(userDetails))
          .where(eq(usersTable.id, userFromUrl.id))
          .returning();
        return c.json(new User(updatedUser));
      } catch (error) {
        logger.error(error, 'Error updating user');
        return c.json(
          { message: 'Failed to update user.' },
          HttpStatusCode.INTERNAL_SERVER_ERROR,
        );
      }
    },
  )
  .put(
    '/:userId/password',
    useCookieAuth('adminOrSelfOnly'),
    zValidator('json', updatePasswordSchema),
    userFromUrlExists(),
    async (c) => {
      const { userFromUrl } = c.var;
      const { password } = c.req.valid('json');
      try {
        await db
          .update(usersTable)
          .set({
            passwordHash: await hashPassword(password),
          })
          .where(eq(usersTable.id, userFromUrl.id));
        return c.json({ message: 'Password updated successfully' });
      } catch (error) {
        logger.error(error, 'Error updating user password');
        return c.json(
          { message: 'Failed to update password.' },
          HttpStatusCode.INTERNAL_SERVER_ERROR,
        );
      }
    },
  )
  .put(
    '/:userId/token',
    useCookieAuth('adminOrSelfOnly'),
    userFromUrlExists(),
    async (c) => {
      const { userFromUrl } = c.var;
      try {
        const newToken = generateRandomToken();
        await db
          .update(usersTable)
          .set({
            token: newToken,
            token_rotated_at: new Date(),
          })
          .where(eq(usersTable.id, userFromUrl.id));
        return c.json({ apiToken: newToken });
      } catch (error) {
        logger.error(error, 'Error rotating user token');
        return c.json(
          { message: 'Failed to rotate user token.' },
          HttpStatusCode.INTERNAL_SERVER_ERROR,
        );
      }
    },
  )
  .delete('/:userId', useCookieAuth('adminOnly'), userFromUrlExists(), async (c) => {
    const { userFromUrl } = c.var;
    try {
      await db.delete(usersTable).where(eq(usersTable.id, userFromUrl.id));
      return c.json({ message: 'User deleted successfully' });
    } catch (error) {
      logger.error(error, 'Error deleting user');
      return c.json(
        { message: 'Failed to delete user.' },
        HttpStatusCode.INTERNAL_SERVER_ERROR,
      );
    }
  });
