import type { MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { UserService } from '@/services/user';
import type { HonoEnv } from '@/types/hono-env';
import { HttpStatusCode } from '@/types/http';

export const createDeviceTokenMiddleware =
  (
    userService: UserService,
  ): MiddlewareHandler<HonoEnv, `${string}/:deviceToken${string}`> =>
  async (c, next) => {
    const deviceToken = c.req.param('deviceToken');
    if (!deviceToken) {
      throw new HTTPException(HttpStatusCode.UNAUTHORIZED);
    }
    const user = await userService.getUserByDeviceToken(deviceToken);
    if (!user) {
      throw new HTTPException(HttpStatusCode.UNAUTHORIZED);
    }
    c.set('user', user);
    return next();
  };
