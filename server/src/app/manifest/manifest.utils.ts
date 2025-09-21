import type { User } from 'src/types/user';
import type { CustomManifest } from './manifest.types';

export function getManifest({
  user,
  addonUrl,
}: {
  user?: User;
  addonUrl: string;
}): CustomManifest {
  return {
    id: 'detarkende.ncore',
    behaviorHints: {
      adult: false,
      configurable: !user,
      configurationRequired: !user,
    },
    baseUrl: addonUrl,
    version: '0.9.0',
    name: 'nCore',
    description: user
      ? `Provides streams from a personal nCore account.\nLogged in as ${user.username}.`
      : 'Provides streams from a personal nCore account.',
    catalogs: [],
    resources: ['stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    logo: `${addonUrl}/stremio-ncore-addon-logo-rounded.png`,
  };
}
