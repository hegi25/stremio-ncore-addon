import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { deleteCookie, setCookie } from 'hono/cookie';
import { getUserByCredentials } from '../user/user.utils';
import { useCookieAuth } from './auth.middleware';
import { createSession, generateSessionToken, invalidateSession } from './auth.utils';
import { SESSION_COOKIE_NAME } from './auth.constants';
import { loginSchema } from '@/schemas/login.schema';
import { HttpStatusCode } from '@/types/http';

export const authRoutes = new Hono()
  .basePath('/api')
  .post('/login', zValidator('json', loginSchema), async (c) => {
    const credentials = c.req.valid('json');
    const user = await getUserByCredentials(credentials);
    if (!user) {
      return c.json(
        { success: false, message: 'Incorrect credentials' },
        HttpStatusCode.UNAUTHORIZED,
      );
    }
    const sessionToken = generateSessionToken();
    const session = await createSession(sessionToken, user.id);
    setCookie(c, SESSION_COOKIE_NAME, sessionToken, {
      expires: session.expiresAt,
      httpOnly: true,
      path: '/',
      sameSite: 'Strict',
    });
    return c.json({ success: true, message: undefined });
  })
  .post('/logout', useCookieAuth(), async (c) => {
    const { session } = c.var;
    await invalidateSession(session.id);
    deleteCookie(c, SESSION_COOKIE_NAME);
    return c.newResponse(null, 204);
  });
