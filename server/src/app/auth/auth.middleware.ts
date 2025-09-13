import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import type { MiddlewareHandler } from 'hono';
import { getUserByToken } from '../user/user.utils';
import { SESSION_COOKIE_NAME } from './auth.constants';
import { validateSessionToken } from './auth.utils';
import type { Session } from '@/db/schema/sessions';
import type { User } from '@/types/user';
import { HttpStatusCode } from '@/types/http';
import { UserRole } from '@/db/schema/users';

type CookieAuthEnv = {
  Variables: {
    user: User;
    session: Session;
  };
};

export function useCookieAuth(
  allow: 'anyUser' | 'adminOnly' | 'adminOrSelfOnly' = 'anyUser',
): MiddlewareHandler<CookieAuthEnv, '/:userId'> {
  return createMiddleware<CookieAuthEnv, '/:userId'>(async (c, next) => {
    const cookie = getCookie(c, SESSION_COOKIE_NAME) ?? '';
    const { session, user } = await validateSessionToken(cookie);

    const isAllowed =
      user &&
      session &&
      (allow === 'anyUser' ||
        (allow === 'adminOnly' && user?.role === UserRole.ADMIN) ||
        (allow === 'adminOrSelfOnly' &&
          (user.role === UserRole.ADMIN || user.id === Number(c.req.param('userId')))));

    if (!isAllowed) {
      throw new HTTPException(HttpStatusCode.UNAUTHORIZED);
    }

    c.set('user', user);
    c.set('session', session);
    return next();
  });
}

type UrlTokenAuthEnv = {
  Variables: {
    user: User;
  };
};

export const useUrlTokenAuth = ({ adminOnly } = { adminOnly: false }) =>
  createMiddleware<UrlTokenAuthEnv, '/:token'>(async (c, next) => {
    const { token } = c.req.param();
    const user = await getUserByToken(token);
    if (!user || (adminOnly && user.role !== UserRole.ADMIN)) {
      throw new HTTPException(HttpStatusCode.UNAUTHORIZED);
    }
    c.set('user', user);
    return next();
  });
