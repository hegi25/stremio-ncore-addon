import type { Result } from 'neverthrow';
import { err, ok } from 'neverthrow';
import type { ConfigService } from '../config';
import type { DeviceTokenService } from '../device-token';
import type { UserService } from '../user';
import type { CustomManifest } from './types';
import type { AppError } from '@/errors';
import {
  createMissingConfigError,
  createUnauthenticatedError,
  type MissingConfigError,
} from '@/errors';

export class ManifestService {
  constructor(
    private configService: ConfigService,
    private userService: UserService,
    private deviceTokenService: DeviceTokenService,
  ) {}

  public getBaseManifest(): Result<CustomManifest, MissingConfigError> {
    const config = this.configService.getConfig();
    if (config === null) {
      return createMissingConfigError(
        'Missing config in manifest service. Cannot get base manifest.',
      );
    }
    return ok({
      id: 'detarkende.ncore',
      behaviorHints: {
        adult: false,
        configurable: true,
        configurationRequired: true,
      },
      baseUrl: config.addonUrl,
      version: '0.9.0',
      name: 'nCore',
      description: 'Provides streams from a personal nCore account.',
      catalogs: [],
      resources: ['stream'],
      types: ['movie', 'series'],
      idPrefixes: ['tt'],
      logo: `${config.addonUrl}/stremio-ncore-addon-logo-rounded.png`,
    } as const satisfies CustomManifest);
  }

  public async getAuthenticatedManifest(
    deviceToken: string,
  ): Promise<Result<CustomManifest, AppError>> {
    const [user, deviceTokenDetails] = await Promise.all([
      this.userService.getUserByDeviceToken(deviceToken),
      this.deviceTokenService.getDeviceTokenDetails(deviceToken),
    ]);
    if (!user || !deviceTokenDetails) {
      return createUnauthenticatedError('Unauthenticated');
    }
    const baseManifestResult = this.getBaseManifest();
    if (baseManifestResult.isErr()) {
      return err(baseManifestResult.error);
    }
    const baseManifest = baseManifestResult.value;
    return ok({
      ...baseManifest,
      description: `Provides streams from a personal nCore account.\nLogged in as ${user.username}.\nDevice name: ${deviceTokenDetails.name}`,
      behaviorHints: {
        ...baseManifest.behaviorHints,
        configurationRequired: false,
        configurable: false,
      },
    } as const satisfies CustomManifest);
  }
}
