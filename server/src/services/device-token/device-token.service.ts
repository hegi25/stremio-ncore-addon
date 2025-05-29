import { encodeBase32LowerCaseNoPadding } from '@oslojs/encoding';
import { and, eq } from 'drizzle-orm';
import type { Database } from '@/db';
import type { DeviceToken } from '@/db/schema/device-tokens';
import { deviceTokensTable } from '@/db/schema/device-tokens';
import type { User } from '@/types/user';

export class DeviceTokenService {
  constructor(private db: Database) {}

  private generateDeviceToken(): string {
    const bytes = new Uint8Array(20);
    crypto.getRandomValues(bytes);
    const token = encodeBase32LowerCaseNoPadding(bytes);
    return token;
  }

  public async getDeviceTokensForUser(user: User): Promise<DeviceToken[]> {
    const tokens = await this.db
      .select()
      .from(deviceTokensTable)
      .where(eq(deviceTokensTable.userId, user.id));
    return tokens;
  }

  public async getDeviceTokenDetails(token: string): Promise<DeviceToken | null> {
    const [deviceToken] = await this.db
      .select()
      .from(deviceTokensTable)
      .where(eq(deviceTokensTable.token, token));
    return deviceToken ?? null;
  }

  public async createDeviceToken(user: User, name: string): Promise<DeviceToken> {
    const token = this.generateDeviceToken();
    const [deviceToken] = await this.db
      .insert(deviceTokensTable)
      .values({ token, name, userId: user.id })
      .returning();
    return deviceToken;
  }

  public async deleteDeviceToken(user: User, token: string): Promise<void> {
    await this.db
      .delete(deviceTokensTable)
      .where(
        and(eq(deviceTokensTable.userId, user.id), eq(deviceTokensTable.token, token)),
      );
  }
}
