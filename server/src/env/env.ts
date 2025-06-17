import { z } from 'zod';

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce
      .number()
      .default(3000)
      .describe(
        'The port on which the server will listen for HTTP requests (inside the container)',
      ),
    HTTPS_PORT: z.coerce
      .number()
      .default(3443)
      .describe(
        'The port on which the server will listen for HTTPS requests (inside the container)',
      ),
    TORRENT_PORT: z.coerce
      .number()
      .default(6881)
      .describe(
        'The port used for torrent seeding. This is the port that will be used by the torrent client to seed torrents.',
      ),
    DOWNLOAD_WHOLE_FILE_THRESHOLD: z.coerce
      .number()
      .positive()
      .gte(0)
      .lte(1)
      .default(0.2)
      .describe(
        'Threshold for downloading the whole file. If more than this percentage of the file is downloaded, it will be downloaded fully instead of on demand.',
      ),
    ADDON_DIR: z
      .string()
      .describe(
        `The directory where the addon's files (torrents, downloads, and logs) will be placed.`,
      ),
    NCORE_USERNAME: z.string(),
    NCORE_PASSWORD: z.string(),
    TORRENTS_DIR: z
      .string()
      .optional()
      .describe(
        'Directory to store torrent files. By default, it is set to ADDON_DIR/torrents.',
      ),
    DOWNLOADS_DIR: z
      .string()
      .optional()
      .describe(
        'Directory to store downloads. By default, it is set to ADDON_DIR/downloads.',
      ),
    LOGS_DIR: z
      .string()
      .optional()
      .describe('Directory to store log files. By default, it is set to ADDON_DIR/logs.'),
    NCORE_URL: z
      .string()
      .url()
      .default('https://ncore.pro')
      .describe(
        'The URL where nCore can be reached. It is only adjustable, in case the nCore URL changes in the future. Defaults to https://ncore.pro.',
      ),
    CINEMETA_URL: z.string().url().default('https://v3-cinemeta.strem.io'),
    LOCAL_IP_HOSTNAME: z.string().default('local-ip.medicmobile.org'),
    LOCAL_IP_KEYS_URL: z.string().url().default('https://local-ip.medicmobile.org/keys'),
  })
  .transform((env) => {
    return {
      ...env,
      TORRENTS_DIR: env.TORRENTS_DIR ?? `${env.ADDON_DIR}/torrents`,
      DOWNLOADS_DIR: env.DOWNLOADS_DIR ?? `${env.ADDON_DIR}/downloads`,
      LOGS_DIR: env.LOGS_DIR ?? `${env.ADDON_DIR}/logs`,
    };
  });

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);
